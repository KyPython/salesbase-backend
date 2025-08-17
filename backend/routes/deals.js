const express = require('express');
const pool = require('./db');
const router = express.Router();

// GET /api/deals - Get all deals with company and pipeline stage information
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    // Real database query to get deals with company and pipeline stage information
    const result = await pool.query(`
      SELECT 
        d.id,
        d.title,
        d.value,
        d.currency,
        d.probability,
        d.expected_close_date,
        d.status,
        d.created_at,
        d.updated_at,
        c.name as company_name,
        ps.name as pipeline_stage,
        ps.display_order as stage_order
      FROM deals d
      LEFT JOIN companies c ON d.company_id = c.id
      LEFT JOIN pipeline_stages ps ON d.pipeline_stage_id = ps.id
      ORDER BY d.expected_close_date DESC, d.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    
    // Get total count for pagination
    const countResult = await pool.query('SELECT COUNT(*) FROM deals');
    const totalCount = parseInt(countResult.rows[0].count);
    
    // Format the response to match what frontend expects
    const deals = result.rows.map(row => ({
      id: row.id,
      company_name: row.company_name || 'No Company',
      value: parseFloat(row.value || 0),
      status: row.pipeline_stage || row.status || 'Unknown',
      probability: parseInt(row.probability || 0),
      date: row.expected_close_date || row.created_at,
      title: row.title,
      currency: row.currency || 'USD',
      stage_order: row.stage_order || 0
    }));
    
    res.json({ 
      deals: deals,
      total: totalCount,
      page: page,
      limit: limit,
      totalPages: Math.ceil(totalCount / limit)
    });
  } catch (error) {
    console.error('Error fetching deals:', error);
    res.status(500).json({ error: 'Failed to fetch deals' });
  }
});

// POST /api/deals - Create new deal
router.post('/', async (req, res) => {
  try {
    const { 
      title, 
      company_id, 
      contact_id, 
      assigned_user_id, 
      pipeline_stage_id, 
      value, 
      currency, 
      expected_close_date, 
      probability, 
      description 
    } = req.body;
    
    // Validate required fields
    if (!title || !company_id) {
      return res.status(400).json({ error: 'Title and company are required' });
    }
    
    // Insert new deal
    const result = await pool.query(`
      INSERT INTO deals (title, company_id, contact_id, assigned_user_id, pipeline_stage_id, value, currency, expected_close_date, probability, description)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [title, company_id, contact_id, assigned_user_id, pipeline_stage_id, value, currency, expected_close_date, probability, description]);
    
    res.status(201).json({ 
      message: 'Deal created successfully',
      deal: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating deal:', error);
    res.status(500).json({ error: 'Failed to create deal' });
  }
});

// GET /api/deals/:id - Get individual deal
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        d.*,
        c.name as company_name,
        ps.name as pipeline_stage
      FROM deals d
      LEFT JOIN companies c ON d.company_id = c.id
      LEFT JOIN pipeline_stages ps ON d.pipeline_stage_id = ps.id
      WHERE d.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }
    
    res.json({ deal: result.rows[0] });
  } catch (error) {
    console.error('Error fetching deal:', error);
    res.status(500).json({ error: 'Failed to fetch deal' });
  }
});

// PUT /api/deals/:id - Update deal
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      title, 
      company_id, 
      contact_id, 
      assigned_user_id, 
      pipeline_stage_id, 
      value, 
      currency, 
      expected_close_date, 
      probability, 
      description, 
      status 
    } = req.body;
    
    const result = await pool.query(`
      UPDATE deals 
      SET title = $1, company_id = $2, contact_id = $3, assigned_user_id = $4, 
          pipeline_stage_id = $5, value = $6, currency = $7, expected_close_date = $8, 
          probability = $9, description = $10, status = $11, updated_at = CURRENT_TIMESTAMP
      WHERE id = $12
      RETURNING *
    `, [title, company_id, contact_id, assigned_user_id, pipeline_stage_id, value, currency, expected_close_date, probability, description, status, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }
    
    res.json({ 
      message: 'Deal updated successfully',
      deal: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating deal:', error);
    res.status(500).json({ error: 'Failed to update deal' });
  }
});

// DELETE /api/deals/:id - Delete deal
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM deals WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }
    
    res.json({ 
      message: 'Deal deleted successfully',
      deal: result.rows[0]
    });
  } catch (error) {
    console.error('Error deleting deal:', error);
    res.status(500).json({ error: 'Failed to delete deal' });
  }
});

module.exports = router;