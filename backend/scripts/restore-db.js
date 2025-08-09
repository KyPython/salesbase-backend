#!/usr/bin/env node

/**
 * Database Restore Script
 * 
 * This script restores a PostgreSQL database from a backup file created by the backup-db.js script.
 * 
 * Usage:
 *   node restore-db.js <backup-file> [--overwrite]
 * 
 * Options:
 *   backup-file: Path to the backup file to restore
 *   --overwrite: If provided, the script will drop and recreate the database before restoring
 */

require('dotenv').config();
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Parse command line arguments
if (process.argv.length < 3) {
  console.error('Error: No backup file specified');
  console.log('Usage: node restore-db.js <backup-file> [--overwrite]');
  process.exit(1);
}

const backupFile = process.argv[2];
const overwrite = process.argv.includes('--overwrite');

// Check if backup file exists
if (!fs.existsSync(backupFile)) {
  console.error(`Error: Backup file not found: ${backupFile}`);
  process.exit(1);
}

// Extract database connection details from DATABASE_URL
const parseDbUrl = (url) => {
  const regex = /postgres:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/;
  const match = url.match(regex);
  
  if (!match) {
    throw new Error('Invalid DATABASE_URL format');
  }
  
  return {
    user: match[1],
    password: match[2],
    host: match[3],
    port: match[4],
    database: match[5]
  };
};

// Get database connection info
let dbInfo;
try {
  dbInfo = parseDbUrl(process.env.DATABASE_URL);
} catch (error) {
  console.error('Error parsing DATABASE_URL:', error.message);
  process.exit(1);
}

// Create readline interface for user confirmation
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const confirmRestore = () => {
  return new Promise((resolve) => {
    rl.question(
      `WARNING: You are about to restore the database '${dbInfo.database}' from backup.\n` +
      `${overwrite ? 'This will DROP the existing database and all its data.\n' : ''}` +
      'Are you sure you want to continue? (yes/no): ',
      (answer) => {
        if (answer.toLowerCase() === 'yes') {
          resolve(true);
        } else {
          console.log('Restore canceled.');
          resolve(false);
        }
      }
    );
  });
};

// Drop and recreate the database if overwrite flag is set
const recreateDatabase = async () => {
  console.log(`Dropping and recreating database '${dbInfo.database}'...`);

  // Connect to 'postgres' database to drop and recreate our target db
  const pgUrl = process.env.DATABASE_URL.replace(/\/[^/]+$/, '/postgres');
  
  // Drop database if it exists
  const dropCommand = `DROP DATABASE IF EXISTS ${dbInfo.database};`;
  
  // Create database
  const createCommand = `CREATE DATABASE ${dbInfo.database} WITH OWNER = ${dbInfo.user};`;
  
  try {
    // Use psql to execute the commands
    const psql = spawn('psql', [
      '-h', dbInfo.host,
      '-p', dbInfo.port,
      '-U', dbInfo.user,
      '-d', 'postgres',
      '-c', dropCommand,
      '-c', createCommand
    ], {
      env: {
        ...process.env,
        PGPASSWORD: dbInfo.password
      }
    });

    return new Promise((resolve, reject) => {
      let errorOutput = '';
      
      psql.stdout.on('data', (data) => {
        console.log(data.toString().trim());
      });
      
      psql.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.error(data.toString().trim());
      });
      
      psql.on('close', (code) => {
        if (code === 0) {
          console.log(`Successfully recreated database '${dbInfo.database}'`);
          resolve();
        } else {
          reject(new Error(`Failed to recreate database. Exit code: ${code}. ${errorOutput}`));
        }
      });
    });
  } catch (error) {
    console.error('Error executing psql:', error);
    throw error;
  }
};

// Restore database from backup file
const restoreDatabase = async () => {
  console.log(`Restoring database from backup: ${backupFile}`);
  
  try {
    // Use pg_restore to restore the backup
    const pgRestore = spawn('pg_restore', [
      '-h', dbInfo.host,
      '-p', dbInfo.port,
      '-U', dbInfo.user,
      '-d', dbInfo.database,
      '-v', // Verbose
      '--no-owner', // Don't include ownership commands
      '--no-privileges', // Don't include privilege commands
      backupFile
    ], {
      env: {
        ...process.env,
        PGPASSWORD: dbInfo.password
      }
    });

    return new Promise((resolve, reject) => {
      pgRestore.stdout.on('data', (data) => {
        console.log(data.toString().trim());
      });
      
      pgRestore.stderr.on('data', (data) => {
        // pg_restore sends progress info to stderr
        const msg = data.toString().trim();
        console.log(msg);
      });
      
      pgRestore.on('close', (code) => {
        // pg_restore returns non-zero if there are warnings, not just errors
        if (code === 0) {
          console.log('Restore completed successfully with no warnings');
          resolve();
        } else if (code === 1) {
          console.log('Restore completed with warnings (this is often normal)');
          resolve();
        } else {
          console.error(`pg_restore process exited with code ${code}`);
          reject(new Error(`Restore failed with exit code ${code}`));
        }
      });
    });
  } catch (error) {
    console.error('Error executing pg_restore:', error);
    throw error;
  }
};

// Main function
const main = async () => {
  try {
    const confirmed = await confirmRestore();
    if (!confirmed) {
      rl.close();
      process.exit(0);
    }
    
    // If overwrite flag is set, drop and recreate the database
    if (overwrite) {
      await recreateDatabase();
    }
    
    // Restore the database
    await restoreDatabase();
    
    console.log(`Database '${dbInfo.database}' has been successfully restored from ${backupFile}`);
    rl.close();
  } catch (error) {
    console.error('Error during database restore:', error);
    rl.close();
    process.exit(1);
  }
};

// Run the main function
main();
