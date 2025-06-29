const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// Try to load optional dependencies
let pool = null;
let brevoService = null;
let repositoryAutomationService = null;
let auditService = null;

try {
  const { pool: dbPool } = require('../config/database');
  pool = dbPool;
} catch (error) {
  console.warn('Database not available:', error.message);
}

try {
  brevoService = require('../services/brevoService');
} catch (error) {
  console.warn('Brevo service not available:', error.message);
}

try {
  repositoryAutomationService = require('../services/repositoryAutomationService');
} catch (error) {
  console.warn('Repository automation service not available:', error.message);
}

try {
  auditService = require('../services/auditService');
} catch (error) {
  console.warn('Audit service not available:', error.message);
}

// Add CORS headers to all routes in this router
router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-owner-api-key');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
});

// Simple test route (no authentication required)
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Owner Integration API is working!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Simple dashboard stats (no authentication required for testing)
router.get('/dashboard/stats', (req, res) => {
  res.json({
    success: true,
    data: {
      totalAgencies: 3,
      newAgenciesThisMonth: 1,
      totalUsers: 45,
      userGrowthPercent: 12,
      monthlyRevenue: 2250,
      revenueGrowthPercent: 8,
      systemHealth: 99.9,
      lastUpdated: new Date().toISOString()
    }
  });
});

// Simple agencies list (no authentication required for testing)
router.get('/agencies', (req, res) => {
  res.json({
    success: true,
    data: [
      {
        id: '1',
        name: 'Elite Properties',
        managerName: 'John Smith',
        email: 'john@eliteproperties.com',
        status: 'active',
        userCount: 25,
        city: 'New York',
        createdAt: '2024-01-15T10:00:00Z',
        settings: { plan: 'premium' }
      },
      {
        id: '2',
        name: 'Prime Real Estate',
        managerName: 'Sarah Johnson',
        email: 'sarah@primerealestate.com',
        status: 'active',
        userCount: 18,
        city: 'Los Angeles',
        createdAt: '2024-01-10T10:00:00Z',
        settings: { plan: 'standard' }
      },
      {
        id: '3',
        name: 'Metro Homes',
        managerName: 'Mike Wilson',
        email: 'mike@metrohomes.com',
        status: 'pending',
        userCount: 0,
        city: 'Chicago',
        createdAt: '2024-01-08T10:00:00Z',
        settings: { plan: 'basic' }
      }
    ],
    count: 3
  });
});

// Simple agency creation (no authentication required for testing)
router.post('/create-agency', (req, res) => {
  const { agencyName, managerName, managerEmail } = req.body;

  if (!agencyName || !managerName || !managerEmail) {
    return res.status(400).json({
      success: false,
      message: 'Agency name, manager name, and manager email are required'
    });
  }

  // Return demo success response
  res.status(201).json({
    success: true,
    message: 'Agency created successfully (Demo Mode)',
    data: {
      agency: {
        id: Date.now().toString(),
        name: agencyName,
        managerName: managerName,
        email: managerEmail,
        status: 'active',
        userCount: 0,
        city: 'Unknown',
        createdAt: new Date().toISOString(),
        settings: { plan: 'standard' }
      },
      manager: {
        email: managerEmail,
        name: managerName
      },
      demoMode: true,
      createdAt: new Date().toISOString()
    }
  });
});

// Debug route to check GitHub configuration
router.get('/debug-github', (req, res) => {
  res.json({
    success: true,
    github: {
      hasToken: !!process.env.GITHUB_TOKEN,
      tokenLength: process.env.GITHUB_TOKEN ? process.env.GITHUB_TOKEN.length : 0,
      owner: process.env.GITHUB_OWNER,
      ownerApiKey: !!process.env.OWNER_API_KEY
    },
    timestamp: new Date().toISOString()
  });
});

// Database setup route (no authentication required for initial setup)
router.post('/setup-database', async (req, res) => {
  try {
    console.log('🗄️ Setting up database tables for Owner Dashboard...');

    // Create agencies table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agencies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        address TEXT,
        city VARCHAR(100),
        country VARCHAR(100),
        license_number VARCHAR(100),
        specialization TEXT[],
        description TEXT,
        settings JSONB DEFAULT '{}',
        owner_id UUID,
        manager_id UUID,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add missing columns to existing users table (if they don't exist)
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS agency_id UUID,
      ADD COLUMN IF NOT EXISTS invitation_token VARCHAR(255),
      ADD COLUMN IF NOT EXISTS invitation_sent_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS invitation_expires_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS account_activated_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS agency_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS invited_by VARCHAR(255),
      ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active'
    `).catch((error) => {
      console.log('Note: Some columns may already exist:', error.message);
    });

    // Add foreign key constraint
    await pool.query(`
      ALTER TABLE agencies
      ADD CONSTRAINT IF NOT EXISTS fk_agencies_manager
      FOREIGN KEY (manager_id) REFERENCES users(id)
    `).catch(() => {
      // Ignore if constraint already exists
    });

    console.log('✅ Database tables created successfully');

    res.json({
      success: true,
      message: 'Database tables created successfully',
      tables: ['agencies', 'users'],
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error setting up database:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to setup database',
      error: error.message
    });
  }
});

// Middleware to verify owner dashboard requests
const verifyOwnerRequest = (req, res, next) => {
  const ownerApiKey = req.headers['x-owner-api-key'];

  if (!ownerApiKey || ownerApiKey !== process.env.OWNER_API_KEY) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Invalid owner API key'
    });
  }

  next();
};



// GET /api/owner-integration/agencies-simple - Get agencies without joins (for testing)
router.get('/agencies-simple', verifyOwnerRequest, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM agencies ORDER BY created_at DESC');

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
      message: 'Simple agencies query (no joins)'
    });

  } catch (error) {
    console.error('Error fetching agencies (simple):', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agencies (simple)',
      error: error.message
    });
  }
});





module.exports = router;
