const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const brevoService = require('../services/brevoService');
const { pool } = require('../config/database');

// GET /api/account-setup/verify-token - Verify invitation token
router.get('/verify-token', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Invitation token is required'
      });
    }

    // Find user with this token
    const result = await pool.query(`
      SELECT id, email, first_name, role, agency_name, invited_by, 
             invitation_expires_at, status
      FROM users 
      WHERE invitation_token = $1 AND status = 'invited'
    `, [token]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or expired invitation token'
      });
    }

    const user = result.rows[0];

    // Check if token is expired
    if (new Date() > new Date(user.invitation_expires_at)) {
      return res.status(410).json({
        success: false,
        message: 'Invitation token has expired',
        expired: true
      });
    }

    res.json({
      success: true,
      message: 'Token is valid',
      data: {
        email: user.email,
        firstName: user.first_name,
        role: user.role,
        agencyName: user.agency_name,
        invitedBy: user.invited_by,
        expiresAt: user.invitation_expires_at
      }
    });

  } catch (error) {
    console.error('Error verifying token:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify invitation token',
      error: error.message
    });
  }
});

// POST /api/account-setup/complete - Complete account setup
router.post('/complete', async (req, res) => {
  try {
    const {
      token,
      password,
      firstName,
      lastName,
      phone,
      profileData = {}
    } = req.body;

    // Validate required fields
    if (!token || !password || !firstName) {
      return res.status(400).json({
        success: false,
        message: 'Token, password, and firstName are required'
      });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }

    // Find user with this token
    const userResult = await pool.query(`
      SELECT * FROM users 
      WHERE invitation_token = $1 AND status = 'invited'
    `, [token]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or expired invitation token'
      });
    }

    const user = userResult.rows[0];

    // Check if token is expired
    if (new Date() > new Date(user.invitation_expires_at)) {
      return res.status(410).json({
        success: false,
        message: 'Invitation token has expired'
      });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Update user record
    const updateResult = await pool.query(`
      UPDATE users 
      SET 
        password = $1,
        first_name = $2,
        last_name = $3,
        phone = $4,
        status = 'active',
        account_activated_at = NOW(),
        invitation_token = NULL,
        updated_at = NOW()
      WHERE id = $5
      RETURNING id, email, first_name, last_name, role, agency_name
    `, [hashedPassword, firstName, lastName || '', phone || '', user.id]);

    const updatedUser = updateResult.rows[0];

    // Create or update agency if user is a manager
    let agencyId = null;
    if (user.role === 'manager') {
      // Create agency
      const agencyResult = await pool.query(`
        INSERT INTO agencies (name, manager_id, email, created_at)
        VALUES ($1, $2, $3, NOW())
        RETURNING id
      `, [user.agency_name, user.id, user.email]);
      
      agencyId = agencyResult.rows[0].id;

      // Update user with agency_id
      await pool.query(
        'UPDATE users SET agency_id = $1 WHERE id = $2',
        [agencyId, user.id]
      );
    }

    // Generate JWT token for immediate login
    const jwtToken = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        role: user.role,
        agencyId: agencyId 
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Send welcome email
    const loginUrl = `${process.env.FRONTEND_URL}/dashboard`;
    const emailResult = await brevoService.sendAccountCreatedConfirmation({
      userEmail: user.email,
      userName: firstName,
      role: user.role,
      agencyName: user.agency_name,
      loginUrl,
      managerName: user.role !== 'manager' ? user.invited_by : null
    });

    // Log the invitation completion
    await pool.query(`
      INSERT INTO invitation_logs (user_id, email_type, email_address, email_status)
      VALUES ($1, $2, $3, $4)
    `, [user.id, 'account_created', user.email, emailResult.success ? 'sent' : 'failed']);

    res.status(201).json({
      success: true,
      message: 'Account setup completed successfully',
      data: {
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          firstName: updatedUser.first_name,
          lastName: updatedUser.last_name,
          role: updatedUser.role,
          agencyName: updatedUser.agency_name,
          agencyId: agencyId
        },
        token: jwtToken,
        welcomeEmailSent: emailResult.success
      }
    });

  } catch (error) {
    console.error('Error completing account setup:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete account setup',
      error: error.message
    });
  }
});

// POST /api/account-setup/resend-invitation - Resend invitation (for expired tokens)
router.post('/resend-invitation', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Find user with this email
    const userResult = await pool.query(`
      SELECT * FROM users 
      WHERE email = $1 AND status = 'invited'
    `, [email]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No pending invitation found for this email'
      });
    }

    const user = userResult.rows[0];

    // Generate new token and extend expiry
    const crypto = require('crypto');
    const newToken = crypto.randomBytes(32).toString('hex');
    const newExpiry = new Date(Date.now() + (48 * 60 * 60 * 1000)); // 48 hours

    // Update user with new token
    await pool.query(`
      UPDATE users 
      SET invitation_token = $1, 
          invitation_expires_at = $2,
          invitation_sent_at = NOW()
      WHERE id = $3
    `, [newToken, newExpiry, user.id]);

    // Create new setup link
    const setupLink = `${process.env.FRONTEND_URL}/setup-account?token=${newToken}&type=${user.role === 'manager' ? 'manager' : 'agent'}`;

    // Send new invitation email
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
        expiresIn: '48 hours'
      });
    }

    res.json({
      success: true,
      message: 'New invitation sent successfully',
      data: {
        newToken,
        expiresAt: newExpiry,
        emailSent: emailResult.success
      }
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

module.exports = router;
