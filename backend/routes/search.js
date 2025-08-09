const express = require('express');
const Joi = require('joi');
const pool = require('../database.js');
const { authenticateToken } = require('../middleware.js');

const router = express.Router();
router.use(authenticateToken);

// Search validation schema
const searchSchema = Joi.object({
  query: Joi.string().min(1).max(500).required(),
  type: Joi.string().valid('all', 'companies', 'contacts', 'deals').default('all'),
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0),
  filters: Joi.object({
    industry: Joi.string().optional(),
    deal_stage: Joi.string().optional(),
    company_size: Joi.string().optional(),
    date_range: Joi.object({
      start: Joi.date().optional(),
      end: Joi.date().optional()
    }).optional()
  }).optional()
});

// Global search endpoint with improved error handling
router.post('/global', async (req, res) => {
  try {
    console.log('🔍 Search request received:', req.body);
    
    const { error, value } = searchSchema.validate(req.body);
    if (error) {
      console.log('❌ Validation error:', error.details[0].message);
      return res.status(400).json({
        error: 'Validation Error',
        details: error.details[0].message
      });
    }

    const { query, type, limit, offset, filters = {} } = value;
    console.log('✅ Search params validated:', { query, type, limit, offset });

    // Sanitize search query for PostgreSQL
    const searchQuery = query.trim()
      .replace(/[^\w\s]/g, ' ')  // Remove special characters
      .split(/\s+/)
      .filter(word => word.length > 0)
      .join(' & ');

    if (!searchQuery) {
      console.log('⚠️ Empty search query after sanitization');
      return res.json({
        query: query,
        total_results: 0,
        results: { companies: [], contacts: [], deals: [] },
        search_type: type
      });
    }

    console.log('🔎 Sanitized search query:', searchQuery);

    let results = {};

    // Search companies with error handling
    if (type === 'all' || type === 'companies') {
      try {
        console.log('🏢 Searching companies...');
        results.companies = await searchCompanies(searchQuery, filters, limit, offset);
        console.log('✅ Companies found:', results.companies.length);
      } catch (companyError) {
        console.error('❌ Company search error:', companyError);
        results.companies = [];
      }
    }

    // Search contacts with error handling
    if (type === 'all' || type === 'contacts') {
      try {
        console.log('👤 Searching contacts...');
        results.contacts = await searchContacts(searchQuery, filters, limit, offset);
        console.log('✅ Contacts found:', results.contacts.length);
      } catch (contactError) {
        console.error('❌ Contact search error:', contactError);
        results.contacts = [];
      }
    }

    // Search deals with error handling
    if (type === 'all' || type === 'deals') {
      try {
        console.log('💼 Searching deals...');
        results.deals = await searchDeals(searchQuery, filters, limit, offset);
        console.log('✅ Deals found:', results.deals.length);
      } catch (dealError) {
        console.error('❌ Deal search error:', dealError);
        results.deals = [];
      }
    }

    // Calculate total results
    const totalResults = Object.values(results).reduce((sum, items) => sum + (items?.length || 0), 0);
    console.log('🎯 Total search results:', totalResults);

    res.json({
      query: query,
      total_results: totalResults,
      results,
      search_type: type
    });

  } catch (error) {
    console.error('💥 Global search error:', error);
    res.status(500).json({
      error: 'Search service temporarily unavailable',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Improved company search with fallback
async function searchCompanies(searchQuery, filters, limit, offset) {
  try {
    // Try full-text search first
    console.log('🔍 Attempting full-text search for companies...');
    let query = `
      SELECT c.*, 
             ts_rank(c.search_vector, to_tsquery('english', $1)) as rank,
             COUNT(co.id) as contact_count,
             COUNT(d.id) as deal_count,
             COALESCE(SUM(d.value), 0) as total_deal_value
      FROM companies c
      LEFT JOIN contacts co ON c.id = co.company_id
      LEFT JOIN deals d ON c.id = d.company_id AND d.status = 'open'
      WHERE c.search_vector @@ to_tsquery('english', $1)
    `;

    const params = [searchQuery];
    let paramIndex = 2;

    // Apply filters
    if (filters.industry) {
      query += ` AND c.industry = $${paramIndex}`;
      params.push(filters.industry);
      paramIndex++;
    }

    if (filters.company_size) {
      query += ` AND c.size_category = $${paramIndex}`;
      params.push(filters.company_size);
      paramIndex++;
    }

    query += `
      GROUP BY c.id
      ORDER BY rank DESC, c.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await pool.query(query, params);
    console.log('✅ Full-text search successful, found:', result.rows.length);
    return result.rows;

  } catch (fullTextError) {
    console.log('⚠️ Full-text search failed, falling back to LIKE search:', fullTextError.message);
    
    // Fallback to simple LIKE search
    try {
      const words = searchQuery.split(' & ');
      const likeQuery = `%${words[0]}%`;
      
      const fallbackQuery = `
        SELECT c.*, 0 as rank,
               COUNT(co.id) as contact_count,
               COUNT(d.id) as deal_count,
               COALESCE(SUM(d.value), 0) as total_deal_value
        FROM companies c
        LEFT JOIN contacts co ON c.id = co.company_id
        LEFT JOIN deals d ON c.id = d.company_id AND d.status = 'open'
        WHERE LOWER(c.name) LIKE LOWER($1) 
           OR LOWER(c.industry) LIKE LOWER($1)
           OR LOWER(c.city) LIKE LOWER($1)
        GROUP BY c.id
        ORDER BY c.created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await pool.query(fallbackQuery, [likeQuery, limit, offset]);
      console.log('✅ Fallback search successful, found:', result.rows.length);
      return result.rows;

    } catch (fallbackError) {
      console.error('❌ Fallback search also failed:', fallbackError);
      return [];
    }
  }
}

// Improved contact search with fallback
async function searchContacts(searchQuery, filters, limit, offset) {
  try {
    console.log('🔍 Attempting full-text search for contacts...');
    let query = `
      SELECT ct.*, 
             c.name as company_name,
             c.industry as company_industry,
             ts_rank(ct.search_vector, to_tsquery('english', $1)) as rank
      FROM contacts ct
      LEFT JOIN companies c ON ct.company_id = c.id
      WHERE ct.search_vector @@ to_tsquery('english', $1)
    `;

    const params = [searchQuery];
    let paramIndex = 2;

    if (filters.industry) {
      query += ` AND c.industry = $${paramIndex}`;
      params.push(filters.industry);
      paramIndex++;
    }

    query += `
      ORDER BY rank DESC, ct.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await pool.query(query, params);
    console.log('✅ Contact full-text search successful, found:', result.rows.length);
    return result.rows;

  } catch (fullTextError) {
    console.log('⚠️ Contact full-text search failed, falling back:', fullTextError.message);
    
    try {
      const words = searchQuery.split(' & ');
      const likeQuery = `%${words[0]}%`;
      
      const fallbackQuery = `
        SELECT ct.*, c.name as company_name, c.industry as company_industry, 0 as rank
        FROM contacts ct
        LEFT JOIN companies c ON ct.company_id = c.id
        WHERE LOWER(ct.first_name) LIKE LOWER($1)
           OR LOWER(ct.last_name) LIKE LOWER($1)
           OR LOWER(ct.email) LIKE LOWER($1)
           OR LOWER(ct.job_title) LIKE LOWER($1)
        ORDER BY ct.created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await pool.query(fallbackQuery, [likeQuery, limit, offset]);
      console.log('✅ Contact fallback search successful, found:', result.rows.length);
      return result.rows;

    } catch (fallbackError) {
      console.error('❌ Contact fallback search failed:', fallbackError);
      return [];
    }
  }
}

// Improved deal search with fallback
async function searchDeals(searchQuery, filters, limit, offset) {
  try {
    console.log('🔍 Attempting full-text search for deals...');
    let query = `
      SELECT d.*, 
             c.name as company_name,
             ps.name as stage_name,
             ct.first_name || ' ' || ct.last_name as contact_name,
             ts_rank(d.search_vector, to_tsquery('english', $1)) as rank
      FROM deals d
      LEFT JOIN companies c ON d.company_id = c.id
      LEFT JOIN contacts ct ON d.contact_id = ct.id
      LEFT JOIN pipeline_stages ps ON d.pipeline_stage_id = ps.id
      WHERE d.search_vector @@ to_tsquery('english', $1)
    `;

    const params = [searchQuery];
    let paramIndex = 2;

    if (filters.deal_stage) {
      query += ` AND ps.name = $${paramIndex}`;
      params.push(filters.deal_stage);
      paramIndex++;
    }

    if (filters.date_range?.start) {
      query += ` AND d.created_at >= $${paramIndex}`;
      params.push(filters.date_range.start);
      paramIndex++;
    }

    if (filters.date_range?.end) {
      query += ` AND d.created_at <= $${paramIndex}`;
      params.push(filters.date_range.end);
      paramIndex++;
    }

    query += `
      ORDER BY rank DESC, d.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await pool.query(query, params);
    console.log('✅ Deal full-text search successful, found:', result.rows.length);
    return result.rows;

  } catch (fullTextError) {
    console.log('⚠️ Deal full-text search failed, falling back:', fullTextError.message);
    
    try {
      const words = searchQuery.split(' & ');
      const likeQuery = `%${words[0]}%`;
      
      const fallbackQuery = `
        SELECT d.*, c.name as company_name, ps.name as stage_name,
               ct.first_name || ' ' || ct.last_name as contact_name, 0 as rank
        FROM deals d
        LEFT JOIN companies c ON d.company_id = c.id
        LEFT JOIN contacts ct ON d.contact_id = ct.id
        LEFT JOIN pipeline_stages ps ON d.pipeline_stage_id = ps.id
        WHERE LOWER(d.title) LIKE LOWER($1)
           OR LOWER(d.description) LIKE LOWER($1)
        ORDER BY d.created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await pool.query(fallbackQuery, [likeQuery, limit, offset]);
      console.log('✅ Deal fallback search successful, found:', result.rows.length);
      return result.rows;

    } catch (fallbackError) {
      console.error('❌ Deal fallback search failed:', fallbackError);
      return [];
    }
  }
}

// Search suggestions with improved error handling
router.get('/suggestions', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query || query.length < 2) {
      return res.json({ suggestions: [] });
    }

    console.log('💡 Generating suggestions for:', query);

    // Simple LIKE search for suggestions (more reliable than full-text)
    const likeQuery = `%${query}%`;

    const [companies, contacts, deals] = await Promise.all([
      pool.query(`
        SELECT 'company' as type, name as suggestion, id
        FROM companies 
        WHERE LOWER(name) LIKE LOWER($1)
        ORDER BY name
        LIMIT 5
      `, [likeQuery]).catch(() => ({ rows: [] })),
      
      pool.query(`
        SELECT 'contact' as type, 
               first_name || ' ' || last_name as suggestion, 
               id
        FROM contacts 
        WHERE LOWER(first_name) LIKE LOWER($1) 
           OR LOWER(last_name) LIKE LOWER($1)
        ORDER BY first_name, last_name
        LIMIT 5
      `, [likeQuery]).catch(() => ({ rows: [] })),
      
      pool.query(`
        SELECT 'deal' as type, title as suggestion, id
        FROM deals 
        WHERE LOWER(title) LIKE LOWER($1)
        ORDER BY title
        LIMIT 5
      `, [likeQuery]).catch(() => ({ rows: [] }))
    ]);

    const suggestions = [
      ...companies.rows,
      ...contacts.rows,
      ...deals.rows
    ].slice(0, 10);

    console.log('✅ Generated suggestions:', suggestions.length);
    res.json({ suggestions });

  } catch (error) {
    console.error('❌ Search suggestions error:', error);
    res.status(500).json({ error: 'Suggestions service unavailable' });
  }
});

// Search analytics (unchanged, already working)
router.get('/analytics', async (req, res) => {
  try {
    const [stats] = await Promise.all([
      pool.query(`
        SELECT 
          (SELECT COUNT(*) FROM companies) as total_companies,
          (SELECT COUNT(*) FROM contacts) as total_contacts,
          (SELECT COUNT(*) FROM deals) as total_deals,
          (SELECT COUNT(DISTINCT industry) FROM companies WHERE industry IS NOT NULL) as unique_industries,
          (SELECT COUNT(DISTINCT pipeline_stage_id) FROM deals) as unique_stages
      `)
    ]);

    res.json({
      search_analytics: stats.rows[0],
      last_updated: new Date().toISOString()
    });

  } catch (error) {
    console.error('Search analytics error:', error);
    res.status(500).json({ error: 'Analytics service unavailable' });
  }
});

module.exports = router;