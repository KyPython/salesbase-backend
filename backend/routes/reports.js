import express from 'express';
const router = express.Router();

router.get('/dashboard', (req, res) => {
  res.json({ message: 'Dashboard reports - coming soon' });
});

router.get('/sales-pipeline', (req, res) => {
  res.json({ message: 'Sales pipeline report - coming soon' });
});

router.get('/revenue', (req, res) => {
  res.json({ message: 'Revenue report - coming soon' });
});

export default router;