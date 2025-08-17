const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/sales-performance', async (req, res) => {
  try {
    const months = parseInt(req.query.months) || 6;
    if (months <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid months parameter' });
    }

    const query = `
      WITH current_period AS (
        SELECT
          COUNT(*) FILTER (WHERE status = 'closed_won') AS won_deals,
          COUNT(*) AS total_deals,
          COALESCE(SUM(value) FILTER (WHERE status = 'closed_won'), 0) AS total_revenue
        FROM deals
        WHERE expected_close_date >= NOW() - INTERVAL '${months} months'
      ),
      previous_period AS (
        SELECT
          COALESCE(SUM(value) FILTER (WHERE status = 'closed_won'), 0) AS prev_revenue
        FROM deals
        WHERE expected_close_date >= NOW() - INTERVAL '${months * 2} months'
          AND expected_close_date < NOW() - INTERVAL '${months} months'
          AND status = 'closed_won'
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

    res.json({
      success: true,
      message: `Sales performance data for last ${months} months`,
      data: {
        summary: {
          totalDeals: Number(data.won_deals),
          totalRevenue: Number(data.total_revenue),
          avgDealSize: Number(avgDealSize),
          winRate: Number(winRate),
          revenueGrowth: revenueGrowth !== null ? Number(revenueGrowth.toFixed(2)) : null
        },
        monthlyData: []
      }
    });
  } catch (error) {
    console.error('Sales performance error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/dashboard-summary', async (req, res) => {
  try {
    // Real database queries for dashboard summary
    const dealsQuery = await pool.query(`
      SELECT 
        COUNT(*) as total_deals,
        COUNT(CASE WHEN status = 'closed_won' THEN 1 END) as won_deals,
        COALESCE(SUM(CASE WHEN status = 'closed_won' THEN value ELSE 0 END), 0) as total_revenue
      FROM deals
    `);
    
    const dealsData = dealsQuery.rows[0];
    const totalDeals = parseInt(dealsData.total_deals || 0);
    const wonDeals = parseInt(dealsData.won_deals || 0);
    const totalRevenue = parseFloat(dealsData.total_revenue || 0);
    const avgDealSize = totalDeals > 0 ? totalRevenue / totalDeals : 0;
    const winRate = totalDeals > 0 ? (wonDeals / totalDeals) * 100 : 0;

    // Get pipeline stages data
    const pipelineQuery = await pool.query(`
      SELECT 
        ps.name,
        COUNT(d.id) as count,
        COALESCE(SUM(d.value), 0) as value
      FROM pipeline_stages ps
      LEFT JOIN deals d ON ps.id = d.pipeline_stage_id
      WHERE ps.is_active = true
      GROUP BY ps.id, ps.name, ps.display_order
      ORDER BY ps.display_order
    `);

    const pipelineStages = pipelineQuery.rows.map((row, index) => ({
      name: row.name,
      count: parseInt(row.count),
      value: parseFloat(row.value),
      color: ['#3B82F6', '#10B981', '#F59E42', '#22D3EE', '#8B5CF6', '#EF4444'][index % 6]
    }));

    // Get monthly revenue data for the last 6 months
    const monthlyQuery = await pool.query(`
      SELECT 
        TO_CHAR(DATE_TRUNC('month', expected_close_date), 'YYYY-MM') as month,
        COALESCE(SUM(value), 0) as revenue
      FROM deals
      WHERE status = 'closed_won' 
        AND expected_close_date >= NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', expected_close_date)
      ORDER BY month DESC
      LIMIT 6
    `);

    const monthlyData = monthlyQuery.rows.map(row => ({
      month: row.month,
      revenue: parseFloat(row.revenue)
    }));

    // Get recent activity
    const recentActivityQuery = await pool.query(`
      SELECT 
        'deal_won' as type,
        CONCAT('Deal won: ', c.name) as message,
        d.updated_at as timestamp
      FROM deals d
      LEFT JOIN companies c ON d.company_id = c.id
      WHERE d.status = 'closed_won'
      ORDER BY d.updated_at DESC
      LIMIT 5
    `);

    const recentActivity = recentActivityQuery.rows.map(row => ({
      type: row.type,
      message: row.message,
      timestamp: row.timestamp
    }));

    res.json({
      success: true,
      data: {
        kpis: {
          totalDeals: totalDeals,
          totalRevenue: totalRevenue,
          winRate: Math.round(winRate),
          avgDealSize: Math.round(avgDealSize)
        },
        recentActivity: recentActivity,
        pipeline: {
          stages: pipelineStages
        },
        sales: {
          monthlyData: monthlyData
        }
      }
    });
  } catch (error) {
    console.error('Dashboard summary error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/pipeline-analysis', async (req, res) => {
  try {
    // Real database query for pipeline analysis
    const result = await pool.query(`
      SELECT 
        ps.name,
        COUNT(d.id) as count,
        COALESCE(SUM(d.value), 0) as value,
        ps.display_order
      FROM pipeline_stages ps
      LEFT JOIN deals d ON ps.id = d.pipeline_stage_id
      WHERE ps.is_active = true
      GROUP BY ps.id, ps.name, ps.display_order
      ORDER BY ps.display_order
    `);

    const stages = result.rows.map((row, index) => ({
      name: row.name,
      count: parseInt(row.count),
      value: parseFloat(row.value),
      color: ['#3B82F6', '#10B981', '#F59E42', '#22D3EE', '#8B5CF6', '#EF4444'][index % 6]
    }));

    res.json({
      success: true,
      data: {
        stages: stages
      }
    });
  } catch (error) {
    console.error('Pipeline analysis error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/customer-insights', async (req, res) => {
  try {
    // Real database query for customer insights
    const result = await pool.query(`
      SELECT 
        c.name as company_name,
        COUNT(d.id) as deal_count,
        COALESCE(SUM(d.value), 0) as total_value,
        AVG(d.value) as avg_deal_value
      FROM companies c
      LEFT JOIN deals d ON c.id = d.company_id
      GROUP BY c.id, c.name
      HAVING COUNT(d.id) > 0
      ORDER BY total_value DESC
      LIMIT 10
    `);

    const customerInsights = result.rows.map(row => ({
      company: row.company_name,
      dealCount: parseInt(row.deal_count),
      totalValue: parseFloat(row.total_value),
      avgDealValue: parseFloat(row.avg_deal_value || 0)
    }));

    res.json({
      success: true,
      data: {
        topCustomers: customerInsights,
        totalCustomers: customerInsights.length
      }
    });
  } catch (error) {
    console.error('Customer insights error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// List available report types
router.get('/types', async (req, res) => {
  res.json({
    success: true,
    data: [
      { id: 'sales-performance', name: 'Sales Performance' },
      { id: 'pipeline-analysis', name: 'Pipeline Analysis' },
      { id: 'dashboard-summary', name: 'Dashboard Summary' },
      { id: 'customer-insights', name: 'Customer Insights' }
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
  try {
    const { reportType, format, filters } = req.body;
    
    // TODO: Add real report generation logic based on reportType
    res.json({
      success: true,
      data: { 
        message: `Report ${reportType} generated successfully`,
        format: format,
        filters: filters
      }
    });
  } catch (error) {
    console.error('Report generation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    // Get available reports from database
    const result = await pool.query(`
      SELECT DISTINCT 
        'sales-performance' as type,
        'Monthly Sales Performance' as name
      UNION ALL
      SELECT 
        'pipeline-analysis' as type,
        'Pipeline Analysis' as name
      UNION ALL
      SELECT 
        'dashboard-summary' as type,
        'Dashboard Summary' as name
      UNION ALL
      SELECT 
        'customer-insights' as type,
        'Customer Insights' as name
    `);

    res.json({
      success: true,
      reports: result.rows
    });
  } catch (error) {
    console.error('Reports list error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// List available templates
router.get('/templates', async (req, res) => {
  res.json({ success: true, templates: [] });
});

module.exports = router;
