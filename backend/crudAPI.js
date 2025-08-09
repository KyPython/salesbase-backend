const express = require('express');
const Joi = require('joi');
const pool = require('./database.js'); // ✅ Fixed: should be './database.js' not '../database.js'
const { authenticateToken, authorizeRoles, auditLog } = require('./middleware.js'); // ✅ Fixed: removed /auth

const router = express.Router();

// IMMEDIATE DEBUG - This should always log
console.log('🚀 CRUD API Router module loaded at:', new Date().toISOString());

// Add debugging middleware to see all requests to this router
router.use((req, res, next) => {
  console.log('🔍 CRUD Router middleware hit:', req.method, req.path, 'Original URL:', req.originalUrl);
  next();
});

// Test route to verify router is working
router.get('/test', (req, res) => {
  console.log('🧪 Test route hit!');
  res.json({ message: 'CRUD API router is working!', timestamp: new Date().toISOString() });
});

// Simple health check without auth
router.get('/health', (req, res) => {
  console.log('❤️ Health check hit!');
  res.json({ status: 'healthy', message: 'CRUD router is responding' });
});

// Test POST route without auth for debugging
router.post('/test-post', (req, res) => {
  console.log('🧪 Test POST route hit with body:', req.body);
  res.json({ message: 'POST test successful', receivedData: req.body });
});

// Test contacts route without auth for debugging
router.get('/contacts-test', async (req, res) => {
  console.log('🧪 Contacts test route hit!');
  try {
    const result = await pool.query('SELECT COUNT(*) as count FROM contacts');
    res.json({ 
      message: 'Contacts test successful!', 
      contactCount: result.rows[0].count 
    });
  } catch (error) {
    console.error('❌ Contacts test error:', error);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
});

// Apply authentication to all routes
router.use((req, res, next) => {
  console.log('🔐 Auth middleware hit for:', req.method, req.path);
  authenticateToken(req, res, next);
});

// Validation schema
const companySchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  website: Joi.string().uri().allow('').optional(),
  industry: Joi.string().max(100).allow('').optional(),
  size_category: Joi.string().valid('startup', 'small', 'medium', 'enterprise').optional(),
  annual_revenue: Joi.number().positive().allow(null).optional(),
  address_line1: Joi.string().max(255).allow('').optional(),
  address_line2: Joi.string().max(255).allow('').optional(),
  city: Joi.string().max(100).allow('').optional(),
  state: Joi.string().max(100).allow('').optional(),
  postal_code: Joi.string().max(20).allow('').optional(),
  country: Joi.string().max(100).allow('').optional()
});

// ============================================
// CUSTOMERS/CONTACTS CRUD OPERATIONS  
// ============================================

// Alias routes for customers (mapping to contacts)
router.get('/customers', async (req, res) => {
  console.log('🔄 Redirecting /customers to /contacts');
  req.url = '/contacts';
  return router.handle(req, res);
});

router.post('/customers', auditLog('CREATE', 'contacts'), async (req, res) => {
  console.log('📝 POST /customers route hit (redirecting to contacts logic)');
  console.log('📝 Request body:', req.body);
  
  try {
    const { error, value } = contactSchema.validate(req.body);
    if (error) {
      console.log('❌ Validation error:', error.details[0].message);
      return res.status(400).json({
        error: 'Validation Error',
        details: error.details[0].message
      });
    }
    
    console.log('✅ Validation passed, creating customer/contact with data:', value);

    const columns = Object.keys(value);
    const values = Object.values(value);
    const placeholders = values.map((_, index) => `$${index + 1}`);

    const query = `
      INSERT INTO contacts (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
      RETURNING *
    `;

    console.log('🔍 Executing create customer query:', query, 'with values:', values);
    const result = await pool.query(query, values);

    console.log('✅ Customer/contact created successfully:', result.rows[0]);
    res.status(201).json({
      message: 'Customer created successfully',
      customer: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Create customer error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// ============================================
// CONTACTS CRUD OPERATIONS  
// ============================================

// Validation schema for contacts
const contactSchema = Joi.object({
  company_id: Joi.number().integer().positive().allow(null).optional(),
  first_name: Joi.string().min(2).max(100).required(),
  last_name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().allow('').optional(),
  phone: Joi.string().max(50).allow('').optional(),
  job_title: Joi.string().max(150).allow('').optional(),
  department: Joi.string().max(100).allow('').optional(),
  is_primary: Joi.boolean().default(false)
});

// Get all contacts
router.get('/contacts', async (req, res) => {
  console.log('🔍 GET /contacts route hit with query:', req.query);
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const companyId = req.query.company_id || '';

    let query = `
      SELECT ct.*, 
             c.name as company_name,
             c.industry as company_industry
      FROM contacts ct
      LEFT JOIN companies c ON ct.company_id = c.id
    `;

    const params = [];
    const conditions = [];

    if (search) {
      conditions.push(`(ct.first_name ILIKE $${params.length + 1} OR ct.last_name ILIKE $${params.length + 1} OR ct.email ILIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }

    if (companyId) {
      conditions.push(`ct.company_id = $${params.length + 1}`);
      params.push(companyId);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += `
      ORDER BY ct.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    params.push(limit, offset);
    console.log('🔍 Executing contacts query:', query, 'with params:', params);
    const result = await pool.query(query, params);
    console.log('📊 Raw contact data from database:', result.rows);

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) FROM contacts ct LEFT JOIN companies c ON ct.company_id = c.id';
    const countParams = [];

    if (conditions.length > 0) {
      countQuery += ` WHERE ${conditions.join(' AND ')}`;
      countParams.push(...params.slice(0, params.length - 2)); // Remove limit and offset
    }

    console.log('🔍 Executing count query:', countQuery, 'with params:', countParams);
    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);

    const response = {
      contacts: result.rows,
      pagination: {
        current_page: page,
        total_pages: totalPages,
        total_count: totalCount,
        limit
      }
    };
    
    console.log('📊 Contacts response:', {
      contactCount: result.rows.length,
      totalCount,
      totalPages,
      currentPage: page,
      sampleContact: result.rows[0] || 'No contacts found'
    });
    
    res.json(response);
  } catch (error) {
    console.error('❌ Get contacts error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Get single contact by ID
router.get('/contacts/:id', async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    
    if (isNaN(contactId)) {
      return res.status(400).json({
        error: 'Invalid contact ID'
      });
    }

    const result = await pool.query(`
      SELECT ct.*, 
             c.name as company_name,
             c.website as company_website,
             c.industry as company_industry
      FROM contacts ct
      LEFT JOIN companies c ON ct.company_id = c.id
      WHERE ct.id = $1
    `, [contactId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Contact not found'
      });
    }

    res.json({
      contact: result.rows[0]
    });
  } catch (error) {
    console.error('Get contact error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Create contact
router.post('/contacts', auditLog('CREATE', 'contacts'), async (req, res) => {
  console.log('📝 POST /contacts route hit with body:', req.body);
  try {
    const { error, value } = contactSchema.validate(req.body);
    if (error) {
      console.log('❌ Validation error:', error.details[0].message);
      return res.status(400).json({
        error: 'Validation Error',
        details: error.details[0].message
      });
    }
    
    console.log('✅ Validation passed, creating contact with data:', value);

    const columns = Object.keys(value);
    const values = Object.values(value);
    const placeholders = values.map((_, index) => `$${index + 1}`);

    const query = `
      INSERT INTO contacts (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
      RETURNING *
    `;

    console.log('🔍 Executing create contact query:', query, 'with values:', values);
    const result = await pool.query(query, values);

    console.log('✅ Contact created successfully:', result.rows[0]);
    res.status(201).json({
      message: 'Contact created successfully',
      contact: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Create contact error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Update contact
router.put('/contacts/:id', auditLog('UPDATE', 'contacts'), async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    
    if (isNaN(contactId)) {
      return res.status(400).json({
        error: 'Invalid contact ID'
      });
    }

    const { error, value } = contactSchema.validate(req.body, { allowUnknown: false });
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        details: error.details[0].message
      });
    }

    // Check if contact exists
    const existingContact = await pool.query(
      'SELECT id FROM contacts WHERE id = $1',
      [contactId]
    );

    if (existingContact.rows.length === 0) {
      return res.status(404).json({
        error: 'Contact not found'
      });
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    Object.entries(value).forEach(([key, val]) => {
      if (val !== undefined) {
        updates.push(`${key} = $${paramIndex}`);
        values.push(val);
        paramIndex++;
      }
    });

    if (updates.length === 0) {
      return res.status(400).json({
        error: 'No valid fields to update'
      });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(contactId);

    const query = `
      UPDATE contacts 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    res.json({
      message: 'Contact updated successfully',
      contact: result.rows[0]
    });
  } catch (error) {
    console.error('Update contact error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Delete contact
router.delete('/contacts/:id', authorizeRoles('admin', 'manager'), auditLog('DELETE', 'contacts'), async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    
    if (isNaN(contactId)) {
      return res.status(400).json({
        error: 'Invalid contact ID'
      });
    }

    const result = await pool.query(
      'DELETE FROM contacts WHERE id = $1 RETURNING *',
      [contactId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Contact not found'
      });
    }

    res.json({
      message: 'Contact deleted successfully',
      contact: result.rows[0]
    });
  } catch (error) {
    console.error('Delete contact error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// ============================================
// DEALS CRUD OPERATIONS
// ============================================

const dealSchema = Joi.object({
  title: Joi.string().min(2).max(255).required(),
  company_id: Joi.number().integer().positive().required(),
  contact_id: Joi.number().integer().positive().optional(),
  assigned_user_id: Joi.number().integer().positive().optional(),
  pipeline_stage_id: Joi.number().integer().positive().required(),
  value: Joi.number().positive().allow(null).optional(),
  currency: Joi.string().length(3).default('USD'),
  expected_close_date: Joi.date().optional(),
  probability: Joi.number().min(0).max(1).optional(),
  description: Joi.string().allow('').optional()
});

// Get all deals
router.get('/deals', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT d.*, 
             c.name as company_name,
             ps.name as stage_name,
             u.first_name || ' ' || u.last_name as assigned_user_name
      FROM deals d
      LEFT JOIN companies c ON d.company_id = c.id
      LEFT JOIN pipeline_stages ps ON d.pipeline_stage_id = ps.id
      LEFT JOIN users u ON d.assigned_user_id = u.id
      ORDER BY d.created_at DESC
    `);

    res.json({ deals: result.rows });
  } catch (error) {
    console.error('Get deals error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single deal by ID
router.get('/deals/:id', async (req, res) => {
  try {
    const dealId = parseInt(req.params.id);
    
    if (isNaN(dealId)) {
      return res.status(400).json({
        error: 'Invalid deal ID'
      });
    }

    const result = await pool.query(`
      SELECT d.*, 
             c.name as company_name,
             c.industry as company_industry,
             ct.first_name || ' ' || ct.last_name as contact_name,
             ct.email as contact_email,
             ps.name as stage_name,
             ps.win_probability as stage_probability,
             u.first_name || ' ' || u.last_name as assigned_user_name
      FROM deals d
      LEFT JOIN companies c ON d.company_id = c.id
      LEFT JOIN contacts ct ON d.contact_id = ct.id
      LEFT JOIN pipeline_stages ps ON d.pipeline_stage_id = ps.id
      LEFT JOIN users u ON d.assigned_user_id = u.id
      WHERE d.id = $1
    `, [dealId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Deal not found'
      });
    }

    res.json({
      deal: result.rows[0]
    });
  } catch (error) {
    console.error('Get deal error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Create deal
router.post('/deals', auditLog('CREATE', 'deals'), async (req, res) => {
  try {
    const { error, value } = dealSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        details: error.details[0].message
      });
    }

    const columns = Object.keys(value);
    const values = Object.values(value);
    const placeholders = values.map((_, index) => `$${index + 1}`);

    const query = `
      INSERT INTO deals (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
      RETURNING *
    `;

    const result = await pool.query(query, values);

    res.status(201).json({
      message: 'Deal created successfully',
      deal: result.rows[0]
    });
  } catch (error) {
    console.error('Create deal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update deal
router.put('/deals/:id', auditLog('UPDATE', 'deals'), async (req, res) => {
  try {
    const dealId = parseInt(req.params.id);
    
    if (isNaN(dealId)) {
      return res.status(400).json({
        error: 'Invalid deal ID'
      });
    }

    const { error, value } = dealSchema.validate(req.body, { allowUnknown: false });
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        details: error.details[0].message
      });
    }

    // Check if deal exists
    const existingDeal = await pool.query(
      'SELECT id FROM deals WHERE id = $1',
      [dealId]
    );

    if (existingDeal.rows.length === 0) {
      return res.status(404).json({
        error: 'Deal not found'
      });
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    Object.entries(value).forEach(([key, val]) => {
      if (val !== undefined) {
        updates.push(`${key} = $${paramIndex}`);
        values.push(val);
        paramIndex++;
      }
    });

    if (updates.length === 0) {
      return res.status(400).json({
        error: 'No valid fields to update'
      });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(dealId);

    const query = `
      UPDATE deals 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    res.json({
      message: 'Deal updated successfully',
      deal: result.rows[0]
    });
  } catch (error) {
    console.error('Update deal error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Delete deal
router.delete('/deals/:id', authorizeRoles('admin', 'manager'), auditLog('DELETE', 'deals'), async (req, res) => {
  try {
    const dealId = parseInt(req.params.id);
    
    if (isNaN(dealId)) {
      return res.status(400).json({
        error: 'Invalid deal ID'
      });
    }

    const result = await pool.query(
      'DELETE FROM deals WHERE id = $1 RETURNING *',
      [dealId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Deal not found'
      });
    }

    res.json({
      message: 'Deal deleted successfully',
      deal: result.rows[0]
    });
  } catch (error) {
    console.error('Delete deal error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// ============================================
// ACTIVITIES CRUD OPERATIONS
// ============================================

const activitySchema = Joi.object({
  type: Joi.string().valid('call', 'email', 'meeting', 'note', 'task').required(),
  subject: Joi.string().min(2).max(255).required(),
  description: Joi.string().allow('').optional(),
  company_id: Joi.number().integer().positive().required(),
  contact_id: Joi.number().integer().positive().optional(),
  deal_id: Joi.number().integer().positive().optional(),
  due_date: Joi.date().optional(),
  status: Joi.string().valid('pending', 'completed', 'cancelled').default('pending')
});

// Get all activities
router.get('/activities', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, 
             c.name as company_name,
             ct.first_name || ' ' || ct.last_name as contact_name,
             d.title as deal_title,
             u.first_name || ' ' || u.last_name as user_name
      FROM activities a
      LEFT JOIN companies c ON a.company_id = c.id
      LEFT JOIN contacts ct ON a.contact_id = ct.id
      LEFT JOIN deals d ON a.deal_id = d.id
      LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.created_at DESC
    `);

    res.json({ activities: result.rows });
  } catch (error) {
    console.error('Get activities error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create activity
router.post('/activities', auditLog('CREATE', 'activities'), async (req, res) => {
  try {
    const { error, value } = activitySchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        details: error.details[0].message
      });
    }

    // Add current user as the activity creator
    value.user_id = req.user.id;

    const columns = Object.keys(value);
    const values = Object.values(value);
    const placeholders = values.map((_, index) => `$${index + 1}`);

    const query = `
      INSERT INTO activities (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
      RETURNING *
    `;

    const result = await pool.query(query, values);

    res.status(201).json({
      message: 'Activity created successfully',
      activity: result.rows[0]
    });
  } catch (error) {
    console.error('Create activity error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// COMPANIES CRUD OPERATIONS
// ============================================

// Get all companies with pagination and search
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100); // Max 100 per page
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const industry = req.query.industry || '';

    let query = `
      SELECT c.*, 
             COUNT(co.id) as contact_count,
             COUNT(d.id) as deal_count,
             COALESCE(SUM(d.value), 0) as total_deal_value
      FROM companies c
      LEFT JOIN contacts co ON c.id = co.company_id
      LEFT JOIN deals d ON c.id = d.company_id AND d.status = 'open'
    `;

    const params = [];
    const conditions = [];

    if (search) {
      conditions.push(`c.name ILIKE $${params.length + 1}`);
      params.push(`%${search}%`);
    }

    if (industry) {
      conditions.push(`c.industry = $${params.length + 1}`);
      params.push(industry);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += `
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) FROM companies c';
    const countParams = [];

    if (conditions.length > 0) {
      countQuery += ` WHERE ${conditions.join(' AND ')}`;
      countParams.push(...params.slice(0, params.length - 2)); // Remove limit and offset
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      companies: result.rows,
      pagination: {
        current_page: page,
        total_pages: totalPages,
        total_count: totalCount,
        limit
      }
    });
  } catch (error) {
    console.error('Get companies error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Get single company by ID (only match numeric IDs)
router.get('/:id(\\d+)', async (req, res) => {
  console.log('🏢 Company ID route hit with ID:', req.params.id);
  try {
    const companyId = parseInt(req.params.id);
    
    if (isNaN(companyId)) {
      console.log('❌ Invalid company ID:', req.params.id);
      return res.status(400).json({
        error: 'Invalid company ID'
      });
    }

    const result = await pool.query(`
      SELECT c.*,
             json_agg(
               DISTINCT jsonb_build_object(
                 'id', co.id,
                 'first_name', co.first_name,
                 'last_name', co.last_name,
                 'email', co.email,
                 'phone', co.phone,
                 'job_title', co.job_title,
                 'is_primary', co.is_primary
               )
             ) FILTER (WHERE co.id IS NOT NULL) as contacts,
             json_agg(
               DISTINCT jsonb_build_object(
                 'id', d.id,
                 'title', d.title,
                 'value', d.value,
                 'status', d.status,
                 'stage', ps.name,
                 'probability', d.probability,
                 'expected_close_date', d.expected_close_date
               )
             ) FILTER (WHERE d.id IS NOT NULL) as deals
      FROM companies c
      LEFT JOIN contacts co ON c.id = co.company_id
      LEFT JOIN deals d ON c.id = d.company_id
      LEFT JOIN pipeline_stages ps ON d.pipeline_stage_id = ps.id
      WHERE c.id = $1
      GROUP BY c.id
    `, [companyId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Company not found'
      });
    }

    res.json({
      company: result.rows[0]
    });
  } catch (error) {
    console.error('Get company error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Create new company
router.post('/', auditLog('CREATE', 'companies'), async (req, res) => {
  try {
    const { error, value } = companySchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        details: error.details[0].message
      });
    }

    // Check for duplicate company name
    const existingCompany = await pool.query(
      'SELECT id FROM companies WHERE LOWER(name) = LOWER($1)',
      [value.name]
    );

    if (existingCompany.rows.length > 0) {
      return res.status(409).json({
        error: 'Company with this name already exists'
      });
    }

    const columns = Object.keys(value);
    const values = Object.values(value);
    const placeholders = values.map((_, index) => `$${index + 1}`);

    const query = `
      INSERT INTO companies (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
      RETURNING *
    `;

    const result = await pool.query(query, values);

    res.status(201).json({
      message: 'Company created successfully',
      company: result.rows[0]
    });
  } catch (error) {
    console.error('Create company error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Update company
router.put('/:id(\\d+)', auditLog('UPDATE', 'companies'), async (req, res) => {
  try {
    const companyId = parseInt(req.params.id);
    
    if (isNaN(companyId)) {
      return res.status(400).json({
        error: 'Invalid company ID'
      });
    }

    const { error, value } = companySchema.validate(req.body, { allowUnknown: false });
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        details: error.details[0].message
      });
    }

    // Check if company exists
    const existingCompany = await pool.query(
      'SELECT id FROM companies WHERE id = $1',
      [companyId]
    );

    if (existingCompany.rows.length === 0) {
      return res.status(404).json({
        error: 'Company not found'
      });
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    Object.entries(value).forEach(([key, val]) => {
      if (val !== undefined) {
        updates.push(`${key} = $${paramIndex}`);
        values.push(val);
        paramIndex++;
      }
    });

    if (updates.length === 0) {
      return res.status(400).json({
        error: 'No valid fields to update'
      });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(companyId);

    const query = `
      UPDATE companies 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    res.json({
      message: 'Company updated successfully',
      company: result.rows[0]
    });
  } catch (error) {
    console.error('Update company error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Delete company
router.delete('/:id(\\d+)', authorizeRoles('admin', 'manager'), auditLog('DELETE', 'companies'), async (req, res) => {
  try {
    const companyId = parseInt(req.params.id);
    
    if (isNaN(companyId)) {
      return res.status(400).json({
        error: 'Invalid company ID'
      });
    }

    // Check if company has related data
    const relatedData = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM contacts WHERE company_id = $1) as contact_count,
        (SELECT COUNT(*) FROM deals WHERE company_id = $1) as deal_count
    `, [companyId]);

    const { contact_count, deal_count } = relatedData.rows[0];

    if (parseInt(contact_count) > 0 || parseInt(deal_count) > 0) {
      return res.status(409).json({
        error: 'Cannot delete company with existing contacts or deals',
        details: {
          contacts: parseInt(contact_count),
          deals: parseInt(deal_count)
        }
      });
    }

    const result = await pool.query(
      'DELETE FROM companies WHERE id = $1 RETURNING *',
      [companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Company not found'
      });
    }

    res.json({
      message: 'Company deleted successfully',
      company: result.rows[0]
    });
  } catch (error) {
    console.error('Delete company error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});


// Catch-all route for debugging - should be last
router.use('*', (req, res) => {
  console.log('🚨 CRUD Router catch-all hit:', req.method, req.originalUrl, 'Body:', req.body);
  res.status(404).json({ error: 'Route not found in CRUD router', path: req.originalUrl, method: req.method });
});

module.exports = router;