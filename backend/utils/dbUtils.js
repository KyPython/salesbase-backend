/**
 * DB Utils - Utility functions for database operations
 */
const pool = require('./db');
const logger = require('./utils/logger');

/**
 * Ensures that all tables in the database have tenant_id columns
 * for multi-tenant data isolation
 */
async function ensureTenantColumns() {
  const client = await pool.connect();
  
  try {
    logger.info('Starting tenant column verification...');
    
    // Get all tables
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      AND table_name NOT IN ('migrations', 'tenants')
    `;
    const tablesResult = await client.query(tablesQuery);
    const tables = tablesResult.rows.map(row => row.table_name);
    
    for (const table of tables) {
      // Check if tenant_id column exists
      const columnQuery = `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = $1
        AND column_name = 'tenant_id'
      `;
      const columnResult = await client.query(columnQuery, [table]);
      
      if (columnResult.rows.length === 0) {
        // Tenant_id column doesn't exist, add it
        logger.info(`Adding tenant_id column to ${table} table`);
        
        // First check if foreign key exists
        const fkQuery = `
          SELECT constraint_name
          FROM information_schema.table_constraints
          WHERE table_schema = 'public'
          AND table_name = $1
          AND constraint_type = 'FOREIGN KEY'
          AND constraint_name LIKE '%tenant%'
        `;
        const fkResult = await client.query(fkQuery, [table]);
        
        if (fkResult.rows.length === 0) {
          // Add tenant_id column and foreign key
          const alterQuery = `
            ALTER TABLE ${table} 
            ADD COLUMN tenant_id INTEGER REFERENCES tenants(id);
          `;
          await client.query(alterQuery);
          
          // Add an index on tenant_id for performance
          const indexQuery = `
            CREATE INDEX IF NOT EXISTS idx_${table}_tenant_id ON ${table}(tenant_id);
          `;
          await client.query(indexQuery);
          
          logger.info(`Added tenant_id column and index to ${table} table`);
        } else {
          logger.info(`Table ${table} already has tenant relationship`);
        }
      } else {
        logger.info(`Table ${table} already has tenant_id column`);
      }
    }
    
    logger.info('Tenant column verification completed');
  } catch (error) {
    logger.error('Error ensuring tenant columns:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  ensureTenantColumns
};
