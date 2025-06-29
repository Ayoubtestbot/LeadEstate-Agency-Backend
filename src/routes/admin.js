const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const fs = require('fs');
const path = require('path');
const reminderService = require('../services/reminderService');

// POST /api/admin/migrate - Run database migrations
router.post('/migrate', async (req, res) => {
  try {
    console.log('🔄 Starting database migration for invitation system...');

    // Read the migration file
    const migrationPath = path.join(__dirname, '../migrations/add_invitation_system.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Execute the migration
    await pool.query(migrationSQL);

    console.log('✅ Database migration completed successfully');

    res.json({
      success: true,
      message: 'Database migration completed successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Migration failed:', error);
    res.status(500).json({
      success: false,
      message: 'Database migration failed',
      error: error.message
    });
  }
});

// GET /api/admin/invitation-stats - Get invitation statistics
router.get('/invitation-stats', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN status = 'invited' THEN 1 END) as pending_invitations,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_users,
        COUNT(CASE WHEN status = 'suspended' THEN 1 END) as suspended_users,
        COUNT(CASE WHEN invitation_expires_at < NOW() AND status = 'invited' THEN 1 END) as expired_invitations
      FROM users
    `);

    const roleStats = await pool.query(`
      SELECT 
        role,
        COUNT(*) as count,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_count
      FROM users 
      WHERE role IS NOT NULL
      GROUP BY role
    `);

    const recentInvitations = await pool.query(`
      SELECT 
        email, first_name, role, agency_name, invited_by,
        invitation_sent_at, invitation_expires_at, status
      FROM users 
      WHERE status = 'invited'
      ORDER BY invitation_sent_at DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      data: {
        overview: stats.rows[0],
        roleBreakdown: roleStats.rows,
        recentInvitations: recentInvitations.rows
      }
    });

  } catch (error) {
    console.error('Error fetching invitation stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invitation statistics',
      error: error.message
    });
  }
});

// POST /api/admin/send-reminders - Manually trigger reminder emails
router.post('/send-reminders', async (req, res) => {
  try {
    const result = await reminderService.sendPendingReminders();
    
    res.json({
      success: true,
      message: 'Reminder check completed',
      data: result
    });

  } catch (error) {
    console.error('Error sending reminders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send reminders',
      error: error.message
    });
  }
});

module.exports = router;
