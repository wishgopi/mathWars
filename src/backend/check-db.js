require('dotenv').config();
const { Pool } = require('pg');

async function checkDatabase() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    // Check if users table exists
    const usersTableQuery = `
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users';
    `;

    const usersResult = await pool.query(usersTableQuery);
    
    if (usersResult.rows.length === 0) {
      console.log('The users table does not exist. Creating it now...');
      await createUsersTable(pool);
      console.log('Users table created successfully.');
    } else {
      console.log('Users table structure:');
      console.table(usersResult.rows);
    }

    // Check if usergames table exists
    const usergamesTableQuery = `
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'usergames';
    `;

    const usergamesResult = await pool.query(usergamesTableQuery);
    
    if (usergamesResult.rows.length === 0) {
      console.log('The usergames table does not exist. Creating it now...');
      await createUsergamesTable(pool);
      console.log('Usergames table created successfully.');
    } else {
      console.log('Usergames table structure:');
      console.table(usergamesResult.rows);
    }

    // Test inserting a sample user and game data
    try {
      // First create a test user
      const testUser = {
        username: 'testuser_' + Date.now(),
        email: `test${Date.now()}@example.com`,
        password: 'testpassword',
        fname: 'Test',
        lname: 'User',
        isdiagnostic: false
      };

      const insertUserResult = await pool.query(
        `INSERT INTO public.users(
          username, fname, lname, email, password, isdiagnostic, dateCreated
        ) VALUES($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          testUser.username,
          testUser.fname,
          testUser.lname,
          testUser.email,
          testUser.password,
          testUser.isdiagnostic,
          new Date()
        ]
      );
      
      const userId = insertUserResult.rows[0].userid;
      console.log('Successfully inserted test user:', insertUserResult.rows[0]);

      // Now test inserting game data
      const gameData = {
        userid: userId,
        gameid: 1,
        score: 1000,
        highscore: 1000,
        dateplayed: new Date().toISOString()
      };

      const insertGameResult = await pool.query(
        `INSERT INTO usergames (userid, gameid, score, highscore, dateplayed)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [
          gameData.userid,
          gameData.gameid,
          gameData.score,
          gameData.highscore,
          gameData.dateplayed
        ]
      );
      console.log('Successfully inserted test game data:', insertGameResult.rows[0]);
    } catch (error) {
      console.error('Error during test data insertion:', error);
    }

  } catch (error) {
    console.error('Database error:', error);
  } finally {
    await pool.end();
  }
}

async function createUsersTable(pool) {
  await pool.query(`
    CREATE TABLE public.users (
      userid SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      fname VARCHAR(50) NOT NULL,
      lname VARCHAR(50) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      isdiagnostic BOOLEAN DEFAULT false,
      dateCreated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function createUsergamesTable(pool) {
  await pool.query(`
    CREATE TABLE public.usergames (
      usergameid SERIAL PRIMARY KEY,
      userid INTEGER NOT NULL REFERENCES users(userid) ON DELETE CASCADE,
      gameid INTEGER NOT NULL,
      score INTEGER NOT NULL,
      highscore INTEGER NOT NULL,
      dateplayed TIMESTAMP WITH TIME ZONE NOT NULL,
      UNIQUE(userid, gameid, dateplayed)
    );
    
    CREATE INDEX IF NOT EXISTS idx_usergames_userid ON usergames(userid);
    CREATE INDEX IF NOT EXISTS idx_usergames_gameid ON usergames(gameid);
  `);
}

checkDatabase();
