/**
 * Reports API Controller
 * 
 * Provides endpoints for generating reports, managing report templates,
 * and scheduling automated reports.
 */
const express = require('express');
const router = express.Router();
const { ReportService, REPORT_TYPES } = require('../services/reportService');
const { authenticateToken, authorizePermissions } = require('../middleware');
const { validateRequest } = require('../middleware/validation');
const { body, query, param } = require('express-validator');

// Initialize report service
const reportService = new ReportService();

/**
 * @route GET /api/reports/types
 * @desc Get available report types
 * @access Private (requires read:reports permission)
 */
router.get('/types', 
  authenticateToken,
  authorizePermissions(['read:reports']),
  (req, res) => {
    try {
      // Format report types for frontend consumption
      const reportTypes = Object.entries(REPORT_TYPES).map(([key, value]) => ({
        id: key,
        name: value.name,
        description: value.description,
        filters: value.filters,
        permissions: value.permissions
      }));
      
      res.json({ success: true, data: reportTypes });
    } catch (error) {
      console.error('Error retrieving report types:', error);
      res.status(500).json({ success: false, message: 'Failed to retrieve report types' });
    }
  }
);

/**
 * @route POST /api/reports/generate
 * @desc Generate a report
 * @access Private (requires permissions specified in report definition)
 */
router.post('/generate',
  authenticateToken,
  validateRequest([
    body('reportType').notEmpty().withMessage('Report type is required'),
    body('format').isIn(['json', 'csv', 'xlsx']).withMessage('Invalid format'),
    body('save').optional().isBoolean()
  ]),
  async (req, res) => {
    try {
      const { reportType, filters = {}, format = 'json', save = false } = req.body;
      
      // Check if report type exists
      const reportDefinition = REPORT_TYPES[reportType];
      if (!reportDefinition) {
        return res.status(404).json({ 
          success: false, 
          message: `Report type "${reportType}" not found` 
        });
      }
      
      // Verify permissions
      if (!req.user.permissions.some(p => reportDefinition.permissions.includes(p))) {
        return res.status(403).json({ 
          success: false, 
          message: 'You do not have permission to generate this report' 
        });
      }
      
      // Generate the report
      const report = await reportService.generateReport(reportType, {
        tenantId: req.user.tenantId,
        filters,
        format,
        save,
        userId: req.user.id
      });
      
      // Set appropriate content type header for file downloads
      if (format !== 'json') {
        res.setHeader('Content-Type', report.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="report.${format}"`);
        return res.send(report.data);
      }
      
      // Return JSON response
      res.json({
        success: true,
        data: report.data,
        metadata: report.metadata,
        ...(report.savedReport ? { reportId: report.savedReport.id } : {})
      });
    } catch (error) {
      console.error('Error generating report:', error);
      res.status(500).json({ success: false, message: 'Failed to generate report' });
    }
  }
);

/**
 * @route GET /api/reports/saved
 * @desc Get list of saved reports
 * @access Private (requires read:reports permission)
 */
router.get('/saved',
  authenticateToken,
  authorizePermissions(['read:reports']),
  async (req, res) => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const offset = (page - 1) * limit;
      
      // Query saved reports for the tenant
      const result = await req.app.get('db').query(
        `SELECT id, report_type, report_name, file_format, 
                row_count, created_at
         FROM reports
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [req.user.tenantId, limit, offset]
      );
      
      // Get total count for pagination
      const countResult = await req.app.get('db').query(
        'SELECT COUNT(*) FROM reports WHERE tenant_id = $1',
        [req.user.tenantId]
      );
      
      const totalReports = parseInt(countResult.rows[0].count);
      
      res.json({
        success: true,
        data: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalReports,
          pages: Math.ceil(totalReports / limit)
        }
      });
    } catch (error) {
      console.error('Error retrieving saved reports:', error);
      res.status(500).json({ success: false, message: 'Failed to retrieve saved reports' });
    }
  }
);

/**
 * @route GET /api/reports/saved/:id
 * @desc Get a saved report by ID
 * @access Private (requires read:reports permission)
 */
router.get('/saved/:id',
  authenticateToken,
  authorizePermissions(['read:reports']),
  validateRequest([
    param('id').isUUID().withMessage('Invalid report ID')
  ]),
  async (req, res) => {
    try {
      // Check if the report belongs to the tenant
      const checkResult = await req.app.get('db').query(
        'SELECT tenant_id FROM reports WHERE id = $1',
        [req.params.id]
      );
      
      if (checkResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Report not found' });
      }
      
      if (checkResult.rows[0].tenant_id !== req.user.tenantId) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      
      // Retrieve the report
      const report = await reportService.getSavedReport(req.params.id);
      
      // Set appropriate content type for file downloads
      if (report.metadata.file_format !== 'json') {
        res.setHeader('Content-Type', report.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${report.metadata.id}.${report.metadata.file_format}"`);
        return res.send(report.data);
      }
      
      // Return JSON response
      res.json({ success: true, data: report.data, metadata: report.metadata });
    } catch (error) {
      console.error('Error retrieving saved report:', error);
      res.status(500).json({ success: false, message: 'Failed to retrieve saved report' });
    }
  }
);

/**
 * @route POST /api/reports/templates
 * @desc Create a custom report template
 * @access Private (requires create:reports permission)
 */
router.post('/templates',
  authenticateToken,
  authorizePermissions(['create:reports']),
  validateRequest([
    body('name').notEmpty().withMessage('Template name is required'),
    body('query').notEmpty().withMessage('SQL query is required'),
    body('permissions').isArray().withMessage('Permissions must be an array')
  ]),
  async (req, res) => {
    try {
      const { name, description, query, filters, permissions } = req.body;
      
      // Create the template
      const template = await reportService.createReportTemplate({
        name,
        description,
        query,
        filters,
        permissions,
        tenantId: req.user.tenantId,
        createdBy: req.user.id
      });
      
      res.status(201).json({ success: true, data: template });
    } catch (error) {
      console.error('Error creating report template:', error);
      res.status(500).json({ success: false, message: 'Failed to create report template' });
    }
  }
);

/**
 * @route GET /api/reports/templates
 * @desc Get list of report templates
 * @access Private (requires read:reports permission)
 */
router.get('/templates',
  authenticateToken,
  authorizePermissions(['read:reports']),
  async (req, res) => {
    try {
      // Get templates accessible by the user
      const result = await req.app.get('db').query(
        `SELECT id, name, description, filters, permissions, is_public, created_at
         FROM report_templates
         WHERE tenant_id = $1 OR is_public = true
         ORDER BY name`,
        [req.user.tenantId]
      );
      
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error('Error retrieving report templates:', error);
      res.status(500).json({ success: false, message: 'Failed to retrieve report templates' });
    }
  }
);

/**
 * @route POST /api/reports/schedules
 * @desc Schedule a recurring report
 * @access Private (requires create:reports permission)
 */
router.post('/schedules',
  authenticateToken,
  authorizePermissions(['create:reports']),
  validateRequest([
    body('reportType').notEmpty().withMessage('Report type is required'),
    body('frequency').isIn(['daily', 'weekly', 'monthly']).withMessage('Invalid frequency'),
    body('format').isIn(['json', 'csv', 'xlsx', 'pdf']).withMessage('Invalid format'),
    body('recipients').isArray().withMessage('Recipients must be an array')
  ]),
  async (req, res) => {
    try {
      const { 
        reportType, filters, format, frequency,
        time, dayOfWeek, dayOfMonth, recipients
      } = req.body;
      
      // Validate day of week for weekly schedules
      if (frequency === 'weekly' && (dayOfWeek < 0 || dayOfWeek > 6)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Day of week must be between 0 and 6 (0 = Sunday)' 
        });
      }
      
      // Validate day of month for monthly schedules
      if (frequency === 'monthly' && (dayOfMonth < 1 || dayOfMonth > 31)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Day of month must be between 1 and 31' 
        });
      }
      
      // Create the schedule
      const schedule = await reportService.scheduleReport({
        reportType,
        filters,
        format,
        frequency,
        time,
        dayOfWeek: frequency === 'weekly' ? dayOfWeek : null,
        dayOfMonth: frequency === 'monthly' ? dayOfMonth : null,
        recipients,
        tenantId: req.user.tenantId,
        userId: req.user.id
      });
      
      res.status(201).json({ success: true, data: schedule });
    } catch (error) {
      console.error('Error scheduling report:', error);
      res.status(500).json({ success: false, message: 'Failed to schedule report' });
    }
  }
);

/**
 * @route GET /api/reports/schedules
 * @desc Get list of report schedules
 * @access Private (requires read:reports permission)
 */
router.get('/schedules',
  authenticateToken,
  authorizePermissions(['read:reports']),
  async (req, res) => {
    try {
      // Get schedules for the tenant
      const result = await req.app.get('db').query(
        `SELECT id, report_type, format, frequency, schedule_time,
                day_of_week, day_of_month, recipients, is_active, 
                last_run, created_at
         FROM report_schedules
         WHERE tenant_id = $1
         ORDER BY created_at DESC`,
        [req.user.tenantId]
      );
      
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error('Error retrieving report schedules:', error);
      res.status(500).json({ success: false, message: 'Failed to retrieve report schedules' });
    }
  }
);

/**
 * @route PUT /api/reports/schedules/:id
 * @desc Update a report schedule
 * @access Private (requires edit:reports permission)
 */
router.put('/schedules/:id',
  authenticateToken,
  authorizePermissions(['edit:reports']),
  validateRequest([
    param('id').isInt().withMessage('Invalid schedule ID')
  ]),
  async (req, res) => {
    try {
      // Check if the schedule belongs to the tenant
      const checkResult = await req.app.get('db').query(
        'SELECT tenant_id FROM report_schedules WHERE id = $1',
        [req.params.id]
      );
      
      if (checkResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Schedule not found' });
      }
      
      if (checkResult.rows[0].tenant_id !== req.user.tenantId) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      
      // Extract fields that can be updated
      const { 
        filters, format, frequency, time, 
        dayOfWeek, dayOfMonth, recipients, isActive
      } = req.body;
      
      // Update the schedule
      const result = await req.app.get('db').query(
        `UPDATE report_schedules
         SET filters = $1,
             format = $2,
             frequency = $3,
             schedule_time = $4,
             day_of_week = $5,
             day_of_month = $6,
             recipients = $7,
             is_active = $8,
             updated_at = NOW()
         WHERE id = $9
         RETURNING *`,
        [
          JSON.stringify(filters || {}),
          format,
          frequency,
          time,
          dayOfWeek,
          dayOfMonth,
          JSON.stringify(recipients || []),
          isActive,
          req.params.id
        ]
      );
      
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      console.error('Error updating report schedule:', error);
      res.status(500).json({ success: false, message: 'Failed to update report schedule' });
    }
  }
);

/**
 * @route DELETE /api/reports/schedules/:id
 * @desc Delete a report schedule
 * @access Private (requires delete:reports permission)
 */
router.delete('/schedules/:id',
  authenticateToken,
  authorizePermissions(['delete:reports']),
  validateRequest([
    param('id').isInt().withMessage('Invalid schedule ID')
  ]),
  async (req, res) => {
    try {
      // Check if the schedule belongs to the tenant
      const checkResult = await req.app.get('db').query(
        'SELECT tenant_id FROM report_schedules WHERE id = $1',
        [req.params.id]
      );
      
      if (checkResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Schedule not found' });
      }
      
      if (checkResult.rows[0].tenant_id !== req.user.tenantId) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      
      // Delete the schedule
      await req.app.get('db').query(
        'DELETE FROM report_schedules WHERE id = $1',
        [req.params.id]
      );
      
      res.json({ success: true, message: 'Report schedule deleted successfully' });
    } catch (error) {
      console.error('Error deleting report schedule:', error);
      res.status(500).json({ success: false, message: 'Failed to delete report schedule' });
    }
  }
);

module.exports = router;
