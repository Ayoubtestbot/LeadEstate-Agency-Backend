const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { pool } = require('../config/database');
const brevoService = require('../services/brevoService');
const repositoryAutomationService = require('../services/repositoryAutomationService');
const auditService = require('../services/auditService');

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

// POST /api/owner-integration/create-agency - Create new agency with repositories
router.post('/create-agency', verifyOwnerRequest, async (req, res) => {
  try {
    const {
      agencyName,
      managerName,
      managerEmail,
      domain,
      plan,
      companySize,
      customBranding = {},
      autoSetup = true,
      ownerInfo = {}
    } = req.body;

    console.log('🏢 Creating new agency:', agencyName);

    // Validate required fields
    if (!agencyName || !managerName || !managerEmail) {
      return res.status(400).json({
        success: false,
        message: 'Agency name, manager name, and manager email are required'
      });
    }

    // Start transaction
    await pool.query('BEGIN');

    try {
      // Step 1: Create repositories and infrastructure
      console.log('📁 Creating repositories for agency:', agencyName);
      
      const repositoryResult = await repositoryAutomationService.createAgencyRepositories({
        name: agencyName,
        managerName,
        managerEmail,
        domain,
        plan,
        companySize,
        ...customBranding
      });

      if (!repositoryResult.success) {
        throw new Error(`Repository creation failed: ${repositoryResult.error}`);
      }

      // Step 2: Create agency in database
      const agencyId = crypto.randomUUID();
      await pool.query(`
        INSERT INTO agencies (
          id, name, email, phone, address, city, country,
          license_number, specialization, description, settings,
          owner_id, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
      `, [
        agencyId,
        agencyName,
        managerEmail,
        ownerInfo.phone || '',
        ownerInfo.address || '',
        ownerInfo.city || '',
        ownerInfo.country || '',
        ownerInfo.licenseNumber || '',
        ownerInfo.specialization || [],
        `${agencyName} - Professional Real Estate Agency`,
        JSON.stringify({
          plan,
          companySize,
          customBranding,
          autoSetup,
          repositories: repositoryResult.data.repositories,
          database: repositoryResult.data.database,
          domain: domain || `${repositoryResult.data.agencySlug}.leadestate.com`
        }),
        ownerInfo.id || null,
        autoSetup ? 'active' : 'setup'
      ]);

      // Step 3: Create manager invitation
      const invitationToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + (48 * 60 * 60 * 1000)); // 48 hours

      const managerId = crypto.randomUUID();
      await pool.query(`
        INSERT INTO users (
          id, email, first_name, role, status, agency_id,
          invitation_token, invitation_sent_at, invitation_expires_at,
          agency_name, invited_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      `, [
        managerId,
        managerEmail,
        managerName,
        'manager',
        'invited',
        agencyId,
        invitationToken,
        new Date(),
        expiresAt,
        agencyName,
        'LeadEstate Owner'
      ]);

      // Update agency with manager_id
      await pool.query(
        'UPDATE agencies SET manager_id = $1 WHERE id = $2',
        [managerId, agencyId]
      );

      // Step 4: Send manager invitation email
      const setupLink = `${repositoryResult.data.repositories.frontend.deployUrl}/setup-account?token=${invitationToken}&type=manager`;
      
      const emailResult = await brevoService.sendManagerInvitation({
        managerEmail,
        managerName,
        agencyName,
        invitedBy: 'LeadEstate Owner',
        setupLink,
        expiresIn: '48 hours'
      });

      await pool.query('COMMIT');

      console.log('✅ Agency created successfully:', agencyName);

      res.status(201).json({
        success: true,
        message: 'Agency created successfully with repositories and infrastructure',
        data: {
          agency: {
            id: agencyId,
            name: agencyName,
            domain: domain || `${repositoryResult.data.agencySlug}.leadestate.com`,
            status: autoSetup ? 'active' : 'setup'
          },
          manager: {
            id: managerId,
            email: managerEmail,
            name: managerName,
            invitationToken,
            expiresAt,
            setupLink
          },
          repositories: repositoryResult.data.repositories,
          database: repositoryResult.data.database,
          emailSent: emailResult.success,
          createdAt: new Date().toISOString()
        }
      });

    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('❌ Error creating agency:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create agency',
      error: error.message
    });
  }
});

// GET /api/owner-integration/agencies - Get all agencies for owner dashboard
router.get('/agencies', verifyOwnerRequest, async (req, res) => {
  try {
    const { status, search, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT 
        a.*,
        u.first_name as manager_name,
        u.email as manager_email,
        u.status as manager_status,
        u.last_login_at as manager_last_login,
        (SELECT COUNT(*) FROM users WHERE agency_id = a.id AND status = 'active') as active_users,
        (SELECT COUNT(*) FROM users WHERE agency_id = a.id AND status = 'invited') as pending_users,
        (SELECT COUNT(*) FROM leads WHERE agency_id = a.id) as total_leads,
        (SELECT COUNT(*) FROM properties WHERE agency_id = a.id) as total_properties
      FROM agencies a
      LEFT JOIN users u ON a.manager_id = u.id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
      query += ` AND a.status = $${paramCount}`;
      params.push(status);
    }

    if (search) {
      paramCount++;
      query += ` AND (a.name ILIKE $${paramCount} OR a.email ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY a.created_at DESC`;

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

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    console.error('Error fetching agencies for owner dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agencies',
      error: error.message
    });
  }
});

module.exports = router;
