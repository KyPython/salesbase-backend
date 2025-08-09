/**
 * Advanced Reporting Engine
 * 
 * Provides a flexible reporting system with custom report templates,
 * scheduled report generation, and multiple export formats.
 */
const pool = require('../db');
const ExcelJS = require('exceljs');
const { Parser } = require('json2csv');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const emailService = require('./emailService');

/**
 * Creates a unique filename for a report
 * 
 * @param {string} reportName - Name of the report
 * @param {string} format - File format (csv, xlsx, pdf)
 * @returns {string} - Unique filename
 */
const createFilename = (reportName, format) => {
  const timestamp = new Date().toISOString().replace(/[:.-]/g, '_');
  const sanitizedName = reportName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_');
  
  return `${sanitizedName}_${timestamp}.${format}`;
};

/**
 * Report types definitions
 */
const REPORT_TYPES = {
  LEADS_BY_STATUS: {
    name: 'Leads by Status',
    description: 'Shows lead counts grouped by status',
    query: `
      SELECT 
        status, 
        COUNT(*) as count,
        AVG(EXTRACT(EPOCH FROM (NOW() - created_at))/86400)::NUMERIC(10,2) as avg_age_days
      FROM 
        leads
      WHERE 
        tenant_id = $1
        [FILTERS]
      GROUP BY 
        status
      ORDER BY 
        count DESC
    `,
    filters: ['dateRange', 'assignedTo', 'source'],
    permissions: ['read:leads', 'read:reports']
  },
  
  SALES_BY_REP: {
    name: 'Sales by Representative',
    description: 'Shows sales performance by sales rep',
    query: `
      SELECT 
        u.first_name || ' ' || u.last_name as sales_rep,
        COUNT(d.id) as deal_count,
        SUM(d.value) as total_value,
        AVG(d.value)::NUMERIC(10,2) as avg_deal_size,
        SUM(CASE WHEN d.stage = 'WON' THEN d.value ELSE 0 END) as won_value,
        SUM(CASE WHEN d.stage = 'LOST' THEN d.value ELSE 0 END) as lost_value,
        COUNT(CASE WHEN d.stage = 'WON' THEN 1 END) as won_count,
        COUNT(CASE WHEN d.stage = 'LOST' THEN 1 END) as lost_count
      FROM 
        deals d
      JOIN 
        users u ON d.assigned_to = u.id
      WHERE 
        d.tenant_id = $1
        [FILTERS]
      GROUP BY 
        u.id, u.first_name, u.last_name
      ORDER BY 
        total_value DESC
    `,
    filters: ['dateRange', 'minDealValue', 'stage'],
    permissions: ['read:deals', 'read:reports']
  },
  
  ACTIVITY_SUMMARY: {
    name: 'Activity Summary',
    description: 'Shows activity counts by type and user',
    query: `
      SELECT 
        activity_type,
        COUNT(*) as count,
        COUNT(DISTINCT user_id) as unique_users
      FROM 
        activities
      WHERE 
        tenant_id = $1
        [FILTERS]
      GROUP BY 
        activity_type
      ORDER BY 
        count DESC
    `,
    filters: ['dateRange', 'userId'],
    permissions: ['read:activities', 'read:reports']
  },
  
  REVENUE_FORECAST: {
    name: 'Revenue Forecast',
    description: 'Projects expected revenue based on deal pipeline',
    query: `
      SELECT 
        date_trunc('month', expected_close_date) as month,
        SUM(value) as total_value,
        SUM(value * 
          CASE 
            WHEN stage = 'PROPOSAL' THEN 0.3
            WHEN stage = 'NEGOTIATION' THEN 0.6
            WHEN stage = 'CONTRACT' THEN 0.9
            WHEN stage = 'WON' THEN 1.0
            ELSE 0
          END
        ) as weighted_value,
        COUNT(*) as deal_count
      FROM 
        deals
      WHERE 
        tenant_id = $1
        AND stage NOT IN ('LOST', 'CANCELLED')
        [FILTERS]
      GROUP BY 
        month
      ORDER BY 
        month
    `,
    filters: ['dateRange', 'minDealValue', 'assignedTo'],
    permissions: ['read:deals', 'read:reports']
  }
};

/**
 * ReportService class for generating and managing reports
 */
class ReportService {
  /**
   * Generate a report from a predefined type
   * 
   * @param {string} reportType - Type of report to generate
   * @param {Object} options - Report generation options
   * @param {number} options.tenantId - Tenant ID
   * @param {Object} [options.filters] - Filter parameters
   * @param {string} [options.format='json'] - Output format (json, csv, xlsx)
   * @param {boolean} [options.save=false] - Whether to save the report
   * @param {number} [options.userId] - User ID generating the report
   * @returns {Promise<Object>} - Report data and metadata
   */
  async generateReport(reportType, options) {
    try {
      const reportDefinition = REPORT_TYPES[reportType];
      
      if (!reportDefinition) {
        throw new Error(`Report type "${reportType}" not found`);
      }
      
      const {
        tenantId,
        filters = {},
        format = 'json',
        save = false,
        userId
      } = options;
      
      // Build the query with filters
      let query = reportDefinition.query;
      const queryParams = [tenantId];
      let paramCount = 2;
      let filterClauses = [];
      
      // Process date range filter
      if (filters.dateRange) {
        const { startDate, endDate } = filters.dateRange;
        
        if (startDate) {
          filterClauses.push(`created_at >= $${paramCount++}`);
          queryParams.push(new Date(startDate));
        }
        
        if (endDate) {
          filterClauses.push(`created_at <= $${paramCount++}`);
          queryParams.push(new Date(endDate));
        }
      }
      
      // Process assigned_to filter
      if (filters.assignedTo) {
        filterClauses.push(`assigned_to = $${paramCount++}`);
        queryParams.push(filters.assignedTo);
      }
      
      // Process user_id filter
      if (filters.userId) {
        filterClauses.push(`user_id = $${paramCount++}`);
        queryParams.push(filters.userId);
      }
      
      // Process source filter
      if (filters.source) {
        filterClauses.push(`source = $${paramCount++}`);
        queryParams.push(filters.source);
      }
      
      // Process minimum deal value filter
      if (filters.minDealValue) {
        filterClauses.push(`value >= $${paramCount++}`);
        queryParams.push(filters.minDealValue);
      }
      
      // Process stage filter
      if (filters.stage) {
        const stages = Array.isArray(filters.stage) ? filters.stage : [filters.stage];
        
        if (stages.length > 0) {
          const placeholders = stages.map((_, i) => `$${paramCount + i}`).join(', ');
          filterClauses.push(`stage IN (${placeholders})`);
          queryParams.push(...stages);
          paramCount += stages.length;
        }
      }
      
      // Replace [FILTERS] placeholder with actual filter clauses
      if (filterClauses.length > 0) {
        query = query.replace('[FILTERS]', `AND ${filterClauses.join(' AND ')}`);
      } else {
        query = query.replace('[FILTERS]', '');
      }
      
      // Execute the query
      const result = await pool.query(query, queryParams);
      const data = result.rows;
      
      // Generate the report in the requested format
      let reportContent;
      let fileContent;
      let contentType;
      
      switch (format.toLowerCase()) {
        case 'csv':
          // Convert data to CSV
          const csvParser = new Parser({ header: true });
          reportContent = csvParser.parse(data);
          fileContent = reportContent;
          contentType = 'text/csv';
          break;
          
        case 'xlsx':
          // Create Excel workbook
          const workbook = new ExcelJS.Workbook();
          const worksheet = workbook.addWorksheet(reportDefinition.name);
          
          // Add headers
          if (data.length > 0) {
            const headers = Object.keys(data[0]);
            worksheet.addRow(headers);
            
            // Style headers
            worksheet.getRow(1).font = { bold: true };
            worksheet.getRow(1).fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFE0E0E0' }
            };
          }
          
          // Add data rows
          data.forEach(row => {
            worksheet.addRow(Object.values(row));
          });
          
          // Auto-fit columns
          worksheet.columns.forEach(column => {
            column.width = 15;
          });
          
          // Generate the Excel file
          reportContent = await workbook.xlsx.writeBuffer();
          fileContent = reportContent;
          contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          break;
          
        case 'json':
        default:
          reportContent = data;
          fileContent = JSON.stringify(data, null, 2);
          contentType = 'application/json';
          break;
      }
      
      // Generate metadata
      const metadata = {
        reportType,
        reportName: reportDefinition.name,
        timestamp: new Date().toISOString(),
        filters,
        rowCount: data.length,
        format,
        generatedBy: userId
      };
      
      // Save the report if requested
      let savedReport = null;
      
      if (save) {
        const filename = createFilename(reportDefinition.name, format.toLowerCase());
        const reportDir = path.join(__dirname, '..', 'reports');
        
        // Create reports directory if it doesn't exist
        try {
          await fs.mkdir(reportDir, { recursive: true });
        } catch (err) {
          console.error('Error creating reports directory:', err);
        }
        
        // Save report file
        const filePath = path.join(reportDir, filename);
        await fs.writeFile(filePath, fileContent);
        
        // Save report metadata to database
        const reportId = uuidv4();
        const reportResult = await pool.query(
          `INSERT INTO reports (
            id, tenant_id, user_id, report_type, report_name, 
            file_path, file_format, filters, row_count
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *`,
          [
            reportId,
            tenantId,
            userId,
            reportType,
            reportDefinition.name,
            filePath,
            format.toLowerCase(),
            JSON.stringify(filters),
            data.length
          ]
        );
        
        savedReport = reportResult.rows[0];
      }
      
      return {
        data: reportContent,
        metadata,
        contentType,
        savedReport
      };
    } catch (error) {
      console.error('Error generating report:', error);
      throw error;
    }
  }
  
  /**
   * Retrieves a saved report
   * 
   * @param {string} reportId - ID of the saved report
   * @returns {Promise<Object>} - Report data and metadata
   */
  async getSavedReport(reportId) {
    try {
      const result = await pool.query(
        'SELECT * FROM reports WHERE id = $1',
        [reportId]
      );
      
      if (result.rows.length === 0) {
        throw new Error(`Report with ID ${reportId} not found`);
      }
      
      const report = result.rows[0];
      
      // Read the report file
      const fileContent = await fs.readFile(report.file_path);
      
      let data;
      let contentType;
      
      switch (report.file_format) {
        case 'csv':
          data = fileContent.toString('utf8');
          contentType = 'text/csv';
          break;
          
        case 'xlsx':
          data = fileContent;
          contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          break;
          
        case 'json':
        default:
          data = JSON.parse(fileContent.toString('utf8'));
          contentType = 'application/json';
          break;
      }
      
      return {
        data,
        metadata: {
          ...report,
          filters: JSON.parse(report.filters)
        },
        contentType
      };
    } catch (error) {
      console.error('Error retrieving saved report:', error);
      throw error;
    }
  }
  
  /**
   * Creates a custom report template
   * 
   * @param {Object} templateData - Template definition
   * @param {string} templateData.name - Template name
   * @param {string} templateData.description - Template description
   * @param {string} templateData.query - SQL query with parameter placeholders
   * @param {string[]} templateData.filters - Available filters
   * @param {string[]} templateData.permissions - Required permissions
   * @param {number} templateData.tenantId - Tenant ID
   * @param {number} templateData.createdBy - User ID of creator
   * @returns {Promise<Object>} - Created template
   */
  async createReportTemplate(templateData) {
    try {
      const result = await pool.query(
        `INSERT INTO report_templates (
          name, description, query, filters, permissions,
          tenant_id, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
          templateData.name,
          templateData.description,
          templateData.query,
          JSON.stringify(templateData.filters || []),
          JSON.stringify(templateData.permissions || []),
          templateData.tenantId,
          templateData.createdBy
        ]
      );
      
      return result.rows[0];
    } catch (error) {
      console.error('Error creating report template:', error);
      throw error;
    }
  }
  
  /**
   * Schedules a report to be generated periodically
   * 
   * @param {Object} scheduleData - Schedule information
   * @param {string} scheduleData.reportType - Predefined report type or template ID
   * @param {Object} scheduleData.filters - Report filters
   * @param {string} scheduleData.format - Output format
   * @param {string} scheduleData.frequency - Schedule frequency (daily, weekly, monthly)
   * @param {string} [scheduleData.time='00:00'] - Time of day to run (HH:MM)
   * @param {number} [scheduleData.dayOfWeek] - Day of week for weekly reports (0-6, 0=Sunday)
   * @param {number} [scheduleData.dayOfMonth] - Day of month for monthly reports (1-31)
   * @param {string[]} [scheduleData.recipients] - Email recipients
   * @param {number} scheduleData.tenantId - Tenant ID
   * @param {number} scheduleData.userId - User ID creating the schedule
   * @returns {Promise<Object>} - Created schedule
   */
  async scheduleReport(scheduleData) {
    try {
      const result = await pool.query(
        `INSERT INTO report_schedules (
          report_type, filters, format, frequency, schedule_time,
          day_of_week, day_of_month, recipients, tenant_id, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          scheduleData.reportType,
          JSON.stringify(scheduleData.filters || {}),
          scheduleData.format || 'pdf',
          scheduleData.frequency,
          scheduleData.time || '00:00',
          scheduleData.dayOfWeek,
          scheduleData.dayOfMonth,
          JSON.stringify(scheduleData.recipients || []),
          scheduleData.tenantId,
          scheduleData.userId
        ]
      );
      
      return result.rows[0];
    } catch (error) {
      console.error('Error scheduling report:', error);
      throw error;
    }
  }
  
  /**
   * Processes scheduled reports that are due to run
   * 
   * @returns {Promise<number>} - Number of reports processed
   */
  async processScheduledReports() {
    try {
      // Get current time information
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentDayOfWeek = now.getDay();
      const currentDayOfMonth = now.getDate();
      
      // Format current time for comparison
      const currentTime = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
      
      // Find schedules that should run now
      const result = await pool.query(
        `SELECT * FROM report_schedules
         WHERE schedule_time = $1
         AND (
           frequency = 'daily'
           OR (frequency = 'weekly' AND day_of_week = $2)
           OR (frequency = 'monthly' AND day_of_month = $3)
         )
         AND is_active = true`,
        [currentTime, currentDayOfWeek, currentDayOfMonth]
      );
      
      const schedules = result.rows;
      let processedCount = 0;
      
      // Process each due schedule
      for (const schedule of schedules) {
        try {
          // Generate the report
          const reportOptions = {
            tenantId: schedule.tenant_id,
            filters: JSON.parse(schedule.filters),
            format: schedule.format,
            save: true,
            userId: schedule.created_by
          };
          
          const report = await this.generateReport(schedule.report_type, reportOptions);
          
          // Send email if recipients are specified
          if (schedule.recipients && Array.isArray(JSON.parse(schedule.recipients))) {
            const recipients = JSON.parse(schedule.recipients);
            
            if (recipients.length > 0) {
              // Get report definition for email content
              const reportInfo = REPORT_TYPES[schedule.report_type] || {
                name: 'Custom Report',
                description: 'Generated report'
              };
              
              // Prepare and send email with attachment
              await emailService.sendEmail({
                to: recipients.join(','),
                subject: `Scheduled Report: ${reportInfo.name}`,
                template: 'scheduled-report',
                templateData: {
                  reportName: reportInfo.name,
                  reportDescription: reportInfo.description,
                  generatedAt: new Date().toLocaleString(),
                  rowCount: report.metadata.rowCount,
                  filters: JSON.stringify(reportOptions.filters, null, 2)
                },
                attachments: [
                  {
                    filename: path.basename(report.savedReport.file_path),
                    content: report.data
                  }
                ],
                tenantId: schedule.tenant_id
              });
            }
          }
          
          processedCount++;
          
          // Update last run timestamp
          await pool.query(
            `UPDATE report_schedules
             SET last_run = NOW()
             WHERE id = $1`,
            [schedule.id]
          );
        } catch (scheduleError) {
          console.error(`Error processing scheduled report ${schedule.id}:`, scheduleError);
          
          // Log the error but continue processing other schedules
          await pool.query(
            `UPDATE report_schedules
             SET last_error = $1,
                 error_count = error_count + 1
             WHERE id = $2`,
            [scheduleError.message, schedule.id]
          );
        }
      }
      
      return processedCount;
    } catch (error) {
      console.error('Error processing scheduled reports:', error);
      throw error;
    }
  }
  
  /**
   * Creates migration for reports functionality
   */
  static async createMigration() {
    const migration = `
      -- Create report_templates table
      CREATE TABLE IF NOT EXISTS report_templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        query TEXT NOT NULL,
        filters JSONB DEFAULT '[]',
        permissions JSONB DEFAULT '[]',
        is_public BOOLEAN DEFAULT false,
        tenant_id INTEGER REFERENCES tenants(id),
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      
      -- Create reports table for saved reports
      CREATE TABLE IF NOT EXISTS reports (
        id UUID PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id),
        user_id INTEGER REFERENCES users(id),
        report_type VARCHAR(100) NOT NULL,
        report_name VARCHAR(255) NOT NULL,
        file_path TEXT NOT NULL,
        file_format VARCHAR(50) NOT NULL,
        filters JSONB DEFAULT '{}',
        row_count INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      
      -- Create report schedules table
      CREATE TABLE IF NOT EXISTS report_schedules (
        id SERIAL PRIMARY KEY,
        report_type VARCHAR(100) NOT NULL,
        filters JSONB DEFAULT '{}',
        format VARCHAR(50) DEFAULT 'pdf',
        frequency VARCHAR(50) NOT NULL, -- daily, weekly, monthly
        schedule_time TIME NOT NULL DEFAULT '00:00',
        day_of_week INTEGER, -- 0-6, 0=Sunday (for weekly)
        day_of_month INTEGER, -- 1-31 (for monthly)
        recipients JSONB DEFAULT '[]',
        tenant_id INTEGER REFERENCES tenants(id),
        created_by INTEGER REFERENCES users(id),
        is_active BOOLEAN DEFAULT true,
        last_run TIMESTAMP WITH TIME ZONE,
        last_error TEXT,
        error_count INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      
      -- Create indexes for better performance
      CREATE INDEX IF NOT EXISTS idx_reports_tenant ON reports(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(report_type);
      CREATE INDEX IF NOT EXISTS idx_report_schedules_tenant ON report_schedules(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_report_schedules_frequency ON report_schedules(frequency);
    `;
    
    return migration;
  }
}

/**
 * Report Service Class
 * Handles report generation, scheduling, and delivery
 */
class ReportService {
  constructor() {
    this.reportTypes = REPORT_TYPES;
  }

  /**
   * Generate a report based on type and parameters
   * @param {string} reportType - The type of report to generate
   * @param {Object} filters - Filters to apply to the report
   * @param {string} format - The output format (pdf, xlsx, csv)
   * @returns {Promise<Object>} - The generated report data
   */
  async generateReport(reportType, filters = {}, format = 'pdf') {
    // Implementation would go here
    console.log(`Generating ${reportType} report in ${format} format with filters:`, filters);
    return { success: true, reportType, format };
  }

  /**
   * Schedule a report for recurring generation
   * @param {Object} scheduleConfig - Configuration for the scheduled report
   * @returns {Promise<Object>} - The created schedule
   */
  async scheduleReport(scheduleConfig) {
    // Implementation would go here
    console.log('Scheduling report with config:', scheduleConfig);
    return { success: true, id: Math.floor(Math.random() * 1000) };
  }
}

module.exports = {
  ReportService,
  REPORT_TYPES
};
