const express = require('express');
const router = express.Router();
const pool = require('./db'); // Adjust path if needed

router.get('/sales-performance', async (req, res) => {
  try {
    const months = parseInt(req.query.months) || 6;
    if (months <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid months parameter' });
    }

    const query = `
      WITH current_period AS (
        SELECT
          COUNT(*) FILTER (WHERE status = 'won') AS won_deals,
          COUNT(*) AS total_deals,
          COALESCE(SUM(value) FILTER (WHERE status = 'won'), 0) AS total_revenue
        FROM deals
        WHERE expected_close_date >= NOW() - INTERVAL '${months} months'
      ),
      previous_period AS (
        SELECT
          COALESCE(SUM(value) FILTER (WHERE status = 'won'), 0) AS prev_revenue
        FROM deals
        WHERE expected_close_date >= NOW() - INTERVAL '${months * 2} months'
          AND expected_close_date < NOW() - INTERVAL '${months} months'
          AND status = 'won'
      )
      SELECT
        (SELECT won_deals FROM current_period) AS won_deals,
        (SELECT total_deals FROM current_period) AS total_deals,
        (SELECT total_revenue FROM current_period) AS total_revenue,
        (SELECT prev_revenue FROM previous_period) AS prev_revenue
    `;

    const result = await pool.query(query);
    const data = result.rows[0];

    // Calculate additional metrics
    const avgDealSize = data.total_deals > 0 ? data.total_revenue / data.total_deals : 0;
    const winRate = data.total_deals > 0 ? (data.won_deals / data.total_deals) * 100 : 0;
    const revenueGrowth = data.prev_revenue > 0
      ? (((data.total_revenue - data.prev_revenue) / data.prev_revenue) * 100)
      : null;
    const dealGrowth = null; // Add calculation if needed

    res.json({
      success: true,
      message: `Sales performance data for last ${months} months`,
      data: {
        summary: {
          totalDeals: Number(data.won_deals),
          totalRevenue: Number(data.total_revenue),
          avgDealSize: Number(avgDealSize),
          winRate: Number(winRate),
          revenueGrowth: revenueGrowth !== null ? Number(revenueGrowth.toFixed(2)) : null,
          dealGrowth: dealGrowth
        },
        // You can add monthlyData here if you have a query for it
        monthlyData: []
      }
    });
  } catch (error) {
    console.error('Sales performance error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/dashboard-summary', async (req, res) => {
  // TODO: Replace with real dashboard summary logic
  res.json({
    success: true,
    data: {
      kpis: {
        totalDeals: 42,
        totalRevenue: 1200000,
        winRate: 32,
        avgDealSize: 28500
      },
      recentActivity: [
        { type: 'deal_won', message: 'Deal won: Acme Corp', timestamp: Date.now() },
        { type: 'new_lead', message: 'New lead: Tech Solutions', timestamp: Date.now() }
      ],
      pipeline: {
        stages: [
          { name: 'Qualification', count: 10, value: 250000, color: '#3B82F6' },
          { name: 'Proposal', count: 8, value: 180000, color: '#10B981' },
          { name: 'Negotiation', count: 6, value: 320000, color: '#F59E42' },
          { name: 'Closed Won', count: 4, value: 150000, color: '#22D3EE' }
        ]
      },
      sales: {
        monthlyData: [
          { month: '2025-03', revenue: 200000 },
          { month: '2025-04', revenue: 250000 },
          { month: '2025-05', revenue: 300000 },
          { month: '2025-06', revenue: 180000 },
          { month: '2025-07', revenue: 220000 },
          { month: '2025-08', revenue: 150000 }
        ]
      }
    }
  });
});

router.get('/pipeline-analysis', async (req, res) => {
  res.json({
    success: true,
    data: {
      stages: [
        { name: 'Qualification', count: 10, value: 250000, color: '#3B82F6' },
        { name: 'Proposal', count: 8, value: 180000, color: '#10B981' },
        { name: 'Negotiation', count: 6, value: 320000, color: '#F59E42' },
        { name: 'Closed Won', count: 4, value: 150000, color: '#22D3EE' }
      ]
    }
  });
});

// List available report types
router.get('/types', async (req, res) => {
  res.json({
    success: true,
    data: [
      { id: 'sales-performance', name: 'Sales Performance' },
      { id: 'pipeline-analysis', name: 'Pipeline Analysis' },
      { id: 'dashboard-summary', name: 'Dashboard Summary' }
      // Add more types as needed
    ]
  });
});

// List saved reports
router.get('/saved', async (req, res) => {
  res.json({
    success: true,
    data: [] // Return an array of saved reports
  });
});

// Generate a report
router.post('/generate', async (req, res) => {
  // TODO: Add real report generation logic
  res.json({
    success: true,
    data: { message: 'Report generated - coming soon' }
  });
});

router.get('/', async (req, res) => {
  res.json({
    success: true,
    reports: [
      { id: 1, type: 'sales-performance', name: 'Monthly Sales Performance' },
      { id: 2, type: 'pipeline-analysis', name: 'Pipeline Analysis' }
    ]
  });
});

// List available templates

router.get('/templates', async (req, res) => {
  res.json({ success: true, templates: [] });
});

module.exports = router;
