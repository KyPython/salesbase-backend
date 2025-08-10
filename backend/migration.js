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
      },
      {
        name: '20231018_permissions',
        description: 'Create permissions and user_permissions tables',
        execute: async (client) => {
          // Create permissions table
          await client.query(`
            CREATE TABLE IF NOT EXISTS permissions (
              id SERIAL PRIMARY KEY,
              permission_name VARCHAR(100) NOT NULL UNIQUE,
              description TEXT,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
          `);
          
          // Create user_permissions table
          await client.query(`
            CREATE TABLE IF NOT EXISTS user_permissions (
              id SERIAL PRIMARY KEY,
              user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
              granted_by INTEGER REFERENCES users(id),
              created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
              UNIQUE(user_id, permission_id)
            )
          `);
          
          // Create indexes
          await client.query(`CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id)`);
          await client.query(`CREATE INDEX IF NOT EXISTS idx_user_permissions_permission_id ON user_permissions(permission_id)`);
          
          // Insert default permissions
          await client.query(`
            INSERT INTO permissions (permission_name, description) 
            VALUES 
              ('create:leads', 'Can create new leads'),
              ('read:leads', 'Can view leads'),
              ('update:leads', 'Can update leads'),
              ('delete:leads', 'Can delete leads'),
              ('create:deals', 'Can create new deals'),
              ('read:deals', 'Can view deals'),
              ('update:deals', 'Can update deals'),
              ('delete:deals', 'Can delete deals'),
              ('create:contacts', 'Can create new contacts'),
              ('read:contacts', 'Can view contacts'),
              ('update:contacts', 'Can update contacts'),
              ('delete:contacts', 'Can delete contacts'),
              ('read:audit_logs', 'Can view audit logs'),
              ('read:users', 'Can view user accounts'),
              ('create:users', 'Can create user accounts'),
              ('update:users', 'Can update user accounts'),
              ('delete:users', 'Can delete user accounts'),
              ('assign:permissions', 'Can assign permissions to users'),
              ('export:data', 'Can export data from the system'),
              ('import:data', 'Can import data into the system')
            ON CONFLICT (permission_name) DO NOTHING
          `);
        }
      }
    ];

    // Run migrations
    for (const migration of migrations) {
      if (!appliedMigrations.some(m => m.name === migration.name)) {
        logger.info(`Applying migration: ${migration.name} - ${migration.description}`);
        await migration.execute(client);
        await client.query(
          'INSERT INTO migrations (name) VALUES ($1)',
          [migration.name]
        );
      } else {
        logger.info(`Migration already applied: ${migration.name}`);
      }
    }

    // Commit transaction
    await client.query('COMMIT');
    logger.info('Database migrations completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { runMigrations };
