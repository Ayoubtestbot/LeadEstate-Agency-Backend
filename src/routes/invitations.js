const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const brevoService = require('../services/brevoService');
const { pool } = require('../config/database');

// Generate secure invitation token
const generateInvitationToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// POST /api/invitations/manager - Invite a new manager
router.post('/manager', async (req, res) => {
  try {
    const {
      managerEmail,
      managerName,
      agencyName,
      invitedBy,
      expiresInHours = 48
    } = req.body;

    // Validate required fields
    if (!managerEmail || !managerName || !agencyName || !invitedBy) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: managerEmail, managerName, agencyName, invitedBy'
      });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [managerEmail]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Generate invitation token and expiry
    const invitationToken = generateInvitationToken();
    const expiresAt = new Date(Date.now() + (expiresInHours * 60 * 60 * 1000));

    // Create pending user record
    const userId = crypto.randomUUID();
    await pool.query(`
      INSERT INTO users (
        id, email, first_name, role, status, 
        invitation_token, invitation_sent_at, invitation_expires_at,
        agency_name, invited_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      userId,
      managerEmail,
      managerName,
      'manager',
      'invited',
      invitationToken,
      new Date(),
      expiresAt,
      agencyName,
      invitedBy
    ]);

    // Create setup link
    const setupLink = `${process.env.FRONTEND_URL}/setup-account?token=${invitationToken}&type=manager`;

    // Send enhanced invitation email
    const emailResult = await brevoService.sendManagerInvitation({
      managerEmail,
      managerName,
      agencyName,
      invitedBy,
      setupLink,
      expiresIn: `${expiresInHours} hours`
    });

    if (!emailResult.success) {
      console.warn('Failed to send invitation email:', emailResult.error);
    }

    res.status(201).json({
      success: true,
      message: 'Manager invitation sent successfully',
      data: {
        userId,
        invitationToken,
        expiresAt,
        emailSent: emailResult.success,
        setupLink // For testing purposes
      }
    });

  } catch (error) {
    console.error('Error sending manager invitation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send manager invitation',
      error: error.message
    });
  }
});

// POST /api/invitations/agent - Invite a new agent
router.post('/agent', async (req, res) => {
  try {
    const {
      agentEmail,
      agentName,
      agencyName,
      managerName,
      role, // 'super_agent' or 'agent'
      agencyInfo = {},
      expiresInDays = 7
    } = req.body;

    // Validate required fields
    if (!agentEmail || !agentName || !agencyName || !managerName || !role) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: agentEmail, agentName, agencyName, managerName, role'
      });
    }

    // Validate role
    if (!['super_agent', 'agent'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Role must be either "super_agent" or "agent"'
      });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [agentEmail]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Generate invitation token and expiry
    const invitationToken = generateInvitationToken();
    const expiresAt = new Date(Date.now() + (expiresInDays * 24 * 60 * 60 * 1000));

    // Create pending user record
    const userId = crypto.randomUUID();
    await pool.query(`
      INSERT INTO users (
        id, email, first_name, role, status, 
        invitation_token, invitation_sent_at, invitation_expires_at,
        agency_name, invited_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      userId,
      agentEmail,
      agentName,
      role,
      'invited',
      invitationToken,
      new Date(),
      expiresAt,
      agencyName,
      managerName
    ]);

    // Create setup link
    const setupLink = `${process.env.FRONTEND_URL}/setup-account?token=${invitationToken}&type=agent`;

    // Send enhanced invitation email
    const emailResult = await brevoService.sendAgentInvitation({
      agentEmail,
      agentName,
      agencyName,
      managerName,
      role,
      setupLink,
      expiresIn: `${expiresInDays} days`,
      agencyInfo
    });

    if (!emailResult.success) {
      console.warn('Failed to send invitation email:', emailResult.error);
    }

    res.status(201).json({
      success: true,
      message: 'Agent invitation sent successfully',
      data: {
        userId,
        invitationToken,
        expiresAt,
        emailSent: emailResult.success,
        setupLink // For testing purposes
      }
    });

  } catch (error) {
    console.error('Error sending agent invitation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send agent invitation',
      error: error.message
    });
  }
});

// POST /api/invitations/resend - Resend invitation
router.post('/resend', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Get user invitation details
    const userResult = await pool.query(`
      SELECT * FROM users 
      WHERE id = $1 AND status = 'invited' AND invitation_expires_at > NOW()
    `, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Invitation not found or expired'
      });
    }

    const user = userResult.rows[0];
    const setupLink = `${process.env.FRONTEND_URL}/setup-account?token=${user.invitation_token}&type=${user.role === 'manager' ? 'manager' : 'agent'}`;

    // Determine email type and send
    let emailResult;
    if (user.role === 'manager') {
      emailResult = await brevoService.sendManagerInvitation({
        managerEmail: user.email,
        managerName: user.first_name,
        agencyName: user.agency_name,
        invitedBy: user.invited_by,
        setupLink,
        expiresIn: '48 hours'
      });
    } else {
      emailResult = await brevoService.sendAgentInvitation({
        agentEmail: user.email,
        agentName: user.first_name,
        agencyName: user.agency_name,
        managerName: user.invited_by,
        role: user.role,
        setupLink,
        expiresIn: '7 days'
      });
    }

    // Update invitation sent timestamp
    await pool.query(
      'UPDATE users SET invitation_sent_at = NOW() WHERE id = $1',
      [userId]
    );

    res.json({
      success: true,
      message: 'Invitation resent successfully',
      emailSent: emailResult.success
    });

  } catch (error) {
    console.error('Error resending invitation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resend invitation',
      error: error.message
    });
  }
});

// GET /api/invitations/pending - Get pending invitations
router.get('/pending', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id, email, first_name, role, agency_name, invited_by,
        invitation_sent_at, invitation_expires_at,
        CASE 
          WHEN invitation_expires_at < NOW() THEN 'expired'
          ELSE 'pending'
        END as invitation_status
      FROM users 
      WHERE status = 'invited'
      ORDER BY invitation_sent_at DESC
    `);

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('Error fetching pending invitations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending invitations',
      error: error.message
    });
  }
});

module.exports = router;
