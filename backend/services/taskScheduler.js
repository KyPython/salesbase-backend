/**
 * Task Scheduler
 * 
 * Handles scheduling and execution of recurring tasks like report generation,
 * data synchronization, and other background processes.
 */
const cron = require('node-cron');
const { ReportService } = require('./reportService');
const logger = require('../utils/logger');

// Initialize services
const reportService = new ReportService();

/**
 * Task Scheduler Class
 * Manages recurring tasks using node-cron
 */
class TaskScheduler {
  constructor() {
    this.tasks = new Map();
    this.isRunning = false;
  }
  
  /**
   * Start the scheduler and register all tasks
   */
  start() {
    if (this.isRunning) {
      logger.warn('Task scheduler is already running');
      return;
    }
    
    logger.info('Starting task scheduler');
    
    // Register tasks
    this.registerScheduledReportTask();
    this.registerMaintenanceTasks();
    
    this.isRunning = true;
    logger.info('Task scheduler started successfully');
  }
  
  /**
   * Stop all scheduled tasks
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('Task scheduler is not running');
      return;
    }
    
    logger.info('Stopping task scheduler');
    
    // Stop all registered tasks
    for (const [name, task] of this.tasks.entries()) {
      logger.info(`Stopping task: ${name}`);
      task.stop();
    }
    
    this.tasks.clear();
    this.isRunning = false;
    
    logger.info('Task scheduler stopped successfully');
  }
  
  /**
   * Register a task with the scheduler
   * 
   * @param {string} name - Name of the task
   * @param {string} schedule - Cron schedule expression
   * @param {Function} callback - Function to execute
   */
  registerTask(name, schedule, callback) {
    try {
      logger.info(`Registering task: ${name} with schedule: ${schedule}`);
      
      // Create and start the task
      const task = cron.schedule(schedule, async () => {
        try {
          logger.info(`Executing scheduled task: ${name}`);
          await callback();
          logger.info(`Completed scheduled task: ${name}`);
        } catch (error) {
          logger.error(`Error executing scheduled task ${name}:`, error);
        }
      }, {
        scheduled: true,
        timezone: process.env.TIMEZONE || 'UTC'
      });
      
      // Store the task reference
      this.tasks.set(name, task);
      
      logger.info(`Successfully registered task: ${name}`);
    } catch (error) {
      logger.error(`Error registering task ${name}:`, error);
    }
  }
  
  /**
   * Register the task for processing scheduled reports
   */
  registerScheduledReportTask() {
    // Run every minute to check for scheduled reports
    this.registerTask('process-scheduled-reports', '* * * * *', async () => {
      const processedCount = await reportService.processScheduledReports();
      
      if (processedCount > 0) {
        logger.info(`Processed ${processedCount} scheduled reports`);
      }
    });
  }
  
  /**
   * Register database and system maintenance tasks
   */
  registerMaintenanceTasks() {
    // Database vacuum - run daily at 3 AM
    this.registerTask('database-vacuum', '0 3 * * *', async () => {
      const pool = require('./db');
      await pool.query('VACUUM ANALYZE');
      logger.info('Database vacuum completed');
    });
    
    // Clear old report files - run weekly on Sunday at 2 AM
    this.registerTask('cleanup-old-reports', '0 2 * * 0', async () => {
      const fs = require('fs').promises;
      const path = require('path');
      const moment = require('moment');
      
      const reportsDir = path.join(__dirname, 'reports');
      let deletedCount = 0;
      
      try {
        const files = await fs.readdir(reportsDir);
        const now = moment();
        
        for (const file of files) {
          try {
            const filePath = path.join(reportsDir, file);
            const stats = await fs.stat(filePath);
            
            // Delete files older than 30 days
            if (now.diff(moment(stats.mtime), 'days') > 30) {
              await fs.unlink(filePath);
              deletedCount++;
            }
          } catch (fileError) {
            logger.error(`Error processing file ${file}:`, fileError);
          }
        }
        
        if (deletedCount > 0) {
          logger.info(`Deleted ${deletedCount} old report files`);
        }
      } catch (error) {
        logger.error('Error cleaning up old reports:', error);
      }
    });
    
    // Update statistics - run daily at 4 AM
    this.registerTask('update-statistics', '0 4 * * *', async () => {
      try {
        const pool = require('./db');
        await pool.query(`
          WITH report_counts AS (
            SELECT 
              tenant_id,
              COUNT(*) as report_count,
              SUM(row_count) as total_rows
            FROM 
              reports
            GROUP BY 
              tenant_id
          )
          INSERT INTO tenant_stats (tenant_id, stat_key, stat_value, updated_at)
          SELECT 
            r.tenant_id, 
            'report_count', 
            r.report_count::text,
            NOW()
          FROM 
            report_counts r
          ON CONFLICT (tenant_id, stat_key) DO UPDATE 
          SET stat_value = EXCLUDED.stat_value, updated_at = NOW()
        `);
        
        logger.info('Updated tenant statistics');
      } catch (error) {
        logger.error('Error updating statistics:', error);
      }
    });
  }
}

// Export singleton instance
const taskScheduler = new TaskScheduler();
module.exports = taskScheduler;
