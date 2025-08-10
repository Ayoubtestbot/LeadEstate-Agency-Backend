const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const brevoService = require('../services/brevoService');
const { pool } = require('../config/database');

// GET /api/user-management/users - Get all users with invitation status
router.get('/users', async (req, res) => {
  try {
    const { status, role, agency } = req.query;
    
    let query = `
      SELECT 
        u.id, u.email, u.first_name, u.last_name, u.role, u.status,
        u.agency_name, u.invited_by, u.phone,
        u.invitation_sent_at, u.invitation_expires_at, u.account_activated_at,
        u.last_login_at, u.created_at,
        CASE 
          WHEN u.status = 'invited' AND u.invitation_expires_at < NOW() THEN 'expired'
          WHEN u.status = 'invited' AND u.invitation_expires_at >= NOW() THEN 'pending'
          ELSE u.status
        END as invitation_status
      FROM users u
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
      query += ` AND u.status = $${paramCount}`;
      params.push(status);
    }

    if (role) {
      paramCount++;
      query += ` AND u.role = $${paramCount}`;
      params.push(role);
    }

    if (agency) {
      paramCount++;
      query += ` AND u.agency_name ILIKE $${paramCount}`;
      params.push(`%${agency}%`);
    }

    query += ` ORDER BY u.created_at DESC`;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
});

// POST /api/user-management/users/:id/resend-invitation - Resend invitation
router.post('/users/:id/resend-invitation', async (req, res) => {
  try {
    const { id } = req.params;

    // Get user details
    const userResult = await pool.query(`
      SELECT * FROM users 
      WHERE id = $1 AND status = 'invited'
    `, [id]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found or not in invited status'
      });
    }

    const user = userResult.rows[0];

    // Generate new token and extend expiry
    const newToken = crypto.randomBytes(32).toString('hex');
    const expiresInHours = user.role === 'manager' ? 48 : 168; // 48h for managers, 7 days for agents
    const newExpiry = new Date(Date.now() + (expiresInHours * 60 * 60 * 1000));

    // Update user with new token
    await pool.query(`
      UPDATE users 
      SET invitation_token = $1, 
          invitation_expires_at = $2,
          invitation_sent_at = NOW()
      WHERE id = $3
    `, [newToken, newExpiry, id]);

    // Create setup link
    const setupLink = `${process.env.FRONTEND_URL}/setup-account?token=${newToken}&type=${user.role === 'manager' ? 'manager' : 'agent'}`;

    // Send invitation email
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

    res.json({
      success: true,
      message: 'Invitation resent successfully',
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

// DELETE /api/user-management/users/:id/invitation - Cancel invitation
router.delete('/users/:id/invitation', async (req, res) => {
  try {
    const { id } = req.params;

    // Delete invited user
    const result = await pool.query(`
      DELETE FROM users 
      WHERE id = $1 AND status = 'invited'
      RETURNING email, first_name, agency_name
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Invitation not found or user already activated'
      });
    }

    res.json({
      success: true,
      message: 'Invitation cancelled successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error cancelling invitation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel invitation',
      error: error.message
    });
  }
});

module.exports = router;
