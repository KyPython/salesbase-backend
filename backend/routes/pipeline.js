import express from 'express';
import Joi from 'joi';
import pool from '../database.js';
import { authenticateToken } from '../middleware.js';
import { getOrSetCache } from '../cache.js';

const router = express.Router();

// Test endpoint WITHOUT authentication
router.get('/test', (req, res) => {
  console.log('🧪 Pipeline test endpoint hit!');
  res.json({ 
    message: 'Pipeline routes working!',
    timestamp: new Date().toISOString(),
    route: '/api/pipeline/test'
  });
});

router.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM automation_rules LIMIT 1');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Apply authentication to protected routes
router.use(authenticateToken);

router.get('/analytics/overview', async (req, res) => {
  try {
    const data = await getOrSetCache('analytics_overview', async () => {
      const result = await pool.query(`
        WITH deal_metrics AS (
          SELECT 
            ps.name as stage_name,
            ps.display_order,
            ps.win_probability,
            COUNT(d.id) as deal_count,
            COALESCE(SUM(d.value), 0) as total_value,
            COALESCE(AVG(d.value), 0) as avg_deal_value,
            COALESCE(AVG(d.probability), 0) as avg_probability,
            COUNT(CASE WHEN d.created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as deals_last_30_days,
            COUNT(CASE WHEN d.status = 'won' THEN 1 END) as won_deals,
            COUNT(CASE WHEN d.status = 'lost' THEN 1 END) as lost_deals
          FROM pipeline_stages ps
          LEFT JOIN deals d ON ps.id = d.pipeline_stage_id
          WHERE ps.is_active = true
          GROUP BY ps.id, ps.name, ps.display_order, ps.win_probability
        ),
        conversion_rates AS (
          SELECT 
            stage_name,
            display_order,
            win_probability,
            deal_count,
            total_value,
            avg_deal_value,
            avg_probability,
            deals_last_30_days,
            won_deals,
            lost_deals,
            CASE 
              WHEN deal_count > 0 THEN ROUND((won_deals::decimal / deal_count) * 100, 2)
              ELSE 0 
            END as win_rate,
            LAG(deal_count) OVER (ORDER BY display_order) as prev_stage_deals,
            CASE 
              WHEN LAG(deal_count) OVER (ORDER BY display_order) > 0 
              THEN ROUND((deal_count::decimal / LAG(deal_count) OVER (ORDER BY display_order)) * 100, 2)
              ELSE 100 
            END as conversion_rate
          FROM deal_metrics
        )
        SELECT 
          stage_name,
          display_order,
          win_probability,
          deal_count,
          total_value,
          ROUND(avg_deal_value, 2) as avg_deal_value,
          ROUND(avg_probability, 2) as avg_probability,
          deals_last_30_days,
          won_deals,
          lost_deals,
          win_rate,
          COALESCE(conversion_rate, 100) as conversion_rate
        FROM conversion_rates
        ORDER BY display_order
      `);

      const totalDeals = result.rows.reduce((sum, stage) => sum + parseInt(stage.deal_count), 0);
      const totalValue = result.rows.reduce((sum, stage) => sum + parseFloat(stage.total_value), 0);
      const avgWinRate = result.rows.length > 0 
        ? result.rows.reduce((sum, stage) => sum + parseFloat(stage.win_rate), 0) / result.rows.length
        : 0;

      return {
        pipeline_stages: result.rows,
        pipeline_summary: {
          total_deals: totalDeals,
          total_value: Math.round(totalValue * 100) / 100,
          avg_win_rate: Math.round(avgWinRate * 100) / 100,
        },
        last_updated: new Date().toISOString()
      };
    }, 300); // cache for 5 minutes

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fix the funnel analysis too
router.get('/analytics/funnel', async (req, res) => {
  try {
    console.log('🔍 Calculating deal funnel metrics...');

    // Fix: Remove Promise.all destructuring
    const funnelData = await pool.query(`
      WITH monthly_funnel AS (
        SELECT 
          DATE_TRUNC('month', d.created_at) as month,
          ps.name as stage_name,
          ps.display_order,
          COUNT(d.id) as deals_entered,
          COALESCE(SUM(d.value), 0) as value_entered,
          COUNT(CASE WHEN d.status = 'won' THEN 1 END) as deals_won,
          COUNT(CASE WHEN d.status = 'lost' THEN 1 END) as deals_lost
        FROM deals d
        JOIN pipeline_stages ps ON d.pipeline_stage_id = ps.id
        WHERE d.created_at >= CURRENT_DATE - INTERVAL '6 months'
          AND ps.is_active = true
        GROUP BY DATE_TRUNC('month', d.created_at), ps.id, ps.name, ps.display_order
      )
      SELECT 
        month,
        stage_name,
        display_order,
        deals_entered,
        value_entered,
        deals_won,
        deals_lost,
        CASE 
          WHEN deals_entered > 0 THEN ROUND((deals_won::decimal / deals_entered) * 100, 2)
          ELSE 0 
        END as win_rate_percent
      FROM monthly_funnel
      ORDER BY month DESC, display_order
    `);

    // Group by month for easier frontend consumption
    const funnelByMonth = funnelData.rows.reduce((acc, row) => {
      const monthKey = row.month.toISOString().substring(0, 7); // YYYY-MM format
      if (!acc[monthKey]) {
        acc[monthKey] = [];
      }
      acc[monthKey].push(row);
      return acc;
    }, {});

    console.log('✅ Funnel analysis completed');

    res.json({
      funnel_data: funnelByMonth,
      total_months: Object.keys(funnelByMonth).length,
      last_updated: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Funnel analysis error:', error);
    res.status(500).json({ 
      error: 'Funnel analysis service unavailable',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Fix performance analysis too
router.get('/analytics/performance', async (req, res) => {
  try {
    console.log('👥 Calculating user performance metrics...');

    // Fix: Remove Promise.all destructuring
    const performanceData = await pool.query(`
      SELECT 
        u.id as user_id,
        u.first_name || ' ' || u.last_name as user_name,
        u.email,
        u.role,
        COUNT(d.id) as total_deals,
        COUNT(CASE WHEN d.status = 'won' THEN 1 END) as won_deals,
        COUNT(CASE WHEN d.status = 'lost' THEN 1 END) as lost_deals,
        COUNT(CASE WHEN d.status = 'open' THEN 1 END) as active_deals,
        COALESCE(SUM(CASE WHEN d.status = 'won' THEN d.value ELSE 0 END), 0) as total_won_value,
        COALESCE(SUM(CASE WHEN d.status = 'open' THEN d.value ELSE 0 END), 0) as pipeline_value,
        COALESCE(AVG(CASE WHEN d.status = 'won' THEN d.value END), 0) as avg_deal_size,
        CASE 
          WHEN COUNT(d.id) > 0 THEN ROUND((COUNT(CASE WHEN d.status = 'won' THEN 1 END)::decimal / COUNT(d.id)) * 100, 2)
          ELSE 0 
        END as win_rate,
        COUNT(CASE WHEN d.created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as deals_created_30_days,
        COUNT(CASE WHEN d.status = 'won' AND d.updated_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as deals_won_30_days
      FROM users u
      LEFT JOIN deals d ON u.id = d.assigned_user_id
      WHERE u.role IN ('admin', 'sales_rep', 'sales_manager')
      GROUP BY u.id, u.first_name, u.last_name, u.email, u.role
      ORDER BY total_won_value DESC
    `);

    console.log('✅ User performance metrics calculated');

    res.json({
      user_performance: performanceData.rows,
      total_users: performanceData.rows.length,
      last_updated: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Performance analysis error:', error);
    res.status(500).json({ 
      error: 'Performance analysis service unavailable',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ...existing code...

// Deal stage transition with automation
router.put('/deals/:dealId/stage', async (req, res) => {
  try {
    const { dealId } = req.params;
    const { stage_id, notes, trigger_automation = true } = req.body;

    console.log(`🔄 Moving deal ${dealId} to stage ${stage_id}`);

    // Validation schema
    const schema = Joi.object({
      stage_id: Joi.number().integer().positive().required(),
      notes: Joi.string().max(500).allow(''),
      trigger_automation: Joi.boolean().default(true)
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details 
      });
    }

    // Start transaction for atomic operations
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Get current deal info
      const currentDeal = await client.query(`
        SELECT 
          d.*,
          ps_current.name as current_stage_name,
          ps_current.display_order as current_stage_order,
          ps_new.name as new_stage_name,
          ps_new.display_order as new_stage_order,
          ps_new.win_probability as new_win_probability
        FROM deals d
        JOIN pipeline_stages ps_current ON d.pipeline_stage_id = ps_current.id
        JOIN pipeline_stages ps_new ON ps_new.id = $1
        WHERE d.id = $2
      `, [stage_id, dealId]);

      if (currentDeal.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Deal not found' });
      }

      const deal = currentDeal.rows[0];

      // Check if user owns the deal or has permission
      if (deal.assigned_user_id !== req.user.userId && req.user.role !== 'admin') {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Access denied' });
      }

      // Update deal stage and probability
      const updatedDeal = await client.query(`
        UPDATE deals 
        SET 
          pipeline_stage_id = $1,
          probability = $2,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
      `, [stage_id, deal.new_win_probability, dealId]);

      // Log stage transition
      await client.query(`
        INSERT INTO deal_stage_history (
          deal_id, 
          from_stage_id, 
          to_stage_id, 
          changed_by_user_id, 
          notes,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      `, [dealId, deal.pipeline_stage_id, stage_id, req.user.userId, notes || '']);

      // Trigger automation rules if enabled
      if (trigger_automation) {
        await processAutomationRules(client, dealId, deal.pipeline_stage_id, stage_id, req.user.userId);
      }

      await client.query('COMMIT');

      console.log(`✅ Deal ${dealId} moved from ${deal.current_stage_name} to ${deal.new_stage_name}`);

      res.json({
        success: true,
        deal: updatedDeal.rows[0],
        transition: {
          from_stage: deal.current_stage_name,
          to_stage: deal.new_stage_name,
          probability_change: `${deal.probability * 100}% → ${deal.new_win_probability * 100}%`
        },
        automation_triggered: trigger_automation,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ Stage transition error:', error);
    res.status(500).json({ 
      error: 'Stage transition failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Automation rules processor (helper function)
async function processAutomationRules(client, dealId, fromStageId, toStageId, userId) {
  try {
    console.log(`🤖 Processing automation rules for deal ${dealId}`);

    // Get active automation rules for this stage transition
    const rules = await client.query(`
      SELECT * FROM automation_rules 
      WHERE is_active = true 
      AND (from_stage_id = $1 OR from_stage_id IS NULL)
      AND (to_stage_id = $2 OR to_stage_id IS NULL)
      ORDER BY priority DESC
    `, [fromStageId, toStageId]);

    for (const rule of rules.rows) {
      await executeAutomationRule(client, rule, dealId, userId);
    }

    console.log(`✅ Processed ${rules.rows.length} automation rules`);

  } catch (error) {
    console.error('❌ Automation processing error:', error);
    // Don't throw - log error but continue with transaction
  }
}

// Execute individual automation rule
async function executeAutomationRule(client, rule, dealId, userId) {
  try {
    console.log(`🔧 Executing rule: ${rule.name}`);

    switch (rule.action_type) {
      case 'create_task':
  await client.query(`
    INSERT INTO activities (  // ✅ Use activities table
      type,
      subject,
      description,
      deal_id,
      user_id,
      due_date,
      status,
      created_at
    ) VALUES ('task', $1, $2, $3, $4, $5, 'pending', CURRENT_TIMESTAMP)
  `, [
    rule.action_data.title || 'Follow up required',
    rule.action_data.description || 'Automated task created',
    dealId,
    rule.action_data.assigned_user_id || userId,
    new Date(Date.now() + (rule.action_data.days_from_now || 1) * 24 * 60 * 60 * 1000)
  ]);
  break;

      case 'send_email':
        // Queue email notification
        await client.query(`
          INSERT INTO email_queue (
            deal_id,
            recipient_user_id,
            template_name,
            template_data,
            scheduled_at,
            status
          ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, 'pending')
        `, [
          dealId,
          rule.action_data.recipient_user_id || userId,
          rule.action_data.template || 'stage_transition',
          JSON.stringify({ dealId, rule: rule.name })
        ]);
        break;

      case 'update_probability':
        await client.query(`
          UPDATE deals 
          SET probability = $1 
          WHERE id = $2
        `, [rule.action_data.probability, dealId]);
        break;

      default:
        console.log(`⚠️ Unknown automation action: ${rule.action_type}`);
    }

    // Log automation execution
    await client.query(`
      INSERT INTO automation_log (
        rule_id,
        deal_id,
        executed_by_user_id,
        execution_result,
        executed_at
      ) VALUES ($1, $2, $3, 'success', CURRENT_TIMESTAMP)
    `, [rule.id, dealId, userId]);

  } catch (error) {
    console.error(`❌ Rule execution failed: ${rule.name}`, error);
    
    // Log failed execution
    await client.query(`
      INSERT INTO automation_log (
        rule_id,
        deal_id,
        executed_by_user_id,
        execution_result,
        error_message,
        executed_at
      ) VALUES ($1, $2, $3, 'failed', $4, CURRENT_TIMESTAMP)
    `, [rule.id, dealId, userId, error.message]);
  }
}

// Get automation rules
router.get('/automation/rules', async (req, res) => {
  try {
    console.log('🤖 Fetching automation rules...');

    const rules = await pool.query(`
      SELECT 
        ar.*,
        ps_from.name as from_stage_name,
        ps_to.name as to_stage_name,
        u.first_name || ' ' || u.last_name as created_by_name
      FROM automation_rules ar
      LEFT JOIN pipeline_stages ps_from ON ar.from_stage_id = ps_from.id
      LEFT JOIN pipeline_stages ps_to ON ar.to_stage_id = ps_to.id
      LEFT JOIN users u ON ar.created_by_user_id = u.id
      WHERE ar.is_active = true
      ORDER BY ar.priority DESC, ar.created_at DESC
    `);

    console.log(`✅ Retrieved ${rules.rows.length} automation rules`);

    res.json({
      automation_rules: rules.rows,
      total_rules: rules.rows.length,
      last_updated: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Automation rules fetch error:', error);
    res.status(500).json({ 
      error: 'Automation rules service unavailable',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;