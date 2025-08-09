/**
 * Migration Executor
 * 
 * This script executes all database migrations to set up or update
 * the database schema for the SalesBase application.
 */
require('dotenv').config();
const pool = require('./db');
const logger = require('./utils/logger');
const { migrateReportsFeature } = require('./migrations/reportsMigration');

/**
 * Run all migrations in sequence
 */
async function runMigrations() {
  const client = await pool.connect();
  
  try {
    logger.info('Starting database migrations...');
    
    // Begin transaction
    await client.query('BEGIN');
    
    // Create migrations table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    
    // Check which migrations have been applied
    const { rows: appliedMigrations } = await client.query(
      'SELECT name FROM migrations'
    );
    const appliedMigrationNames = appliedMigrations.map(m => m.name);
    
    // Define migrations
    const migrations = [
      { 
        name: 'initial_schema', 
        description: 'Initial database schema',
        // This would be your existing migrations
        execute: async () => {
          logger.info('Skipping initial schema migration (assumed to exist)');
          return true;
        }
      },
      {
        name: 'reports_feature',
        description: 'Advanced reporting system',
        execute: migrateReportsFeature
      }
    ];
    
    // Apply each migration that hasn't been applied yet
    for (const migration of migrations) {
      if (!appliedMigrationNames.includes(migration.name)) {
        logger.info(`Applying migration: ${migration.name} - ${migration.description}`);
        
        try {
          // Execute the migration
          await migration.execute(client);
          
          // Record the migration
          await client.query(
            'INSERT INTO migrations (name) VALUES ($1)',
            [migration.name]
          );
          
          logger.info(`Migration ${migration.name} applied successfully`);
        } catch (migrationError) {
          logger.error(`Error applying migration ${migration.name}:`, migrationError);
          throw migrationError;
        }
      } else {
        logger.info(`Migration ${migration.name} already applied, skipping`);
      }
    }
    
    // Commit transaction
    await client.query('COMMIT');
    
    logger.info('All migrations completed successfully');
  } catch (error) {
    // Rollback on error
    await client.query('ROLLBACK');
    logger.error('Error during migrations, rolled back:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Execute migrations if this script is run directly
if (require.main === module) {
  runMigrations()
    .then(() => {
      logger.info('Migration process completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Migration process failed:', error);
      process.exit(1);
    });
}

module.exports = { runMigrations };
