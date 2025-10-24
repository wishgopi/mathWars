try {
  // Load env from .env in local/dev; in production (Render) env vars are provided by the platform
  require('dotenv').config();
} catch (e) {
  // dotenv may not be installed in production; ignore if missing
}

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(express.json()); // For parsing application/json
const port = process.env.PORT || 3002;

// CORS configuration
// Allow local defaults plus any comma-separated ALLOWED_ORIGINS from env (e.g., https://your-frontend.netlify.app)
const defaultAllowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000', 'http://localhost:5174', 'http://localhost:5175'];
const envAllowed = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);
const allowedOrigins = [...new Set([...defaultAllowedOrigins, ...envAllowed])];

// Enable CORS for all routes
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Set Content Security Policy headers
app.use((req, res, next) => {
  // Allow overriding connect-src via env (comma-separated). Otherwise allow self, https, and wss.
  const envConnect = (process.env.CSP_CONNECT_SRC || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const connectSrc = envConnect.length > 0
    ? envConnect.join(' ')
    : "'self' https: wss:";
  const csp =
    "default-src 'self'; " +
    `connect-src ${connectSrc}; ` +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline';";
  res.setHeader('Content-Security-Policy', csp);
  next();
});

// Create a PostgreSQL connection pool using the environment variable.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// GET: Get a user's diagnostic status
app.get('/api/users/:id/diagnostic', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'SELECT isdiagnostic FROM users WHERE userid = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ isdiagnostic: result.rows[0].isdiagnostic });
  } catch (error) {
    console.error('Error fetching diagnostic status:', error);
    res.status(500).json({ error: 'Failed to fetch diagnostic status' });
  }
});


/**
 * POST /api/users/:userId/diagnostic/results
 * Body: { results: [true, false, true, ...] }
 */

app.post("/api/users/:userid/diagnostic/results", async (req, res) => {
  const { userid } = req.params;
  const { results : results } = req.body;

  console.log("Received userID:", userid);
  console.log("Received request::", req );
  console.log("Received Results:", results);


  // ✅ Validate payload
  if (!Array.isArray(results) || results.length === 0) {
    return res.status(400).json({ error: "Results must be a non-empty array." });
  }

  // ✅ Limit to 20 columns to match DB schema
  const safeResults = results.slice(0, 20);

  const columns = safeResults.map((_, i) => `q${i + 1}`).join(", ");
  const values = safeResults.map((r) => !!r); // force boolean true/false
  const placeholders = values.map((_, i) => `$${i + 2}`).join(", ");

  // ✅ Build UPDATE SET safely
  const updateSet =
    safeResults.length > 0
      ? safeResults.map((_, i) => `q${i + 1} = EXCLUDED.q${i + 1}`).join(", ")
      : "";

  // ✅ Final query
  const query = `
    INSERT INTO diagnosticscores (userid, ${columns}, dateAttempted)
    VALUES ($1, ${placeholders}, CURRENT_DATE)
    ON CONFLICT (userID)
    DO UPDATE SET
      ${updateSet ? updateSet + "," : ""} dateAttempted = CURRENT_DATE
    RETURNING *;
  `;

  console.log("SQL Query:\n", query);
  console.log("Values array:", [userid, ...values]);

  try {
    const result = await pool.query(query, [userid, ...values]);
    res.json({
      message: "Diagnostic results saved successfully.",
      data: result.rows[0],
    });
  } catch (err) {
    console.error("Error saving diagnostic results:", err);
    res.status(500).json({ error: "Failed to save diagnostic results." });
  }
});

// GET: Get a user's overall highest highscore across all games
app.get('/api/user/:userid/highscore', async (req, res) => {
  const { userid } = req.params;

  if (!userid) {
    return res.status(400).json({ error: 'Missing userid' });
  }

  try {
    // Find the single highest highscore across ALL games for this user
    const result = await pool.query(
      `SELECT MAX(highscore) AS highest_overall
       FROM usergames
       WHERE userid = $1`,
      [userid]
    );

    // Extract the highest score or default to 0
    const highestScore = result.rows[0]?.highest_overall || 0;

    console.log(`Highest overall highscore for user ${userid}:`, highestScore);

    // Return it as a JSON object
    res.json({ highestScore });
  } catch (err) {
    console.error('Error fetching user highscore:', err);
    res.status(500).json({ error: 'Failed to fetch user highscore' });
  }
});

// ✅ GET: Get total number of games a user has played (all sessions)
app.get('/api/user/:userid/gamecount', async (req, res) => {
  const { userid } = req.params;

  if (!userid) {
    return res.status(400).json({ error: 'Missing userid' });
  }

  try {
    // Count *all* rows in usergames for that user (not distinct)
    const result = await pool.query(
      `SELECT COUNT(*) AS total_games
       FROM usergames
       WHERE userid = $1`,
      [userid]
    );

    const totalGames = parseInt(result.rows[0]?.total_games || 0, 10);

    console.log(`Total games played by user ${userid}:`, totalGames);
    res.json({ totalGames });
  } catch (err) {
    console.error('Error fetching game count:', err);
    res.status(500).json({ error: 'Failed to fetch total games played' });
  }
});


// --- API Endpoints for the 'usergames' table ---

// Get high score for a user and game
app.get('/api/usergames/highscore', async (req, res) => {
  const { userid, gameid } = req.query;
  
  if (!userid || !gameid) {
    return res.status(400).json({ error: 'Missing userid or gameid' });
  }

  try {
    // Get the highest score ever achieved
    const result = await pool.query(
      `SELECT MAX(highscore) as highscore 
       FROM usergames 
       WHERE userid = $1 AND gameid = $2`,
      [userid, gameid]
    );
    
    const highScore = result.rows[0]?.highscore ? parseInt(result.rows[0].highscore) : 0;
    console.log(`Fetched high score for user ${userid}, game ${gameid}:`, highScore);
    res.json({ highScore });
  } catch (error) {
    console.error('Error fetching high score:', error);
    res.status(500).json({ 
      error: 'Failed to fetch high score',
      details: error.message 
    });
  }
});


// Get all scores for a specific user
app.get("/api/usergames/:userid/scores", async (req, res) => {
  const { userid } = req.params;

  try {
    const result = await pool.query(
      "SELECT score FROM usergames WHERE userid = $1 ORDER BY usergameid ASC",
      [userid]
    );
    const scores = result.rows.map(row => row.score);
    res.json({ scores });
  } catch (error) {
    console.error("Error fetching user game scores:", error);
    res.status(500).json({ error: "Failed to fetch user scores" });
  }
});

// GET all scores for a specific user and specific game
app.get("/api/usergames/:userid/:gameid/scores", async (req, res) => {
  const { userid, gameid } = req.params;

  try {
    const result = await pool.query(
      "SELECT score FROM usergames WHERE userid = $1 AND gameid = $2 ORDER BY usergameid ASC",
      [userid, gameid]
    );

    res.json(result.rows.map(row => row.score)); // return as array of scores
  } catch (error) {
    console.error("Error fetching user game scores:", error);
    res.status(500).json({ error: "Failed to fetch user game scores" });
  }
});


// Save game data
app.post('/api/usergames', async (req, res) => {
  console.log('Received game data:', req.body);
  const { userid, gameid, score, dateplayed } = req.body;
  
  // Validate required fields
  if (!userid || gameid === undefined || score === undefined || !dateplayed) {
    console.error('Missing required fields:', { userid, gameid, score, dateplayed });
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  try {
    // First, check if the user exists
    const userCheck = await pool.query('SELECT userid FROM users WHERE userid = $1', [userid]);
    if (userCheck.rows.length === 0) {
      console.error('User not found:', userid);
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get the highest score ever achieved
    const highScoreResult = await pool.query(
      `SELECT MAX(score) as highest_score 
       FROM usergames 
       WHERE userid = $1 AND gameid = $2`,
      [userid, gameid]
    );
    
    // Calculate the new high score
    const currentHighestScore = highScoreResult.rows[0]?.highest_score || 0;
    const newHighScore = Math.max(currentHighestScore, score);
    
    console.log('Saving game data:', { userid, gameid, score, newHighScore, dateplayed });
    
    // Format date to match the database column type (date only)
    const formattedDate = new Date(dateplayed).toISOString().split('T')[0];
    
    // Save the game with the updated high score
    const result = await pool.query(
      'INSERT INTO usergames (userid, gameid, score, highscore, dateplayed) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [userid, gameid, score, newHighScore, formattedDate]
    );
    
    console.log('Game data saved successfully:', result.rows[0]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error saving game data:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      table: error.table,
      constraint: error.constraint,
      stack: error.stack
    });
    res.status(500).json({ 
      error: 'Failed to save game data',
      details: error.message,
      code: error.code,
      constraint: error.constraint
    });
  }
});

// --- API Endpoints for the 'users' table ---

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Test database connection and table structure
app.get('/api/test-db', async (req, res) => {
  try {
    // Test connection
    await pool.query('SELECT NOW()');
    
    // Check if usergames table exists
    const tableCheck = await pool.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'usergames'
      )`
    );
    
    if (!tableCheck.rows[0].exists) {
      return res.status(404).json({ error: 'usergames table does not exist' });
    }
    
    // Get table structure
    const tableInfo = await pool.query(
      `SELECT column_name, data_type, is_nullable 
       FROM information_schema.columns 
       WHERE table_name = 'usergames'
       ORDER BY ordinal_position`
    );
    
    // Get recent entries
    const recentEntries = await pool.query(
      'SELECT * FROM usergames ORDER BY dateplayed DESC LIMIT 5'
    );
    
    res.json({
      connection: 'OK',
      tableExists: true,
      tableStructure: tableInfo.rows,
      recentEntries: recentEntries.rows
    });
    
  } catch (error) {
    console.error('Database test error:', error);
    res.status(500).json({
      error: 'Database test failed',
      details: error.message
    });
  }
});


// POST: Add a new user
app.post('/users', async (req, res) => {
  console.log('Received signup request:', req.body);
  
  try {
    const { username, fname, lname, email, password, isdiagnostic } = req.body;
    
    // Validate request body
    if (!username || !email || !password) {
      console.log('Validation failed - missing required fields');
      return res.status(400).json({ 
        error: 'Validation failed',
        details: 'Username, email, and password are required.',
        received: { username: !!username, email: !!email, password: !!password }
      });
    }

    // Set default values for optional fields
    const userData = {
      username: username.trim(),
      fname: (fname || '').trim(),
      lname: (lname || '').trim(),
      email: email.trim().toLowerCase(),
      password: password, // In production, this should be hashed
      isdiagnostic: Boolean(isdiagnostic),
      dateCreated: new Date()
    };

    console.log('Attempting to create user with data:', userData);

    const result = await pool.query(
      `INSERT INTO public.users(
        username, fname, lname, email, password, isdiagnostic, dateCreated
      ) VALUES($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        userData.username,
        userData.fname,
        userData.lname,
        userData.email,
        userData.password,
        userData.isdiagnostic,
        userData.dateCreated
      ]
    );

    console.log('User created successfully:', result.rows[0]);
    res.status(201).json(result.rows[0]);
    
  } catch (err) {
    console.error('Error creating user:', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      constraint: err.constraint,
      stack: err.stack
    });
    
    // Handle specific PostgreSQL errors
    if (err.code === '23505') { // Unique violation
      const detail = err.detail || 'A user with this username or email already exists';
      return res.status(409).json({
        error: 'User already exists',
        details: detail
      });
    }
    
    res.status(500).json({
      error: 'Failed to create user',
      details: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Find the user by username and password (unsecured)
    const userQuery = await pool.query(
      'SELECT * FROM public.users WHERE username = $1 AND password = $2',
      [username, password]
    );

    if (userQuery.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Successful login
    const user = userQuery.rows[0];
    console.log('Complete user object from DB:', user);
    
    // Explicitly map the fields we want to send
    const userResponse = {
      id: user.userid,  // Make sure this matches your database column name
      username: user.username,
      email: user.email
    };
    
    console.log('Sending user data:', userResponse);
    
    res.status(200).json({
      message: 'Login successful',
      user: userResponse
    });

  } catch (err) {
    console.error('Error during login:', err.message);
    res.status(500).send('Server Error');
  }
});

// GET: Get a user's diagnostic status
// app.get('/api/users/:id/diagnostic', async (req, res) => {
//   const { id } = req.params;

//   try {
//     const result = await pool.query(
//       'SELECT isdiagnostic FROM users WHERE userid = $1',
//       [id]
//     );

//     if (result.rows.length === 0) {
//       return res.status(404).json({ error: 'User not found' });
//     }

//     res.json({ isdiagnostic: result.rows[0].isdiagnostic });
//   } catch (error) {
//     console.error('Error fetching diagnostic status:', error);
//     res.status(500).json({ error: 'Failed to fetch diagnostic status' });
//   }
// });

// POST: Update a user's diagnostic status
app.post('/api/users/:id/diagnostic', async (req, res) => {
  const { id } = req.params;
  const { isdiagnostic } = req.body;

  if (typeof isdiagnostic !== 'boolean') {
    return res.status(400).json({ error: 'Invalid isdiagnostic value' });
  }

  try {
    const result = await pool.query(
      'UPDATE users SET isdiagnostic = $1 WHERE userid = $2 RETURNING userid, username, isdiagnostic',
      [isdiagnostic, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`Updated diagnostic status for user ${id} → ${isdiagnostic}`);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating diagnostic status:', error);
    res.status(500).json({ error: 'Failed to update diagnostic status' });
  }
});

app.get('/', (req, res) => {
  res.send('Welcome to the User API!');
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});


