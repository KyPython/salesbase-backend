import express from 'express';
const router = express.Router();

router.get('/', (req, res) => {
  res.json({ message: 'Get all activities - coming soon' });
});

router.post('/', (req, res) => {
  res.json({ message: 'Create activity - coming soon' });
});

router.get('/:id', (req, res) => {
  res.json({ message: `Get activity ${req.params.id} - coming soon` });
});

router.put('/:id', (req, res) => {
  res.json({ message: `Update activity ${req.params.id} - coming soon` });
});

router.delete('/:id', (req, res) => {
  res.json({ message: `Delete activity ${req.params.id} - coming soon` });
});

export default router;