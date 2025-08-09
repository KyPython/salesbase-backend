const express = require('express');
const router = express.Router();

// filepath: /Users/ky/Desktop/GitHub/VS_Code/SalesBase/backend/routes/contacts.js
router.get('/', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const result = await pool.query(
    'SELECT * FROM contacts ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [limit, offset]
  );
  res.json({ contacts: result.rows });
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