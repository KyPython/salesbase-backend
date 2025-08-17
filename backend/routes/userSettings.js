const express = require('express');
const pool = require('../db');
const authenticateToken = require('../middleware').authenticateToken;
const router = express.Router();

// Get user settings
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      'SELECT * FROM user_settings WHERE user_id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      // Create default settings if none exist
      const defaultSettings = await pool.query(`
        INSERT INTO user_settings (user_id, theme, language, timezone, email_notifications, sms_notifications, deal_updates, customer_alerts, weekly_reports, session_timeout, password_expiry)
        VALUES ($1, 'light', 'en', 'UTC', true, false, true, true, false, 30, 90)
        RETURNING *
      `, [userId]);
      
      return res.json({ settings: defaultSettings.rows[0] });
    }
    
    res.json({ settings: result.rows[0] });
  } catch (error) {
    console.error('Error fetching user settings:', error);
    res.status(500).json({ error: 'Failed to fetch user settings' });
  }
});

// Update user settings
router.put('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      theme,
      language,
      timezone,
      email_notifications,
      sms_notifications,
      deal_updates,
      customer_alerts,
      weekly_reports,
      session_timeout,
      password_expiry
    } = req.body;
    
    // Validate theme
    if (theme && !['light', 'dark'].includes(theme)) {
      return res.status(400).json({ error: 'Invalid theme value' });
    }
    
    // Validate session timeout
    if (session_timeout && ![15, 30, 60, 120].includes(session_timeout)) {
      return res.status(400).json({ error: 'Invalid session timeout value' });
    }
    
    // Validate password expiry
    if (password_expiry && ![30, 60, 90, 180].includes(password_expiry)) {
      return res.status(400).json({ error: 'Invalid password expiry value' });
    }
    
    const result = await pool.query(`
      INSERT INTO user_settings (user_id, theme, language, timezone, email_notifications, sms_notifications, deal_updates, customer_alerts, weekly_reports, session_timeout, password_expiry)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        theme = EXCLUDED.theme,
        language = EXCLUDED.language,
        timezone = EXCLUDED.timezone,
        email_notifications = EXCLUDED.email_notifications,
        sms_notifications = EXCLUDED.sms_notifications,
        deal_updates = EXCLUDED.deal_updates,
        customer_alerts = EXCLUDED.customer_alerts,
        weekly_reports = EXCLUDED.weekly_reports,
        session_timeout = EXCLUDED.session_timeout,
        password_expiry = EXCLUDED.password_expiry,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [
      userId,
      theme || 'light',
      language || 'en',
      timezone || 'UTC',
      email_notifications !== undefined ? email_notifications : true,
      sms_notifications !== undefined ? sms_notifications : false,
      deal_updates !== undefined ? deal_updates : true,
      customer_alerts !== undefined ? customer_alerts : true,
      weekly_reports !== undefined ? weekly_reports : false,
      session_timeout || 30,
      password_expiry || 90
    ]);
    
    res.json({ 
      message: 'Settings updated successfully',
      settings: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating user settings:', error);
    res.status(500).json({ error: 'Failed to update user settings' });
  }
});

// Update specific setting (e.g., just theme)
router.patch('/:setting', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { setting } = req.params;
    const { value } = req.body;
    
    // Validate setting field
    const allowedSettings = [
      'theme', 'language', 'timezone', 'email_notifications', 
      'sms_notifications', 'deal_updates', 'customer_alerts', 
      'weekly_reports', 'session_timeout', 'password_expiry'
    ];
    
    if (!allowedSettings.includes(setting)) {
      return res.status(400).json({ error: 'Invalid setting field' });
    }
    
    // Validate theme value
    if (setting === 'theme' && !['light', 'dark'].includes(value)) {
      return res.status(400).json({ error: 'Invalid theme value' });
    }
    
    // Validate session timeout
    if (setting === 'session_timeout' && ![15, 30, 60, 120].includes(value)) {
      return res.status(400).json({ error: 'Invalid session timeout value' });
    }
    
    // Validate password expiry
    if (setting === 'password_expiry' && ![30, 60, 90, 180].includes(value)) {
      return res.status(400).json({ error: 'Invalid password expiry value' });
    }
    
    // Ensure user has settings record
    await pool.query(`
      INSERT INTO user_settings (user_id, theme, language, timezone, email_notifications, sms_notifications, deal_updates, customer_alerts, weekly_reports, session_timeout, password_expiry)
      VALUES ($1, 'light', 'en', 'UTC', true, false, true, true, false, 30, 90)
      ON CONFLICT (user_id) DO NOTHING
    `, [userId]);
    
    // Update the specific setting
    const result = await pool.query(`
      UPDATE user_settings 
      SET ${setting} = $2, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      RETURNING *
    `, [userId, value]);
    
    res.json({ 
      message: `${setting} updated successfully`,
      settings: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating user setting:', error);
    res.status(500).json({ error: 'Failed to update user setting' });
  }
});

module.exports = router;
