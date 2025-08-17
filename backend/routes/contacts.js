const express = require('express');
const pool = require('../db');
const router = express.Router();

// filepath: /Users/ky/Desktop/GitHub/VS_Code/SalesBase/backend/routes/contacts.js

// GET /api/contacts
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    // Real database query to get contacts with company information
    const result = await pool.query(`
      SELECT 
        c.id,
        c.first_name,
        c.last_name,
        c.email,
        c.phone,
        c.job_title,
        c.department,
        c.is_primary,
        c.created_at,
        comp.name as company_name
      FROM contacts c
      LEFT JOIN companies comp ON c.company_id = comp.id
      ORDER BY c.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    
    // Get total count for pagination
    const countResult = await pool.query('SELECT COUNT(*) FROM contacts');
    const totalCount = parseInt(countResult.rows[0].count);
    
    // Format the response to match what frontend expects
    const contacts = result.rows.map(row => ({
      id: row.id,
      name: `${row.first_name} ${row.last_name}`.trim(),
      email: row.email,
      company: row.company_name || 'No Company',
      phone: row.phone || 'No Phone',
      job_title: row.job_title || 'No Title',
      department: row.department || 'No Department',
      is_primary: row.is_primary,
      created_at: row.created_at
    }));
    
    res.json({ 
      contacts: contacts,
      total: totalCount,
      page: page,
      limit: limit,
      totalPages: Math.ceil(totalCount / limit)
    });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { first_name, last_name, email, phone, job_title, department, company_id } = req.body;
    
    // Validate required fields
    if (!first_name || !last_name) {
      return res.status(400).json({ error: 'First name and last name are required' });
    }
    
    // Insert new contact
    const result = await pool.query(`
      INSERT INTO contacts (first_name, last_name, email, phone, job_title, department, company_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [first_name, last_name, email, phone, job_title, department, company_id]);
    
    res.status(201).json({ 
      message: 'Contact created successfully',
      contact: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating contact:', error);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        c.*,
        comp.name as company_name
      FROM contacts c
      LEFT JOIN companies comp ON c.company_id = comp.id
      WHERE c.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    
    res.json({ contact: result.rows[0] });
  } catch (error) {
    console.error('Error fetching contact:', error);
    res.status(500).json({ error: 'Failed to fetch contact' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, email, phone, job_title, department, company_id } = req.body;
    
    const result = await pool.query(`
      UPDATE contacts 
      SET first_name = $1, last_name = $2, email = $3, phone = $4, job_title = $5, department = $6, company_id = $7, updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING *
    `, [first_name, last_name, email, phone, job_title, department, company_id, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    
    res.json({ 
      message: 'Contact updated successfully',
      contact: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating contact:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM contacts WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    
    res.json({ 
      message: 'Contact deleted successfully',
      contact: result.rows[0]
    });
  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

module.exports = router;
