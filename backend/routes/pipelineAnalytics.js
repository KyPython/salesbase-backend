const express = require('express');
const router = express.Router();

// GET /api/pipeline/analytics/overview
router.get('/overview', async (req, res) => {
  try {
    // Mock data - replace with actual database queries later
    const mockData = {
      pipeline_summary: {
        total_deals: 10,
        total_value: 50000,
        avg_win_rate: 35
      },
      pipeline_stages: [
        { stage_name: 'Prospect', deal_count: 3, stage_value: 15000 },
        { stage_name: 'Qualified', deal_count: 2, stage_value: 10000 },
        { stage_name: 'Negotiation', deal_count: 4, stage_value: 20000 },
        { stage_name: 'Closed Won', deal_count: 1, stage_value: 5000 }
      ]
    };
    
    res.json(mockData);
  } catch (error) {
    console.error('Error fetching pipeline analytics:', error);
    res.status(500).json({ error: 'Failed to fetch pipeline analytics' });
  }
});

module.exports = router;
