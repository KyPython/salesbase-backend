/**
 * Email Service
 * 
 * Provides enterprise email integration with tracking, templates,
 * and queueing capabilities.
 */
const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
const handlebars = require('handlebars');
const { v4: uuidv4 } = require('uuid');
const pool = require('../database');

// Email configuration
const emailConfig = {
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT || 587,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
  from: process.env.EMAIL_FROM || 'noreply@salesbase.com',
};

// Tracking domain for open/click tracking
const TRACKING_DOMAIN = process.env.TRACKING_DOMAIN || 'track.salesbase.com';

// Create email transporter
const transporter = nodemailer.createTransport({
  host: emailConfig.host,
  port: emailConfig.port,
  secure: emailConfig.secure,
  auth: emailConfig.auth,
});

// Template cache to avoid reading from disk repeatedly
const templateCache = {};

/**
 * Loads and compiles an email template
 * 
 * @param {string} templateName - Name of the template file (without extension)
 * @returns {Promise<Function>} - Compiled handlebars template function
 */
const getTemplate = async (templateName) => {
  if (templateCache[templateName]) {
    return templateCache[templateName];
  }
  
  try {
    const templatePath = path.join(__dirname, '../templates/email', `${templateName}.html`);
    const templateSource = await fs.readFile(templatePath, 'utf8');
    const template = handlebars.compile(templateSource);
    
    templateCache[templateName] = template;
    return template;
  } catch (error) {
    console.error(`Error loading email template '${templateName}':`, error);
    throw new Error(`Email template '${templateName}' not found`);
  }
};

/**
 * Adds tracking pixels and link tracking to HTML emails
 * 
 * @param {string} html - Original HTML email content
 * @param {string} trackingId - Unique ID for tracking this email
 * @returns {string} - HTML with tracking elements added
 */
const addTracking = (html, trackingId) => {
  // Add tracking pixel for open tracking
  const trackingPixel = `<img src="https://${TRACKING_DOMAIN}/track/open/${trackingId}" width="1" height="1" alt="" style="display:none;">`;
  
  // Add tracking to all links
  let trackedHtml = html.replace(/<\/body>/i, `${trackingPixel}</body>`);
  
  // Replace links with tracked versions
  trackedHtml = trackedHtml.replace(
    /<a\s+(?:[^>]*?\s+)?href=["']([^"']*)["']([^>]*)>/gi,
    (match, url, rest) => {
      // Skip links that are already tracked or are anchor links
      if (url.includes(TRACKING_DOMAIN) || url.startsWith('#')) {
        return match;
      }
      
      // Create tracked link
      const encodedUrl = encodeURIComponent(url);
      const trackingUrl = `https://${TRACKING_DOMAIN}/track/click/${trackingId}?url=${encodedUrl}`;
      
      return `<a href="${trackingUrl}"${rest}>`;
    }
  );
  
  return trackedHtml;
};

/**
 * Records an email in the database for tracking
 * 
 * @param {Object} emailData - Email information to record
 * @returns {Promise<string>} - The tracking ID
 */
const recordEmail = async (emailData) => {
  const trackingId = uuidv4();
  
  try {
    await db.query(
      `INSERT INTO email_tracking 
       (tracking_id, recipient_email, recipient_name, subject, template_name, 
        metadata, tenant_id, user_id, related_entity_type, related_entity_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        trackingId,
        emailData.to,
        emailData.recipientName || null,
        emailData.subject,
        emailData.template || null,
        JSON.stringify(emailData.metadata || {}),
        emailData.tenantId || null,
        emailData.userId || null,
        emailData.entityType || null,
        emailData.entityId || null
      ]
    );
    
    return trackingId;
  } catch (error) {
    console.error('Error recording email for tracking:', error);
    // Still return the tracking ID, but tracking might not work
    return trackingId;
  }
};

/**
 * Sends an email
 * 
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} [options.text] - Plain text content
 * @param {string} [options.html] - HTML content
 * @param {string} [options.template] - Template name to use
 * @param {Object} [options.templateData] - Data for the template
 * @param {boolean} [options.track=true] - Whether to track opens and clicks
 * @param {Object} [options.metadata] - Additional metadata for tracking
 * @param {number} [options.tenantId] - ID of the tenant
 * @param {number} [options.userId] - ID of the user sending the email
 * @param {string} [options.entityType] - Type of related entity (lead, deal, etc.)
 * @param {number} [options.entityId] - ID of related entity
 * @returns {Promise<Object>} - Information about the sent email
 */
const sendEmail = async (options) => {
  try {
    // Initialize email data
    const emailData = {
      from: options.from || emailConfig.from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments,
      // Additional data for tracking
      recipientName: options.recipientName,
      template: options.template,
      metadata: options.metadata,
      tenantId: options.tenantId,
      userId: options.userId,
      entityType: options.entityType,
      entityId: options.entityId,
    };
    
    // If template is specified, use it
    if (options.template) {
      const template = await getTemplate(options.template);
      emailData.html = template(options.templateData || {});
      
      // Generate plain text if not provided
      if (!options.text) {
        // Simple HTML to text conversion
        emailData.text = emailData.html
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
    }
    
    // Check if we have content to send
    if (!emailData.html && !emailData.text) {
      throw new Error('Email content is required (html or text)');
    }
    
    // Add tracking if enabled
    let trackingId = null;
    if (options.track !== false && emailData.html) {
      trackingId = await recordEmail(emailData);
      emailData.html = addTracking(emailData.html, trackingId);
    }
    
    // Send the email
    const info = await transporter.sendMail(emailData);
    
    // Record the message ID
    if (trackingId) {
      await db.query(
        'UPDATE email_tracking SET message_id = $1, sent_at = NOW() WHERE tracking_id = $2',
        [info.messageId, trackingId]
      );
    }
    
    return {
      messageId: info.messageId,
      trackingId,
      recipient: options.to,
      subject: options.subject,
      template: options.template,
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

/**
 * Records an email open event
 * 
 * @param {string} trackingId - Tracking ID of the email
 * @param {Object} metadata - Additional metadata about the open
 * @returns {Promise<boolean>} - Whether the event was recorded
 */
const recordOpen = async (trackingId, metadata = {}) => {
  try {
    await db.query(
      `INSERT INTO email_events (tracking_id, event_type, metadata)
       VALUES ($1, 'open', $2)`,
      [trackingId, JSON.stringify(metadata)]
    );
    return true;
  } catch (error) {
    console.error('Error recording email open event:', error);
    return false;
  }
};

/**
 * Records an email click event
 * 
 * @param {string} trackingId - Tracking ID of the email
 * @param {string} url - URL that was clicked
 * @param {Object} metadata - Additional metadata about the click
 * @returns {Promise<boolean>} - Whether the event was recorded
 */
const recordClick = async (trackingId, url, metadata = {}) => {
  try {
    const clickData = {
      ...metadata,
      url,
    };
    
    await db.query(
      `INSERT INTO email_events (tracking_id, event_type, metadata)
       VALUES ($1, 'click', $2)`,
      [trackingId, JSON.stringify(clickData)]
    );
    return true;
  } catch (error) {
    console.error('Error recording email click event:', error);
    return false;
  }
};

/**
 * Gets email tracking information
 * 
 * @param {Object} filters - Filter criteria
 * @param {string} [filters.trackingId] - Filter by tracking ID
 * @param {string} [filters.email] - Filter by recipient email
 * @param {string} [filters.entityType] - Filter by entity type
 * @param {number} [filters.entityId] - Filter by entity ID
 * @param {number} [filters.userId] - Filter by user ID
 * @param {number} [filters.tenantId] - Filter by tenant ID
 * @returns {Promise<Object>} - Email tracking data with events
 */
const getEmailTracking = async (filters = {}) => {
  try {
    // Build the query based on filters
    let query = `
      SELECT et.*, 
        ARRAY_AGG(DISTINCT jsonb_build_object(
          'id', ee.id, 
          'eventType', ee.event_type, 
          'timestamp', ee.created_at,
          'metadata', ee.metadata
        )) AS events
      FROM email_tracking et
      LEFT JOIN email_events ee ON et.tracking_id = ee.tracking_id
      WHERE 1=1
    `;
    
    const queryParams = [];
    let paramCount = 1;
    
    // Add filters
    if (filters.trackingId) {
      query += ` AND et.tracking_id = $${paramCount++}`;
      queryParams.push(filters.trackingId);
    }
    
    if (filters.email) {
      query += ` AND et.recipient_email = $${paramCount++}`;
      queryParams.push(filters.email);
    }
    
    if (filters.entityType) {
      query += ` AND et.related_entity_type = $${paramCount++}`;
      queryParams.push(filters.entityType);
    }
    
    if (filters.entityId) {
      query += ` AND et.related_entity_id = $${paramCount++}`;
      queryParams.push(filters.entityId);
    }
    
    if (filters.userId) {
      query += ` AND et.user_id = $${paramCount++}`;
      queryParams.push(filters.userId);
    }
    
    if (filters.tenantId) {
      query += ` AND et.tenant_id = $${paramCount++}`;
      queryParams.push(filters.tenantId);
    }
    
    // Group by tracking ID
    query += ` GROUP BY et.id ORDER BY et.sent_at DESC`;
    
    // Execute the query
    const result = await db.query(query, queryParams);
    
    return result.rows;
  } catch (error) {
    console.error('Error retrieving email tracking:', error);
    throw error;
  }
};

/**
 * Creates a migration for email tracking tables
 */
const createMigration = async () => {
  const migration = `
    -- Create email_tracking table
    CREATE TABLE IF NOT EXISTS email_tracking (
      id SERIAL PRIMARY KEY,
      tracking_id UUID NOT NULL UNIQUE,
      message_id VARCHAR(255),
      recipient_email VARCHAR(255) NOT NULL,
      recipient_name VARCHAR(255),
      subject TEXT NOT NULL,
      template_name VARCHAR(100),
      metadata JSONB DEFAULT '{}',
      tenant_id INTEGER,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      related_entity_type VARCHAR(50),
      related_entity_id INTEGER,
      sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Create index for faster queries
    CREATE INDEX IF NOT EXISTS idx_email_tracking_recipient ON email_tracking(recipient_email);
    CREATE INDEX IF NOT EXISTS idx_email_tracking_entity ON email_tracking(related_entity_type, related_entity_id);
    CREATE INDEX IF NOT EXISTS idx_email_tracking_tenant ON email_tracking(tenant_id);
    
    -- Create email_events table for open/click tracking
    CREATE TABLE IF NOT EXISTS email_events (
      id SERIAL PRIMARY KEY,
      tracking_id UUID NOT NULL REFERENCES email_tracking(tracking_id) ON DELETE CASCADE,
      event_type VARCHAR(20) NOT NULL, -- 'open', 'click', etc.
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    
    -- Create index for faster queries
    CREATE INDEX IF NOT EXISTS idx_email_events_tracking ON email_events(tracking_id);
    CREATE INDEX IF NOT EXISTS idx_email_events_type ON email_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_email_events_created ON email_events(created_at);
  `;
  
  return migration;
};

module.exports = {
  sendEmail,
  recordOpen,
  recordClick,
  getEmailTracking,
  createMigration
};
