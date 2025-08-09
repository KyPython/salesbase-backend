/**
 * Script to run database migrations
 * 
 * Usage:
 * - Run all migrations: node migrate.js
 * - Run specific migration: node migrate.js up 20231018_audit_logs.js
 * - Rollback specific migration: node migrate.js down 20231018_audit_logs.js
 */

require('dotenv').config();
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// Check if node-pg-migrate is installed
try {
  require('node-pg-migrate');
} catch (e) {
  console.error('Error: node-pg-migrate is not installed. Please install it with:');
  console.error('npm install node-pg-migrate pg');
  process.exit(1);
}

// Get command line arguments
const args = process.argv.slice(2);
const direction = args[0] || 'up';
const migrationFile = args[1] || '';

if (!['up', 'down'].includes(direction)) {
  console.error('Error: First argument must be either "up" or "down"');
  process.exit(1);
}

// Get database connection string from environment variables
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL environment variable is not set');
  process.exit(1);
}

// Get migration directory
const MIGRATION_DIR = path.join(__dirname, 'migrations');

// Create migrations directory if it doesn't exist
if (!fs.existsSync(MIGRATION_DIR)) {
  fs.mkdirSync(MIGRATION_DIR, { recursive: true });
}

// Check if specified migration file exists (if provided)
if (migrationFile && !fs.existsSync(path.join(MIGRATION_DIR, migrationFile))) {
  console.error(`Error: Migration file ${migrationFile} not found in ${MIGRATION_DIR}`);
  process.exit(1);
}

// Build the command
const command = [
  'npx node-pg-migrate',
  direction,
  `--migrations-dir=${MIGRATION_DIR}`,
  `--migrations-table=pgmigrations`,
  `--database-url-var=DATABASE_URL`,
];

if (migrationFile) {
  command.push(`--file=${migrationFile}`);
}

// Execute the migration
console.log(`Running migration: ${direction} ${migrationFile || 'all migrations'}`);
const migrateProcess = exec(command.join(' '), {
  env: { ...process.env, DATABASE_URL }
});

migrateProcess.stdout.on('data', (data) => {
  console.log(data);
});

migrateProcess.stderr.on('data', (data) => {
  console.error(data);
});

migrateProcess.on('close', (code) => {
  if (code === 0) {
    console.log(`Migration ${direction} completed successfully`);
  } else {
    console.error(`Migration ${direction} failed with code ${code}`);
  }
});
