const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({ message: 'Get all deals - coming soon' });
});

router.post('/', (req, res) => {
  res.json({ message: 'Create deal - coming soon' });
});

router.get('/:id', (req, res) => {
  res.json({ message: `Get deal ${req.params.id} - coming soon` });
});

router.put('/:id', (req, res) => {
  res.json({ message: `Update deal ${req.params.id} - coming soon` });
});

router.delete('/:id', (req, res) => {
  res.json({ message: `Delete deal ${req.params.id} - coming soon` });
});

module.exports = router;