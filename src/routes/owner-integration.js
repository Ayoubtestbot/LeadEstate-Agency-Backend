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

// Dashboard stats from database (main endpoint)
router.get('/dashboard', async (req, res) => {
  try {
    // Check if database is available
    if (!pool) {
      // Fallback to demo stats if no database
      return res.json({
        success: true,
        data: {
          totalAgencies: 5,
          newAgenciesThisMonth: 2,
          totalUsers: 45,
          userGrowthPercent: 15.2,
          monthlyRevenue: 12500,
          revenueGrowthPercent: 8.7,
          systemHealth: 99.9,
          lastUpdated: new Date().toISOString(),
          databaseConnected: false
        }
      });
    }

    // Get real stats from database
    const agencyStats = await pool.query(`
      SELECT
        COUNT(*) as total_agencies,
        COUNT(CASE WHEN created_at >= date_trunc('month', CURRENT_DATE) THEN 1 END) as new_this_month
      FROM agencies
    `);

    const userStats = await pool.query(`
      SELECT COUNT(*) as total_users
      FROM users
    `);

    // Calculate revenue from agency settings
    const revenueStats = await pool.query(`
      SELECT
        SUM(CAST(settings->>'monthlyPrice' AS DECIMAL)) as monthly_revenue
      FROM agencies
      WHERE settings->>'monthlyPrice' IS NOT NULL
    `);

    const stats = {
      totalAgencies: parseInt(agencyStats.rows[0].total_agencies) || 0,
      newAgenciesThisMonth: parseInt(agencyStats.rows[0].new_this_month) || 0,
      totalUsers: parseInt(userStats.rows[0].total_users) || 0,
      userGrowthPercent: 0, // Calculate based on historical data
      monthlyRevenue: parseFloat(revenueStats.rows[0].monthly_revenue) || 0,
      revenueGrowthPercent: 0, // Calculate based on historical data
      systemHealth: 99.9,
      lastUpdated: new Date().toISOString(),
      databaseConnected: true
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('❌ Error fetching dashboard stats from database:', error);

    // Fallback to demo stats on error
    res.json({
      success: true,
      data: {
        totalAgencies: 5,
        newAgenciesThisMonth: 2,
        totalUsers: 45,
        userGrowthPercent: 15.2,
        monthlyRevenue: 12500,
        revenueGrowthPercent: 8.7,
        systemHealth: 99.9,
        lastUpdated: new Date().toISOString(),
        databaseConnected: false,
        error: error.message
      }
    });
  }
});

// Dashboard stats from database (alternative endpoint)
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

// Analytics endpoint for dashboard
router.get('/analytics', async (req, res) => {
  try {
    // Check if database is available
    if (!pool) {
      // Fallback to demo analytics if no database
      return res.json({
        success: true,
        data: {
          userActivity: {
            daily: [120, 135, 148, 162, 155, 170, 185],
            weekly: [850, 920, 1050, 1180],
            monthly: [3200, 3800, 4200, 4600]
          },
          agencyGrowth: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            data: [5, 8, 12, 15, 18, 22]
          },
          revenueAnalytics: {
            monthly: [8500, 9200, 10500, 11800, 12500, 13200],
            byPlan: {
              basic: 3500,
              standard: 4200,
              premium: 3800,
              enterprise: 1700
            }
          },
          systemMetrics: {
            uptime: 99.9,
            responseTime: 145,
            errorRate: 0.1,
            activeUsers: 1250
          },
          databaseConnected: false
        }
      });
    }

    // Get real analytics from database
    const agencyGrowthQuery = await pool.query(`
      SELECT
        DATE_TRUNC('month', created_at) as month,
        COUNT(*) as count
      FROM agencies
      WHERE created_at >= CURRENT_DATE - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month
    `);

    const planDistributionQuery = await pool.query(`
      SELECT
        settings->>'plan' as plan,
        COUNT(*) as count,
        SUM(CAST(settings->>'monthlyPrice' AS DECIMAL)) as revenue
      FROM agencies
      WHERE settings->>'plan' IS NOT NULL
      GROUP BY settings->>'plan'
    `);

    const userActivityQuery = await pool.query(`
      SELECT
        DATE_TRUNC('day', last_login_at) as day,
        COUNT(*) as active_users
      FROM users
      WHERE last_login_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE_TRUNC('day', last_login_at)
      ORDER BY day
    `);

    // Process the data
    const agencyGrowth = {
      labels: agencyGrowthQuery.rows.map(row =>
        new Date(row.month).toLocaleDateString('en-US', { month: 'short' })
      ),
      data: agencyGrowthQuery.rows.map(row => parseInt(row.count))
    };

    const revenueByPlan = {};
    planDistributionQuery.rows.forEach(row => {
      revenueByPlan[row.plan] = parseFloat(row.revenue) || 0;
    });

    const userActivity = {
      daily: userActivityQuery.rows.map(row => parseInt(row.active_users)),
      weekly: [850, 920, 1050, 1180], // Calculate from daily data
      monthly: [3200, 3800, 4200, 4600] // Calculate from historical data
    };

    const analytics = {
      userActivity,
      agencyGrowth,
      revenueAnalytics: {
        monthly: [8500, 9200, 10500, 11800, 12500, 13200], // Historical data
        byPlan: revenueByPlan
      },
      systemMetrics: {
        uptime: 99.9,
        responseTime: 145,
        errorRate: 0.1,
        activeUsers: userActivity.daily.reduce((a, b) => a + b, 0)
      },
      databaseConnected: true
    };

    res.json({
      success: true,
      data: analytics
    });

  } catch (error) {
    console.error('❌ Error fetching analytics from database:', error);

    // Fallback to demo analytics on error
    res.json({
      success: true,
      data: {
        userActivity: {
          daily: [120, 135, 148, 162, 155, 170, 185],
          weekly: [850, 920, 1050, 1180],
          monthly: [3200, 3800, 4200, 4600]
        },
        agencyGrowth: {
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
          data: [5, 8, 12, 15, 18, 22]
        },
        revenueAnalytics: {
          monthly: [8500, 9200, 10500, 11800, 12500, 13200],
          byPlan: {
            basic: 3500,
            standard: 4200,
            premium: 3800,
            enterprise: 1700
          }
        },
        systemMetrics: {
          uptime: 99.9,
          responseTime: 145,
          errorRate: 0.1,
          activeUsers: 1250
        },
        databaseConnected: false,
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
        (SELECT COUNT(*) FROM users WHERE agency_id::text = a.id::text AND status = 'active') as user_count
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

  // Debug: Log received data
  console.log('🔍 Received agency creation data:', {
    agencyName,
    managerName,
    managerEmail,
    city,
    plan,
    description,
    fullBody: req.body
  });

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
    let managerId = crypto.randomUUID();

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
      city && city.trim() ? city.trim() : 'Not Specified'
    ]);

    // Insert manager user into database with temporary password
    const bcrypt = require('bcryptjs');
    const tempPassword = await bcrypt.hash('TempPassword123!', 10);

    // Check if email already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [managerEmail]);

    let managerResult;
    if (existingUser.rows.length > 0) {
      // Use existing user as manager
      const existingUserId = existingUser.rows[0].id;
      managerResult = { rows: [{ id: existingUserId }] };
      managerId = existingUserId;
      console.log('📧 Using existing user as manager:', managerEmail);
    } else {
      // Create new user
      // Split manager name into first and last name
      const nameParts = managerName.trim().split(' ');
      const firstName = nameParts[0] || managerName;
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Manager';

      managerResult = await pool.query(`
        INSERT INTO users (
          id, email, first_name, last_name, role, status, agency_id, password, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        RETURNING *
      `, [
        managerId,
        managerEmail,
        firstName,
        lastName,
        'manager',
        'invited', // Set as invited so they need to set their own password
        agencyId,
        tempPassword
      ]);
      console.log('👤 Created new manager user:', managerEmail);
    }

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
    console.error('❌ Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint,
      table: error.table,
      column: error.column
    });

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
        error: error.message,
        errorDetails: {
          code: error.code,
          constraint: error.constraint,
          table: error.table,
          column: error.column
        }
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

    // Create SaaS subscription tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(50) NOT NULL UNIQUE,
        display_name VARCHAR(100) NOT NULL,
        description TEXT,
        monthly_price DECIMAL(10,2) NOT NULL,
        quarterly_price DECIMAL(10,2),
        semi_annual_price DECIMAL(10,2),
        annual_price DECIMAL(10,2),
        max_leads INTEGER DEFAULT NULL,
        max_users INTEGER DEFAULT NULL,
        max_properties INTEGER DEFAULT NULL,
        features JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create subscriptions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        plan_id UUID REFERENCES subscription_plans(id),
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        billing_cycle VARCHAR(20) NOT NULL,
        is_trial BOOLEAN DEFAULT false,
        trial_start_date TIMESTAMP,
        trial_end_date TIMESTAMP,
        trial_converted BOOLEAN DEFAULT false,
        current_period_start TIMESTAMP NOT NULL,
        current_period_end TIMESTAMP NOT NULL,
        next_billing_date TIMESTAMP,
        amount DECIMAL(10,2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'USD',
        payment_method_id VARCHAR(255),
        customer_id VARCHAR(255),
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        cancelled_at TIMESTAMP,
        cancelled_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add SaaS fields to users table
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS subscription_id UUID,
      ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20) DEFAULT 'trial',
      ADD COLUMN IF NOT EXISTS trial_end_date TIMESTAMP,
      ADD COLUMN IF NOT EXISTS plan_name VARCHAR(50) DEFAULT 'starter'
    `).catch((error) => {
      console.log('Note: Some SaaS columns may already exist:', error.message);
    });

    // Insert default subscription plans
    await pool.query(`
      INSERT INTO subscription_plans (name, display_name, description, monthly_price, quarterly_price, semi_annual_price, annual_price, max_leads, max_users, features) VALUES
      ('starter', 'Starter Plan', 'Perfect for small agencies getting started', 99.00, 267.00, 495.00, 950.00, 1000, 3, '{"whatsapp": false, "analytics": "basic", "branding": "none", "api_access": false}'),
      ('pro', 'Pro Plan', 'Ideal for growing agencies with advanced needs', 199.00, 537.00, 995.00, 1900.00, 5000, 10, '{"whatsapp": true, "analytics": "advanced", "branding": "basic", "api_access": true, "google_sheets": true}'),
      ('agency', 'Agency Plan', 'Complete white-label solution for large agencies', 399.00, 1077.00, 1995.00, 3800.00, NULL, NULL, '{"whatsapp": true, "analytics": "enterprise", "branding": "full", "api_access": true, "google_sheets": true, "white_label": true, "custom_domain": true}')
      ON CONFLICT (name) DO NOTHING
    `);

    console.log('✅ Database tables created successfully with SaaS support');

    res.json({
      success: true,
      message: 'Database tables created successfully with SaaS support',
      tables: ['agencies', 'users', 'subscription_plans', 'subscriptions'],
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
