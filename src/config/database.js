const { Pool } = require('pg');
const { getSequelize } = require('../database/connection');

// PostgreSQL connection pool for raw queries (used by new Owner Dashboard features)
let pool;

const createPool = () => {
  if (pool) {
    return pool;
  }

  try {
    if (process.env.DATABASE_URL) {
      // Use DATABASE_URL if provided (for production)
      console.log('Creating PostgreSQL pool with DATABASE_URL');
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? {
          require: true,
          rejectUnauthorized: false
        } : false,
        // OPTIMIZED: Increased pool size and timeouts for better performance
        max: 20,                      // Increased from 10 to 20
        min: 2,                       // Keep minimum connections alive
        idleTimeoutMillis: 60000,     // Increased from 30s to 60s
        connectionTimeoutMillis: 10000, // Increased from 2s to 10s
        acquireTimeoutMillis: 15000,  // Added: Time to wait for connection from pool
        createTimeoutMillis: 10000,   // Added: Time to wait for new connection creation
        reapIntervalMillis: 1000,     // Added: How often to check for idle connections
        createRetryIntervalMillis: 200, // Added: Retry interval for failed connections
      });
    } else {
      // Use individual environment variables
      console.log('Creating PostgreSQL pool with individual variables');
      pool = new Pool({
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'leadEstate_agency',
        password: process.env.DB_PASSWORD || 'password',
        port: process.env.DB_PORT || 5432,
        ssl: process.env.NODE_ENV === 'production' ? {
          require: true,
          rejectUnauthorized: false
        } : false,
        // OPTIMIZED: Same performance settings for individual variables
        max: 20,                      // Increased from 10 to 20
        min: 2,                       // Keep minimum connections alive
        idleTimeoutMillis: 60000,     // Increased from 30s to 60s
        connectionTimeoutMillis: 10000, // Increased from 2s to 10s
        acquireTimeoutMillis: 15000,  // Added: Time to wait for connection from pool
        createTimeoutMillis: 10000,   // Added: Time to wait for new connection creation
        reapIntervalMillis: 1000,     // Added: How often to check for idle connections
        createRetryIntervalMillis: 200, // Added: Retry interval for failed connections
      });
    }

    // Handle pool errors
    pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });

    console.log('PostgreSQL pool created successfully');
    return pool;

  } catch (error) {
    console.error('Error creating PostgreSQL pool:', error);
    throw error;
  }
};

// Get the pool instance
const getPool = () => {
  if (!pool) {
    return createPool();
  }
  return pool;
};

// Test database connection
const testConnection = async () => {
  try {
    const client = await getPool().connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    console.log('Database connection test successful:', result.rows[0]);
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
};

// Close pool
const closePool = async () => {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('PostgreSQL pool closed');
  }
};

// Export both Sequelize (for existing code) and Pool (for new code)
module.exports = {
  // New PostgreSQL pool for raw queries (Owner Dashboard features)
  pool: getPool(),
  createPool,
  getPool,
  testConnection,
  closePool,
  
  // Existing Sequelize connection (for backward compatibility)
  sequelize: getSequelize,
  getSequelize
};
