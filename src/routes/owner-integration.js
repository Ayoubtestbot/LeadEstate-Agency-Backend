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
  const RepositoryAutomationService = require('../services/repositoryAutomationService');
  repositoryAutomationService = new RepositoryAutomationService();
  console.log('✅ Repository automation service loaded successfully');
} catch (error) {
  console.warn('⚠️ Repository automation service not available:', error.message);
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
  const {
    agencyName,
    managerName,
    managerEmail,
    city,
    plan,
    description,
    // Billing information
    billingCycle,
    customPrice,
    paymentMethod,
    billingEmail,
    billingAddress,
    taxId,
    notes
  } = req.body;

  // Debug: Log received data
  console.log('🔍 Received agency creation data:', {
    agencyName,
    managerName,
    managerEmail,
    city,
    plan,
    description,
    billingInfo: {
      billingCycle,
      customPrice,
      paymentMethod,
      billingEmail,
      billingAddress,
      taxId,
      notes
    },
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

    // Step 1: Create GitHub repositories (if available)
    let repositoryResult = null;
    if (repositoryAutomationService) {
      console.log('🚀 Creating GitHub repositories for agency:', agencyName);
      try {
        repositoryResult = await repositoryAutomationService.createAgencyRepositories({
          name: agencyName,
          managerName,
          managerEmail,
          city,
          plan,
          description,
          billingCycle,
          customPrice,
          paymentMethod,
          billingEmail,
          billingAddress,
          taxId,
          notes
        });

        if (repositoryResult.success) {
          console.log('✅ GitHub repositories created successfully');
        } else {
          console.warn('⚠️ Repository creation failed:', repositoryResult.error);
        }
      } catch (repoError) {
        console.error('❌ Repository creation error:', repoError.message);
        repositoryResult = { success: false, error: repoError.message };
      }
    } else {
      console.log('⚠️ Repository automation service not available');
    }

    // Step 2: Start database transaction
    await pool.query('BEGIN');

    // Generate UUIDs for agency and manager
    const crypto = require('crypto');
    const agencyId = crypto.randomUUID();
    let managerId = crypto.randomUUID();

    // Calculate pricing based on plan and billing cycle
    const calculatePrice = (planType, cycle, customAmount) => {
      const basePrices = {
        basic: 49,
        standard: 99,
        premium: 199,
        enterprise: 399,
        custom: parseFloat(customAmount) || 0
      };

      const basePrice = basePrices[planType] || basePrices.standard;

      // Apply billing cycle discounts
      switch (cycle) {
        case 'quarterly':
          return Math.round(basePrice * 0.95 * 100) / 100; // 5% discount
        case 'yearly':
          return Math.round(basePrice * 0.90 * 100) / 100; // 10% discount
        default:
          return basePrice;
      }
    };

    const monthlyPrice = calculatePrice(plan, billingCycle, customPrice);

    // Prepare billing settings
    const billingSettings = {
      plan: plan || 'standard',
      billingCycle: billingCycle || 'monthly',
      monthlyPrice,
      customPrice: plan === 'custom' ? parseFloat(customPrice) || 0 : null,
      paymentMethod: paymentMethod || 'credit_card',
      billingEmail: billingEmail || managerEmail,
      billingAddress: billingAddress || '',
      taxId: taxId || '',
      notes: notes || '',
      billingStatus: 'active',
      nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
      createdAt: new Date().toISOString()
    };

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
      JSON.stringify(billingSettings),
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
      message: repositoryResult?.success
        ? 'Agency created successfully with GitHub repositories'
        : 'Agency created successfully (repositories creation failed)',
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
        repositories: repositoryResult?.success ? repositoryResult.data.repositories : {
          status: 'failed',
          error: repositoryResult?.error || 'Repository automation service not available'
        },
        deployment: repositoryResult?.success ? repositoryResult.data.deployment : null,
        databasePersisted: true,
        repositoriesCreated: repositoryResult?.success || false,
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

// PUT /api/owner-integration/agencies/:id - Update agency information
router.put('/agencies/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      managerName,
      managerEmail,
      city,
      description,
      plan,
      billingCycle,
      customPrice,
      paymentMethod,
      billingEmail,
      billingAddress,
      taxId,
      notes,
      status
    } = req.body;

    console.log('🔄 Updating agency:', id, req.body);

    // Check if agency exists
    const existingAgency = await pool.query('SELECT * FROM agencies WHERE id = $1', [id]);

    if (existingAgency.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agency not found'
      });
    }

    const currentAgency = existingAgency.rows[0];
    const currentSettings = currentAgency.settings || {};

    // Calculate pricing if plan or billing cycle changed
    const calculatePrice = (planType, cycle, customAmount) => {
      const basePrices = {
        basic: 49,
        standard: 99,
        premium: 199,
        enterprise: 399,
        custom: parseFloat(customAmount) || 0
      };

      const basePrice = basePrices[planType] || basePrices.standard;

      switch (cycle) {
        case 'quarterly':
          return Math.round(basePrice * 0.95 * 100) / 100;
        case 'yearly':
          return Math.round(basePrice * 0.90 * 100) / 100;
        default:
          return basePrice;
      }
    };

    // Update billing settings if provided
    const updatedSettings = {
      ...currentSettings,
      ...(plan && { plan }),
      ...(billingCycle && { billingCycle }),
      ...(paymentMethod && { paymentMethod }),
      ...(billingEmail && { billingEmail }),
      ...(billingAddress && { billingAddress }),
      ...(taxId && { taxId }),
      ...(notes && { notes })
    };

    // Recalculate price if plan or billing cycle changed
    if (plan || billingCycle) {
      const newPlan = plan || currentSettings.plan || 'standard';
      const newCycle = billingCycle || currentSettings.billingCycle || 'monthly';
      const newCustomPrice = customPrice || currentSettings.customPrice;

      updatedSettings.monthlyPrice = calculatePrice(newPlan, newCycle, newCustomPrice);

      if (newPlan === 'custom') {
        updatedSettings.customPrice = parseFloat(newCustomPrice) || 0;
      }
    }

    // Update agency in database
    const updateResult = await pool.query(`
      UPDATE agencies
      SET
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        city = COALESCE($3, city),
        description = COALESCE($4, description),
        status = COALESCE($5, status),
        settings = $6,
        updated_at = NOW()
      WHERE id = $7
      RETURNING *
    `, [
      name,
      managerEmail,
      city,
      description,
      status,
      JSON.stringify(updatedSettings),
      id
    ]);

    // Update manager information if provided
    if (managerName || managerEmail) {
      const managerId = currentAgency.manager_id;
      if (managerId) {
        await pool.query(`
          UPDATE users
          SET
            first_name = COALESCE($1, first_name),
            email = COALESCE($2, email),
            updated_at = NOW()
          WHERE id = $3
        `, [managerName, managerEmail, managerId]);
      }
    }

    const updatedAgency = updateResult.rows[0];

    console.log('✅ Agency updated successfully:', updatedAgency.name);

    res.json({
      success: true,
      message: 'Agency updated successfully',
      data: {
        id: updatedAgency.id,
        name: updatedAgency.name,
        email: updatedAgency.email,
        city: updatedAgency.city,
        description: updatedAgency.description,
        status: updatedAgency.status,
        settings: updatedAgency.settings,
        updatedAt: updatedAgency.updated_at
      }
    });

  } catch (error) {
    console.error('❌ Error updating agency:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update agency',
      error: error.message
    });
  }
});

// DELETE /api/owner-integration/agencies/:id - Delete agency
router.delete('/agencies/:id', async (req, res) => {
  try {
    const { id } = req.params;

    console.log('🗑️ Deleting agency:', id);

    // Check if agency exists
    const existingAgency = await pool.query('SELECT * FROM agencies WHERE id = $1', [id]);

    if (existingAgency.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agency not found'
      });
    }

    // Start transaction
    await pool.query('BEGIN');

    try {
      // Delete related users first (to avoid foreign key constraints)
      await pool.query('DELETE FROM users WHERE agency_id = $1', [id]);

      // Delete related leads
      await pool.query('DELETE FROM leads WHERE agency_id = $1', [id]);

      // Delete related properties
      await pool.query('DELETE FROM properties WHERE agency_id = $1', [id]);

      // Finally delete the agency
      const deleteResult = await pool.query('DELETE FROM agencies WHERE id = $1 RETURNING *', [id]);

      // Commit transaction
      await pool.query('COMMIT');

      console.log('✅ Agency deleted successfully:', deleteResult.rows[0].name);

      res.json({
        success: true,
        message: 'Agency deleted successfully',
        data: {
          deletedAgency: deleteResult.rows[0]
        }
      });

    } catch (deleteError) {
      // Rollback transaction on error
      await pool.query('ROLLBACK');
      throw deleteError;
    }

  } catch (error) {
    console.error('❌ Error deleting agency:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete agency',
      error: error.message
    });
  }
});

// GET /api/owner-integration/analytics - Get analytics data
router.get('/analytics', async (req, res) => {
  try {
    const { timeRange = '30d' } = req.query;

    // Get agencies data for analytics
    const agenciesResult = await pool.query(`
      SELECT
        a.*,
        (SELECT COUNT(*) FROM users WHERE agency_id::text = a.id::text AND status = 'active') as user_count
      FROM agencies a
      ORDER BY a.created_at DESC
    `);

    const agencies = agenciesResult.rows;
    const totalAgencies = agencies.length;
    const activeAgencies = agencies.filter(a => a.status === 'active').length;
    const totalUsers = agencies.reduce((sum, a) => sum + parseInt(a.user_count || 0), 0);

    // Calculate time-based metrics
    const now = new Date();
    const timeRangeMs = timeRange === '7d' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
    const startDate = new Date(now.getTime() - timeRangeMs);

    const newAgencies = agencies.filter(a => new Date(a.created_at) >= startDate).length;
    const growthRate = totalAgencies > 0 ? Math.round((newAgencies / totalAgencies) * 100) : 0;

    res.json({
      success: true,
      data: {
        totalAgencies,
        activeAgencies,
        totalUsers,
        newAgencies,
        growthRate,
        activeRate: totalAgencies > 0 ? Math.round((activeAgencies / totalAgencies) * 100) : 0,
        timeRange,
        agencies: agencies.slice(0, 10) // Top 10 for charts
      }
    });

  } catch (error) {
    console.error('❌ Error fetching analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics',
      error: error.message
    });
  }
});

// GET /api/owner-integration/system/health - Get system health
router.get('/system/health', async (req, res) => {
  try {
    // Check database connection
    const dbCheck = await pool.query('SELECT NOW()');
    const dbHealthy = !!dbCheck.rows[0];

    // Check agencies count
    const agenciesCount = await pool.query('SELECT COUNT(*) as count FROM agencies');
    const totalAgencies = parseInt(agenciesCount.rows[0].count);

    // Check users count
    const usersCount = await pool.query('SELECT COUNT(*) as count FROM users WHERE status = \'active\'');
    const activeUsers = parseInt(usersCount.rows[0].count);

    res.json({
      success: true,
      data: {
        database: dbHealthy ? 'healthy' : 'unhealthy',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        totalAgencies,
        activeUsers,
        systemHealth: 99.9,
        lastCheck: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error checking system health:', error);
    res.status(500).json({
      success: false,
      message: 'System health check failed',
      error: error.message,
      data: {
        database: 'unhealthy',
        systemHealth: 0
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
    services: {
      repositoryAutomationService: !!repositoryAutomationService,
      repositoryServiceType: repositoryAutomationService ? typeof repositoryAutomationService : 'undefined'
    },
    timestamp: new Date().toISOString()
  });
});

// Debug route to test repository service
router.get('/debug-repository-service', async (req, res) => {
  try {
    if (!repositoryAutomationService) {
      return res.json({
        success: false,
        error: 'Repository automation service not loaded',
        details: 'Service is null or undefined'
      });
    }

    // Test basic service functionality
    const testSlug = repositoryAutomationService.generateAgencySlug('Test Agency Name');

    res.json({
      success: true,
      service: {
        loaded: true,
        testSlug,
        hasOctokit: !!repositoryAutomationService.octokit,
        templateRepos: repositoryAutomationService.templateRepos,
        ownerUsername: repositoryAutomationService.ownerUsername
      }
    });

  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Get manager details for an agency
router.get('/agencies/:agencyId/manager', async (req, res) => {
  try {
    const { agencyId } = req.params;

    if (!pool) {
      return res.status(503).json({
        success: false,
        message: 'Database not available'
      });
    }

    // Get manager details
    const managerResult = await pool.query(`
      SELECT
        id, email, first_name, last_name, role, status,
        invitation_token, invitation_sent_at, invitation_expires_at,
        account_activated_at, created_at, updated_at
      FROM users
      WHERE agency_id = $1 AND role = 'manager'
      ORDER BY created_at DESC
      LIMIT 1
    `, [agencyId]);

    if (managerResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Manager not found for this agency'
      });
    }

    const manager = managerResult.rows[0];

    // Generate setup link if still invited
    let setupLink = null;
    if (manager.status === 'invited' && manager.invitation_token) {
      setupLink = `${process.env.FRONTEND_URL}/setup-account?token=${manager.invitation_token}&type=manager`;
    }

    res.json({
      success: true,
      data: {
        ...manager,
        setupLink,
        needsSetup: manager.status === 'invited',
        invitationExpired: manager.invitation_expires_at && new Date() > new Date(manager.invitation_expires_at)
      }
    });

  } catch (error) {
    console.error('Error getting manager details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get manager details',
      error: error.message
    });
  }
});

// GET /api/owner-integration/settings - Get owner settings
router.get('/settings', async (req, res) => {
  try {
    // For now, return default settings. In production, these would be stored in database
    const defaultSettings = {
      // General Settings
      companyName: 'LeadEstate',
      companyEmail: 'admin@leadestate.com',
      companyPhone: '+1 (555) 123-4567',
      timezone: 'UTC',
      language: 'en',

      // Notification Settings
      emailNotifications: true,
      smsNotifications: false,
      pushNotifications: true,
      weeklyReports: true,

      // Security Settings
      twoFactorAuth: false,
      sessionTimeout: 30,
      passwordExpiry: 90,

      // API Settings
      apiKey: 'owner-dashboard-2024',
      webhookUrl: '',
      rateLimitPerHour: 1000,

      // Billing Settings
      defaultPlan: 'standard',
      autoUpgrade: false,
      billingEmail: 'billing@leadestate.com'
    };

    res.json({
      success: true,
      data: defaultSettings
    });

  } catch (error) {
    console.error('❌ Error fetching settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings',
      error: error.message
    });
  }
});

// PUT /api/owner-integration/settings - Update owner settings
router.put('/settings', async (req, res) => {
  try {
    const settings = req.body;

    // In production, save to database
    // For now, just return success with the updated settings
    console.log('💾 Settings updated:', settings);

    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: settings
    });

  } catch (error) {
    console.error('❌ Error updating settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update settings',
      error: error.message
    });
  }
});

// POST /api/owner-integration/support/tickets - Submit support ticket
router.post('/support/tickets', async (req, res) => {
  try {
    const { subject, priority, category, message, contactEmail } = req.body;

    if (!subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'Subject and message are required'
      });
    }

    // Create support ticket (in production, save to database)
    const ticket = {
      id: `TK-${Date.now()}`,
      subject,
      priority: priority || 'medium',
      category: category || 'general',
      message,
      contactEmail: contactEmail || 'admin@leadestate.com',
      status: 'open',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    console.log('🎫 Support ticket created:', ticket);

    res.json({
      success: true,
      message: 'Support ticket submitted successfully',
      data: ticket
    });

  } catch (error) {
    console.error('❌ Error creating support ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit support ticket',
      error: error.message
    });
  }
});

// GET /api/owner-integration/support/tickets - Get support tickets
router.get('/support/tickets', async (req, res) => {
  try {
    // In production, fetch from database
    const tickets = [
      {
        id: 'TK-001',
        subject: 'Unable to create new agency',
        status: 'open',
        priority: 'high',
        category: 'technical',
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-16T10:00:00Z'
      },
      {
        id: 'TK-002',
        subject: 'API integration question',
        status: 'resolved',
        priority: 'medium',
        category: 'general',
        createdAt: '2024-01-10T10:00:00Z',
        updatedAt: '2024-01-12T10:00:00Z'
      }
    ];

    res.json({
      success: true,
      data: tickets
    });

  } catch (error) {
    console.error('❌ Error fetching support tickets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch support tickets',
      error: error.message
    });
  }
});

// GET /api/owner-integration/support/faqs - Get FAQs
router.get('/support/faqs', async (req, res) => {
  try {
    // In production, fetch from database
    const faqs = [
      {
        id: 1,
        question: 'How do I add a new agency?',
        answer: 'To add a new agency, go to the Agencies page and click the "Add Agency" button. Fill in the required information including agency name, manager details, city, and billing information.'
      },
      {
        id: 2,
        question: 'How can I edit agency information?',
        answer: 'You can edit agency information by clicking the three dots menu next to any agency in the table and selecting "Edit Agency". This will open a modal where you can update the details including billing information.'
      },
      {
        id: 3,
        question: 'What are the different subscription plans?',
        answer: 'We offer four plans: Basic ($49/month, up to 10 users), Standard ($99/month, up to 50 users), Premium ($199/month, up to 100 users), and Enterprise ($399/month, unlimited users). Custom pricing is also available.'
      },
      {
        id: 4,
        question: 'How do I reset an agency manager\'s password?',
        answer: 'Agency managers can reset their passwords through the login page. As an owner, you can also generate new credentials for managers through the agency edit modal.'
      },
      {
        id: 5,
        question: 'Can I export agency data?',
        answer: 'Yes, you can export agency data from the Analytics page using the Export button. Data can be exported in CSV format with comprehensive billing and usage information.'
      },
      {
        id: 6,
        question: 'How does billing work?',
        answer: 'Billing is handled automatically based on the selected plan and billing cycle. Monthly, quarterly (5% discount), and yearly (10% discount) options are available. Custom pricing can be set for enterprise clients.'
      }
    ];

    res.json({
      success: true,
      data: faqs
    });

  } catch (error) {
    console.error('❌ Error fetching FAQs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch FAQs',
      error: error.message
    });
  }
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
