const express = require('express');
const router = express.Router();

// GET /api/sales-performance
router.get('/', async (req, res) => {
  // Replace with your DB logic
  res.json({
    performance: [
      { month: 'Jan', value: 10000 },
      { month: 'Feb', value: 12000 },
      { month: 'Mar', value: 9000 }
    ]
  });
});

module.exports = router;