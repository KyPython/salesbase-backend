const fs = require('fs');
const path = require('path');
// fileURLToPath is only available in ES modules; for CommonJS, use __filename and __dirname
const pg = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createDatabaseIfNotExists() {
  const adminPool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    port: process.env.DB_PORT || 5432,
  });

  try {
    const result = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [process.env.DB_NAME || 'salesbase_crm']
    );

    if (result.rows.length === 0) {
      console.log('Creating database...');
      await adminPool.query(`CREATE DATABASE ${process.env.DB_NAME || 'salesbase_crm'}`);
      console.log('✅ Database created successfully');
    } else {
      console.log('✅ Database already exists');
    }
  } catch (error) {
    console.error('❌ Database creation failed:', error.message);
    throw error;
  } finally {
    await adminPool.end();
  }
}

async function runMigrations() {
  const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'salesbase_crm',
    password: process.env.DB_PASSWORD || 'password',
    port: process.env.DB_PORT || 5432,
  });

  try {
    // Check if tables exist before creating
    const tablesExist = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'companies', 'contacts', 'deals')
    `);

    if (tablesExist.rows.length === 0) {
      console.log('Creating tables...');
      
      // Read and execute schema
      const schemaPath = path.join(__dirname, 'schema.sql');
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      await pool.query(schemaSql);
      
      console.log('✅ Database schema created successfully');
    } else {
      console.log('✅ Tables already exist');
    }

    // Insert default pipeline stages if they don't exist
    const stagesExist = await pool.query('SELECT COUNT(*) FROM pipeline_stages');
    if (parseInt(stagesExist.rows[0].count) === 0) {
      console.log('Creating default pipeline stages...');
      
      const stages = [
        ['Lead', 1, 0.1],
        ['Qualified', 2, 0.25],
        ['Proposal', 3, 0.5],
        ['Negotiation', 4, 0.75],
        ['Closed Won', 5, 1.0],
        ['Closed Lost', 6, 0.0]
      ];

      for (const [name, order, probability] of stages) {
        await pool.query(
          'INSERT INTO pipeline_stages (name, stage_order, win_probability) VALUES ($1, $2, $3)',
          [name, order, probability]
        );
      }
      
      console.log('✅ Default pipeline stages created');
    } else {
      console.log('✅ Pipeline stages already exist');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

async function main() {
  try {
    console.log('Running safe database migrations...');
    await createDatabaseIfNotExists();
    await runMigrations();
    console.log('🎉 All migrations completed successfully!');
  } catch (error) {
    console.error('💥 Migration process failed:', error);
    process.exit(1);
  }
}

main();