const express = require('express');
const router = express.Router();

// filepath: /Users/ky/Desktop/GitHub/VS_Code/SalesBase/backend/routes/contacts.js

// GET /api/contacts
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    // TODO: Replace with actual database query when pool is properly configured
    // const result = await pool.query(
    //   'SELECT * FROM contacts ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    //   [limit, offset]
    // );
    // res.json({ contacts: result.rows });
    
    // Temporary mock data
    res.json([
      { id: 1, name: 'Contact 1', email: 'contact1@example.com' },
      { id: 2, name: 'Contact 2', email: 'contact2@example.com' }
    ]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', (req, res) => {
  res.json({ message: 'Create contact - coming soon' });
});

router.get('/:id', (req, res) => {
  res.json({ message: `Get contact ${req.params.id} - coming soon` });
});

router.put('/:id', (req, res) => {
  res.json({ message: `Update contact ${req.params.id} - coming soon` });
});

router.delete('/:id', (req, res) => {
  res.json({ message: `Delete contact ${req.params.id} - coming soon` });
});

module.exports = router;
