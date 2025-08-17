const express = require('express');
const pool = require('./routes/db');
const router = express.Router();

// GET /api/pipeline/analytics/overview
router.get('/overview', async (req, res) => {
  try {
    // Real database queries instead of mock data
    
    // 1. Get total deals count
    const totalDealsResult = await pool.query('SELECT COUNT(*) FROM deals');
    const totalDeals = parseInt(totalDealsResult.rows[0].count);
    
    // 2. Get total value of all deals (excluding closed lost)
    const totalValueResult = await pool.query(`
      SELECT COALESCE(SUM(value), 0) as total_value 
      FROM deals 
      WHERE status != 'closed_lost' AND value IS NOT NULL
    `);
    const totalValue = parseFloat(totalValueResult.rows[0].total_value || 0);
    
    // 3. Calculate average win rate (deals closed won vs total deals)
    const winRateResult = await pool.query(`
      SELECT 
        COUNT(CASE WHEN status = 'closed_won' THEN 1 END) as won_deals,
        COUNT(*) as total_deals
      FROM deals
    `);
    const wonDeals = parseInt(winRateResult.rows[0].won_deals || 0);
    const avgWinRate = totalDeals > 0 ? Math.round((wonDeals / totalDeals) * 100) : 0;
    
    // 4. Get deals by pipeline stage with counts and values
    const stagesResult = await pool.query(`
      SELECT 
        ps.name as stage_name,
        COUNT(d.id) as deal_count,
        COALESCE(SUM(d.value), 0) as stage_value
      FROM pipeline_stages ps
      LEFT JOIN deals d ON ps.id = d.pipeline_stage_id
      WHERE ps.is_active = true
      GROUP BY ps.id, ps.name, ps.display_order
      ORDER BY ps.display_order
    `);
    
    const pipelineStages = stagesResult.rows.map(row => ({
      stage_name: row.stage_name,
      deal_count: parseInt(row.deal_count),
      stage_value: parseFloat(row.stage_value || 0)
    }));
    
    // Return real data from database
    const realData = {
      pipeline_summary: {
        total_deals: totalDeals,
        total_value: totalValue,
        avg_win_rate: avgWinRate
      },
      pipeline_stages: pipelineStages
    };
    
    res.json(realData);
  } catch (error) {
    console.error('Error fetching pipeline analytics:', error);
    res.status(500).json({ error: 'Failed to fetch pipeline analytics' });
  }
});

module.exports = router;
