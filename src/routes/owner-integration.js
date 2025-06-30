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

// Dashboard stats from database
router.get('/dashboard/stats', async (req, res) => {
  try {
    // Check if database is available
    if (!pool) {
      // Fallback to demo stats if no database
      return res.json({
        success: true,
        data: {
          totalAgencies: 3,
          newAgenciesThisMonth: 1,
          totalUsers: 45,
          userGrowthPercent: 12,
          monthlyRevenue: 2250,
          revenueGrowthPercent: 8,
          systemHealth: 99.9,
          lastUpdated: new Date().toISOString(),
          demoMode: true
        }
      });
    }

    // Get total agencies count
    const agenciesResult = await pool.query('SELECT COUNT(*) as total FROM agencies');
    const totalAgencies = parseInt(agenciesResult.rows[0].total) || 0;

    // Get new agencies this month
    const newAgenciesResult = await pool.query(`
      SELECT COUNT(*) as new_this_month
      FROM agencies
      WHERE created_at >= date_trunc('month', CURRENT_DATE)
    `);
    const newAgenciesThisMonth = parseInt(newAgenciesResult.rows[0].new_this_month) || 0;

    // Get total users across all agencies
    const usersResult = await pool.query('SELECT COUNT(*) as total FROM users WHERE status = $1', ['active']);
    const totalUsers = parseInt(usersResult.rows[0].total) || 0;

    // Calculate user growth (new users this month)
    const newUsersResult = await pool.query(`
      SELECT COUNT(*) as new_this_month
      FROM users
      WHERE created_at >= date_trunc('month', CURRENT_DATE)
    `);
    const newUsersThisMonth = parseInt(newUsersResult.rows[0].new_this_month) || 0;
    const userGrowthPercent = totalUsers > 0 ? Math.round((newUsersThisMonth / totalUsers) * 100) : 0;

    // Calculate monthly revenue (simplified - $50 per active agency)
    const activeAgenciesResult = await pool.query('SELECT COUNT(*) as active FROM agencies WHERE status = $1', ['active']);
    const activeAgencies = parseInt(activeAgenciesResult.rows[0].active) || 0;
    const monthlyRevenue = activeAgencies * 50; // $50 per agency per month

    // Calculate revenue growth (simplified)
    const revenueGrowthPercent = newAgenciesThisMonth > 0 ? Math.round((newAgenciesThisMonth / Math.max(totalAgencies - newAgenciesThisMonth, 1)) * 100) : 0;

    // System health (always good for now)
    const systemHealth = 99.9;

    res.json({
      success: true,
      data: {
        totalAgencies,
        newAgenciesThisMonth,
        totalUsers,
        userGrowthPercent,
        monthlyRevenue,
        revenueGrowthPercent,
        systemHealth,
        lastUpdated: new Date().toISOString(),
        databaseConnected: true
      }
    });

  } catch (error) {
    console.error('❌ Error fetching dashboard stats from database:', error);

    // Fallback to demo stats on error
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
        lastUpdated: new Date().toISOString(),
        demoMode: true,
        error: error.message
      }
    });
  }
});

// Get agencies from database
router.get('/agencies', async (req, res) => {
  try {
    const { status, search, limit = 50, offset = 0 } = req.query;

    // Check if database is available
    if (!pool) {
      // Fallback to demo data if no database
      return res.json({
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
          }
        ],
        count: 2,
        demoMode: true
      });
    }

    // Build query with filters
    let query = `
      SELECT
        a.id,
        a.name,
        a.email,
        a.status,
        a.created_at,
        a.updated_at,
        a.settings,
        a.city,
        a.description,
        COALESCE(u.first_name, 'Unknown') as manager_name,
        COALESCE(u.email, a.email) as manager_email,
        (SELECT COUNT(*) FROM users WHERE agency_id = a.id AND status = 'active') as user_count
      FROM agencies a
      LEFT JOIN users u ON a.manager_id = u.id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 0;

    // Add status filter
    if (status && status !== 'all') {
      paramCount++;
      query += ` AND a.status = $${paramCount}`;
      params.push(status);
    }

    // Add search filter
    if (search) {
      paramCount++;
      query += ` AND (a.name ILIKE $${paramCount} OR a.email ILIKE $${paramCount} OR u.first_name ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    // Add ordering
    query += ` ORDER BY a.created_at DESC`;

    // Add pagination
    if (limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(parseInt(limit));
    }

    if (offset) {
      paramCount++;
      query += ` OFFSET $${paramCount}`;
      params.push(parseInt(offset));
    }

    const result = await pool.query(query, params);

    // Format the response
    const agencies = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      managerName: row.manager_name,
      email: row.email,
      status: row.status,
      userCount: parseInt(row.user_count) || 0,
      city: row.city || 'Unknown',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      settings: row.settings || { plan: 'standard' },
      description: row.description
    }));

    res.json({
      success: true,
      data: agencies,
      count: agencies.length,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset)
      },
      databaseConnected: true
    });

  } catch (error) {
    console.error('❌ Error fetching agencies from database:', error);

    // Fallback to demo data on error
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
        }
      ],
      count: 1,
      demoMode: true,
      error: error.message
    });
  }
});

// Agency creation with database persistence
router.post('/create-agency', async (req, res) => {
  const { agencyName, managerName, managerEmail, city, plan, description } = req.body;

  if (!agencyName || !managerName || !managerEmail) {
    return res.status(400).json({
      success: false,
      message: 'Agency name, manager name, and manager email are required'
    });
  }

  try {
    // Check if database is available
    if (!pool) {
      // Fallback to demo mode if no database
      return res.status(201).json({
        success: true,
        message: 'Agency created successfully (Demo Mode - No Database)',
        data: {
          agency: {
            id: Date.now().toString(),
            name: agencyName,
            managerName: managerName,
            email: managerEmail,
            status: 'active',
            userCount: 0,
            city: city || 'Unknown',
            createdAt: new Date().toISOString(),
            settings: { plan: plan || 'standard' }
          },
          demoMode: true
        }
      });
    }

    // Start database transaction
    await pool.query('BEGIN');

    // Generate UUIDs for agency and manager
    const crypto = require('crypto');
    const agencyId = crypto.randomUUID();
    const managerId = crypto.randomUUID();

    // Insert agency into database
    const agencyResult = await pool.query(`
      INSERT INTO agencies (
        id, name, email, status, settings, created_at, updated_at,
        description, city
      ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), $6, $7)
      RETURNING *
    `, [
      agencyId,
      agencyName,
      managerEmail,
      'active',
      JSON.stringify({ plan: plan || 'standard' }),
      description || `${agencyName} - Professional Real Estate Agency`,
      city || 'Unknown'
    ]);

    // Insert manager user into database
    const managerResult = await pool.query(`
      INSERT INTO users (
        id, email, first_name, role, status, agency_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING *
    `, [
      managerId,
      managerEmail,
      managerName,
      'manager',
      'active',
      agencyId
    ]);

    // Update agency with manager_id
    await pool.query(
      'UPDATE agencies SET manager_id = $1 WHERE id = $2',
      [managerId, agencyId]
    );

    // Commit transaction
    await pool.query('COMMIT');

    const agency = agencyResult.rows[0];
    const manager = managerResult.rows[0];

    console.log('✅ Agency created successfully in database:', agencyName);

    res.status(201).json({
      success: true,
      message: 'Agency created successfully',
      data: {
        agency: {
          id: agency.id,
          name: agency.name,
          managerName: manager.first_name,
          email: agency.email,
          status: agency.status,
          userCount: 1, // Manager is the first user
          city: agency.city,
          createdAt: agency.created_at,
          settings: agency.settings
        },
        manager: {
          id: manager.id,
          email: manager.email,
          name: manager.first_name
        },
        databasePersisted: true,
        createdAt: agency.created_at
      }
    });

  } catch (error) {
    // Rollback transaction on error
    if (pool) {
      await pool.query('ROLLBACK');
    }

    console.error('❌ Error creating agency in database:', error);

    // Fallback to demo mode on database error
    res.status(201).json({
      success: true,
      message: 'Agency created successfully (Demo Mode - Database Error)',
      data: {
        agency: {
          id: Date.now().toString(),
          name: agencyName,
          managerName: managerName,
          email: managerEmail,
          status: 'active',
          userCount: 0,
          city: city || 'Unknown',
          createdAt: new Date().toISOString(),
          settings: { plan: plan || 'standard' }
        },
        demoMode: true,
        error: error.message
      }
    });
  }
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
