/**
 * Database Migrations for Reports Feature
 * 
 * This migration script creates the necessary tables and indexes
 * for the advanced reporting system.
 */
const { ReportService } = require('./services/reportService');
const pool = require('./db');
const logger = require('./utils/logger');

/**
 * Executes the reports feature migrations
 */
async function migrateReportsFeature() {
  try {
    logger.info('Starting reports feature migration...');
    
    // Get the migration SQL from the ReportService
    const migrationSQL = await ReportService.createMigration();
    
    // Execute the migration
    await pool.query(migrationSQL);
    
    // Create tenant_stats table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tenant_stats (
        tenant_id INTEGER REFERENCES tenants(id),
        stat_key VARCHAR(50) NOT NULL,
        stat_value TEXT,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        PRIMARY KEY (tenant_id, stat_key)
      );
    `);
    
    // Create reports directory in the filesystem
    const fs = require('fs').promises;
    const path = require('path');
    const reportsDir = path.join(__dirname, 'reports');
    
    try {
      await fs.mkdir(reportsDir, { recursive: true });
      logger.info('Created reports directory');
    } catch (dirError) {
      logger.error('Error creating reports directory:', dirError);
    }
    
    logger.info('Reports feature migration completed successfully');
    return true;
  } catch (error) {
    logger.error('Error during reports feature migration:', error);
    throw error;
  }
}

module.exports = {
  migrateReportsFeature
};
