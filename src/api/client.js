import axios from 'axios';

// Configure axios defaults
const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3002';
const apiClient = axios.create({
  baseURL: apiBase,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true
});

// Add a request interceptor to log requests
apiClient.interceptors.request.use(
  (config) => {
    console.log('Request:', config.method.toUpperCase(), config.url);
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add a response interceptor to handle errors
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response) {
      // Server responded with a status code outside 2xx
      console.error('API Error:', error.response.status, error.response.data);
    } else if (error.request) {
      // Request was made but no response received
      console.error('No response received:', error.request);
    } else {
      // Something happened in setting up the request
      console.error('Request error:', error.message);
    }
    return Promise.reject(error);
  }
);

/**
 * Fetches the high score for a user and game
 * @param {number} userId - The user ID
 * @param {number} gameId - The game ID (1 for 2048)
 * @returns {Promise<number>} The high score
 */
export const fetchHighScore = async (userId, gameId) => {
  try {
    const response = await apiClient.get(`/api/usergames/highscore?userid=${userId}&gameid=${gameId}`);
    return response.data.highScore || 0;
  } catch (error) {
    console.error('Error fetching high score:', error);
    return 0;
  }
};

/**
 * Saves game data to the server
 * @param {Object} gameData - The game data to save
 * @param {number} gameData.userid - The user ID
 * @param {number} gameData.gameid - The game ID (1 for 2048)
 * @param {number} gameData.score - The final score
 * @param {number} gameData.highscore - The high score
 * @returns {Promise<Object>} The saved game data
 */
export const saveGameData = async (gameData) => {
  try {
    const response = await apiClient.post('/api/usergames', gameData);
    return response.data;
  } catch (error) {
    console.error('Error saving game data:', error);
    throw error;
  }
};

/**
 * Fetches all users from the API
 * @returns {Promise<Array>} A promise that resolves to an array of user objects
 */
export const getUsers = async () => {
  try {
    const response = await apiClient.get('/users');
    return response.data;
  } catch (error) {
    console.error('Error fetching users:', error);
    throw error;
  }
};

/**
 * Creates a new user via the API.
 * @param {object} userData - The data for the new user.
 * @returns {Promise<object>} A promise that resolves to the newly created user object.
 */
/**
 * Creates a new user
 * @param {Object} userData - The user data to create
 * @returns {Promise<Object>} The created user data
 */
export const createUser = async (userData) => {
  try {
    const response = await apiClient.post('/users', userData);
    return response.data;
  } catch (error) {
    if (error.response) {
      // Forward the server's error message if available
      throw new Error(error.response.data.error || 'Failed to create user');
    }
    throw error;
  }
};

/**
 * Handles user login via the API (UNENCRYPTED FOR DEMO).
 * @param {string} username - The user's username.
 * @param {string} password - The user's password.
 * @returns {Promise<object>} A promise that resolves with a success message and user data.
 */
/**
 * Logs in a user
 * @param {string} username - The username
 * @param {string} password - The password
 * @returns {Promise<Object>} The user data and token
 */
export const login = async (username, password) => {
  try {
    const response = await apiClient.post('/login', {
      username,
      password
    });
    console.log('Login API Response:', response.data);
    return response.data;
  } catch (error) {
    if (error.response) {
      if (error.response.status === 401) {
        throw new Error('Invalid username or password');
      }
      throw new Error(error.response.data.error || 'Login failed');
    }
    throw new Error('Network error. Please check your connection.');
  }
};

/**
 * Gets the diagnostic status for a user
 * @param {number} userId - The user's ID
 * @returns {Promise<boolean>} Whether the user has completed the diagnostic
 */
export const getDiagnosticStatus = async (userId) => {
  try {
    const response = await apiClient.get(`/api/users/${userId}/diagnostic`);
    return response.data.isdiagnostic;
  } catch (error) {
    console.error('Error fetching diagnostic status:', error);
    throw error;
  }
};

/**
 * Updates the diagnostic status for a user
 * @param {number} userId - The user's ID
 * @param {boolean} status - New diagnostic status
 * @returns {Promise<Object>} Updated user object
 */
export const updateDiagnosticStatus = async (userId, status) => {
  try {
    const response = await apiClient.post(`/api/users/${userId}/diagnostic`, { isdiagnostic: status });
    return response.data;
  } catch (error) {
    console.error('Error updating diagnostic status:', error);
    throw error;
  }
};


/**
 * Posts diagnostic results to the server
 * @param {number} userId - The user ID
 * @param {boolean[]} resultsArray - Array of booleans for each question (true if correct)
 * @returns {Promise<Object>} The server response
 */
export async function saveDiagnosticResults(userid, results) {
  console.log("Request:", `POST /api/users/${userid}/diagnostic/results`);
  console.log("Payload being sent:", { results });

  try {
    const res = await apiClient.post(`/api/users/${userid}/diagnostic/results`, {results});
    console.log("Response:", res);
    return res;
  } catch (err) {
    console.error("Error saving diagnostic results:", err.response?.data || err);
    throw err;
  }
}



/**
 * 🔹 Fetch the user's highest cumulative highscore across ALL games.
 * @param {number|string} userId - The user's ID.
 * @returns {Promise<number>} The user's highest recorded highscore (or 0 if none).
 */
export const fetchUserHighestScore = async (userId) => {
  try {
    const response = await apiClient.get(`/api/user/${userId}/highscore`);
    return response.data.highestScore || 0;
  } catch (error) {
    console.error("Error fetching user highest score:", error);
    return 0;
  }
};

/**
 * 🔹 Fetch total number of games played by a user (including repeats)
 * @param {number|string} userId - The user's ID
 * @returns {Promise<number>} - Total number of games played
 */
export const fetchUserGameCount = async (userId) => {
  try {
    const response = await apiClient.get(`/api/user/${userId}/gamecount`);
    return response.data.totalGames || 0;
  } catch (error) {
    console.error("Error fetching total games played:", error);
    return 0;
  }
};

// Fetch all user scores from usergames table
export async function fetchAllScores(userId) {
  try {
    const response = await apiClient.get(`/api/usergames/${userId}/scores`);
    const data = response.data;
    return data.scores;
  } catch (error) {
    console.error("Error fetching scores:", error);
    return [];
  }
}

export async function fetchUserGameScores(userId, gameId) {
  try {
    const response = await apiClient.get(`/api/usergames/${userId}/${gameId}/scores`);
    return response.data;
  } catch (error) {
    console.error("Error fetching user game scores:", error);
    return [];
  }
}
