const express = require('express');
const router = express.Router();

// GET /api/pipeline/analytics/overview
router.get('/overview', async (req, res) => {
  // Replace with your DB logic
  res.json({
    totalDeals: 10,
    totalValue: 50000,
    avgWinRate: 35,
    stages: [
      { stage: 'Prospect', count: 3 },
      { stage: 'Negotiation', count: 4 },
      { stage: 'Closed', count: 3 }
    ]
  });
});

module.exports = router;