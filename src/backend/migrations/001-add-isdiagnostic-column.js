require('dotenv').config();
const { Pool } = require('pg');

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Check if the column already exists
    const checkQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='users' AND column_name='isdiagnostic';
    `;
    
    const { rows } = await client.query(checkQuery);
    
    if (rows.length === 0) {
      console.log('Adding isdiagnostic column to users table...');
      await client.query(`
        ALTER TABLE public.users 
        ADD COLUMN isdiagnostic BOOLEAN DEFAULT false;
      `);
      console.log('Successfully added isdiagnostic column.');
    } else {
      console.log('isdiagnostic column already exists.');
    }
    
    await client.query('COMMIT');
    console.log('Migration completed successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(console.error);
