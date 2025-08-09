const express = require('express');
const router = express.Router();

// Placeholder CRUD routes
router.get('/', (req, res) => {
  res.json({ message: 'Get all companies - coming soon' });
});

router.post('/', (req, res) => {
  res.json({ message: 'Create company - coming soon' });
});

router.get('/:id', (req, res) => {
  res.json({ message: `Get company ${req.params.id} - coming soon` });
});

router.put('/:id', (req, res) => {
  res.json({ message: `Update company ${req.params.id} - coming soon` });
});

router.delete('/:id', (req, res) => {
  res.json({ message: `Delete company ${req.params.id} - coming soon` });
});

module.exports = router;