require('dotenv').config();

const express = require('express');
const Joi = require('joi');
const pool = require('../db');

const router = express.Router();

console.log('pool object:', pool);
console.log('typeof pool.query:', typeof pool.query);

// IMMEDIATE DEBUG - This should always log
console.log('🚀 CRUD API Router module loaded at:', new Date().toISOString());

// Middleware: log all requests to this router
router.use((req, res, next) => {
  console.log(`🛠️ CRUD router matched: ${req.method} ${req.originalUrl}`);
  next();
});

// Test route to verify router is working
router.get('/test', (req, res) => {
  console.log('🧪 Test route hit!');
  res.json({ message: 'CRUD API router is working!', timestamp: new Date().toISOString() });
});

// Health check
router.get('/health', (req, res) => {
  console.log('❤️ Health check hit!');
  res.json({ status: 'healthy', message: 'CRUD router is responding' });
});

// Database connection test
router.get('/db-test', async (req, res) => {
  try {
    console.log('🧪 Testing database connection...');
    const result = await pool.query('SELECT NOW() as current_time, version() as db_version');
    console.log('✅ Database connection successful!');
    res.json({ 
      message: 'Database connection successful!', 
      data: result.rows[0],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Database test error:', error);
    res.status(500).json({ error: 'Database connection failed', details: error.message });
  }
});

// Get all contacts
router.get('/contacts', async (req, res) => {
  try {
    console.log('📞 Fetching contacts from database...');
    const query = `
      SELECT 
        c.id, c.first_name, c.last_name, c.email, c.phone, c.job_title, c.department,
        comp.name AS company_name,
        c.created_at
      FROM contacts c
      LEFT JOIN companies comp ON c.company_id = comp.id
      ORDER BY c.created_at DESC
    `;
    const result = await pool.query(query);
    console.log(`✅ Found ${result.rows.length} contacts`);
    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('❌ Error fetching contacts:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch contacts', details: error.message });
  }
});

// Get single contact by ID
router.get('/contacts/:id', async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    if (isNaN(contactId)) return res.status(400).json({ error: 'Invalid contact ID' });

    const query = `
      SELECT 
        c.id, c.first_name, c.last_name, c.email, c.phone, c.job_title, c.department,
        comp.name AS company_name,
        c.created_at
      FROM contacts c
      LEFT JOIN companies comp ON c.company_id = comp.id
      WHERE c.id = $1
    `;
    const result = await pool.query(query, [contactId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Contact not found' });

    res.json({ contact: result.rows[0] });
  } catch (error) {
    console.error('❌ Get contact error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Create new contact
router.post('/contacts', async (req, res) => {
  try {
    console.log('📝 POST /contacts route hit with body:', req.body);
    const { first_name, last_name, email, phone, job_title, department, company_id } = req.body;

    const query = `
      INSERT INTO contacts (first_name, last_name, email, phone, job_title, department, company_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *
    `;
    const values = [first_name, last_name, email, phone, job_title, department, company_id];
    const result = await pool.query(query, values);

    res.status(201).json({ message: 'Contact created successfully', contact: result.rows[0] });
  } catch (error) {
    console.error('❌ Create contact error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Update contact
router.put('/contacts/:id', async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    if (isNaN(contactId)) return res.status(400).json({ error: 'Invalid contact ID' });

    const { first_name, last_name, email, phone, job_title, department, company_id } = req.body;
    const query = `
      UPDATE contacts
      SET first_name = $1, last_name = $2, email = $3, phone = $4, job_title = $5, department = $6, company_id = $7, updated_at = NOW()
      WHERE id = $8
      RETURNING *
    `;
    const values = [first_name, last_name, email, phone, job_title, department, company_id, contactId];
    const result = await pool.query(query, values);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Contact not found' });

    res.json({ message: 'Contact updated successfully', contact: result.rows[0] });
  } catch (error) {
    console.error('❌ Update contact error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Delete contact
router.delete('/contacts/:id', async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    if (isNaN(contactId)) return res.status(400).json({ error: 'Invalid contact ID' });

    const query = 'DELETE FROM contacts WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [contactId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Contact not found' });

    res.json({ message: 'Contact deleted successfully', contact: result.rows[0] });
  } catch (error) {
    console.error('❌ Delete contact error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Alias routes for customers (map to contacts)
router.get('/customers', (req, res, next) => {
  req.url = '/contacts';
  return router.handle(req, res, next);
});
router.post('/customers', (req, res, next) => {
  req.url = '/contacts';
  return router.handle(req, res, next);
});

// Get all companies
router.get('/companies', async (req, res) => {
  try {
    console.log('📦 Fetching companies...');
    const query = `
      SELECT id, name, industry, website, size_category, annual_revenue, city, state, country, created_at
      FROM companies
      ORDER BY created_at DESC
    `;
    const result = await pool.query(query);
    console.log(`✅ Found ${result.rows.length} companies`);
    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('❌ Error fetching companies:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch companies', details: error.message });
  }
});

// Get single company by ID
router.get('/companies/:id', async (req, res) => {
  try {
    const companyId = parseInt(req.params.id);
    if (isNaN(companyId)) return res.status(400).json({ error: 'Invalid company ID' });

    const query = `
      SELECT id, name, industry, website, size_category, annual_revenue, city, state, country, created_at
      FROM companies
      WHERE id = $1
    `;
    const result = await pool.query(query, [companyId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Company not found' });

    res.json({ company: result.rows[0] });
  } catch (error) {
    console.error('❌ Get company error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Create new company
router.post('/companies', async (req, res) => {
  try {
    const { name, industry, website, size_category, annual_revenue, city, state, country } = req.body;
    const query = `
      INSERT INTO companies (name, industry, website, size_category, annual_revenue, city, state, country, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *
    `;
    const values = [name, industry, website, size_category, annual_revenue, city, state, country];
    const result = await pool.query(query, values);
    res.status(201).json({ message: 'Company created successfully', company: result.rows[0] });
  } catch (error) {
    console.error('❌ Create company error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Update company
router.put('/companies/:id', async (req, res) => {
  try {
    const companyId = parseInt(req.params.id);
    if (isNaN(companyId)) return res.status(400).json({ error: 'Invalid company ID' });

    const { name, industry, website, size_category, annual_revenue, city, state, country } = req.body;
    const query = `
      UPDATE companies
      SET name = $1, industry = $2, website = $3, size_category = $4, annual_revenue = $5, city = $6, state = $7, country = $8, updated_at = NOW()
      WHERE id = $9
      RETURNING *
    `;
    const values = [name, industry, website, size_category, annual_revenue, city, state, country, companyId];
    const result = await pool.query(query, values);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Company not found' });

    res.json({ message: 'Company updated successfully', company: result.rows[0] });
  } catch (error) {
    console.error('❌ Update company error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Delete company
router.delete('/companies/:id', async (req, res) => {
  try {
    const companyId = parseInt(req.params.id);
    if (isNaN(companyId)) return res.status(400).json({ error: 'Invalid company ID' });

    const query = 'DELETE FROM companies WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [companyId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Company not found' });

    res.json({ message: 'Company deleted successfully', company: result.rows[0] });
  } catch (error) {
    console.error('❌ Delete company error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Get all deals
router.get('/deals', async (req, res) => {
  try {
    console.log('💰 Fetching deals...');
    const query = `
      SELECT 
        d.id, d.title, d.value, d.currency, d.expected_close_date, d.probability, d.status, d.created_at,
        c.name AS company_name,
        ps.name AS stage_name
      FROM deals d
      LEFT JOIN companies c ON d.company_id = c.id
      LEFT JOIN pipeline_stages ps ON d.pipeline_stage_id = ps.id
      ORDER BY d.created_at DESC
    `;
    const result = await pool.query(query);
    console.log(`✅ Found ${result.rows.length} deals`);
    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('❌ Error fetching deals:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch deals', details: error.message });
  }
});

// --- REPORTS ROUTES (Mock Data & CSV export) ---

// (Functions for mock data generation and CSV conversion omitted here for brevity, you can add them if needed)

// Catch-all for unmatched routes in this router
router.use('*', (req, res) => {
  console.log('🚨 CRUD Router catch-all hit:', req.method, req.originalUrl, 'Body:', req.body);
  res.status(404).json({ error: 'Route not found in CRUD router', path: req.originalUrl, method: req.method });
});

module.exports = router;
