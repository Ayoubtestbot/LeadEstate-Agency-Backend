const brevoService = require('./brevoService');
const { pool } = require('../config/database');

class ReminderService {
  constructor() {
    this.reminderIntervals = {
      first: 24 * 60 * 60 * 1000,  // 24 hours
      second: 72 * 60 * 60 * 1000, // 72 hours (3 days)
      final: 144 * 60 * 60 * 1000  // 144 hours (6 days)
    };
  }

  // Send reminder emails for pending invitations
  async sendPendingReminders() {
    try {
      console.log('🔄 Checking for pending invitations that need reminders...');

      // First check if the invitation columns exist
      const columnCheck = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'users'
        AND column_name IN ('invitation_sent_at', 'invitation_expires_at', 'invitation_token')
      `);

      const hasInvitationColumns = columnCheck.rows.length >= 3;

      if (!hasInvitationColumns) {
        console.log('⚠️ Invitation system columns not found. Adding them now...');

        // Add missing columns
        await pool.query(`
          ALTER TABLE users
          ADD COLUMN IF NOT EXISTS invitation_token VARCHAR(255),
          ADD COLUMN IF NOT EXISTS invitation_sent_at TIMESTAMP,
          ADD COLUMN IF NOT EXISTS invitation_expires_at TIMESTAMP,
          ADD COLUMN IF NOT EXISTS account_activated_at TIMESTAMP,
          ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP,
          ADD COLUMN IF NOT EXISTS agency_name VARCHAR(255),
          ADD COLUMN IF NOT EXISTS invited_by VARCHAR(255)
        `);

        console.log('✅ Invitation system columns added successfully');
      }

      // Get users who need reminders
      const pendingUsers = await pool.query(`
        SELECT
          u.*,
          EXTRACT(EPOCH FROM (NOW() - COALESCE(u.invitation_sent_at, u.created_at))) * 1000 as time_since_sent,
          EXTRACT(EPOCH FROM (COALESCE(u.invitation_expires_at, NOW() + INTERVAL '7 days') - NOW())) * 1000 as time_until_expiry
        FROM users u
        WHERE u.status = 'invited'
        AND COALESCE(u.invitation_expires_at, NOW() + INTERVAL '7 days') > NOW()
      `);

      const reminders = {
        sent: 0,
        failed: 0,
        skipped: 0
      };

      for (const user of pendingUsers.rows) {
        const timeSinceSent = parseInt(user.time_since_sent);
        const timeUntilExpiry = parseInt(user.time_until_expiry);

        // Check if user needs a reminder
        const needsReminder = await this.shouldSendReminder(user.id, timeSinceSent);

        if (needsReminder) {
          const reminderType = this.getReminderType(timeSinceSent, timeUntilExpiry);
          
          if (reminderType) {
            const success = await this.sendReminder(user, reminderType, timeUntilExpiry);
            if (success) {
              reminders.sent++;
            } else {
              reminders.failed++;
            }
          } else {
            reminders.skipped++;
          }
        } else {
          reminders.skipped++;
        }
      }

      console.log(`✅ Reminder check completed: ${reminders.sent} sent, ${reminders.failed} failed, ${reminders.skipped} skipped`);
      
      return {
        success: true,
        summary: reminders,
        totalChecked: pendingUsers.rows.length
      };

    } catch (error) {
      console.error('❌ Error in reminder service:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Check if user should receive a reminder
  async shouldSendReminder(userId, timeSinceSent) {
    try {
      // Check if we've already sent reminders
      const lastReminder = await pool.query(`
        SELECT sent_at FROM invitation_logs 
        WHERE user_id = $1 AND email_type LIKE '%reminder%'
        ORDER BY sent_at DESC 
        LIMIT 1
      `, [userId]);

      // If no reminders sent yet, check if it's time for first reminder
      if (lastReminder.rows.length === 0) {
        return timeSinceSent >= this.reminderIntervals.first;
      }

      // If reminder was sent, check if enough time has passed for next reminder
      const lastReminderTime = new Date(lastReminder.rows[0].sent_at).getTime();
      const timeSinceLastReminder = Date.now() - lastReminderTime;

      return timeSinceLastReminder >= this.reminderIntervals.first;

    } catch (error) {
      console.error('Error checking reminder status:', error);
      return false;
    }
  }

  // Determine what type of reminder to send
  getReminderType(timeSinceSent, timeUntilExpiry) {
    const hoursUntilExpiry = timeUntilExpiry / (60 * 60 * 1000);

    // Final reminder - less than 24 hours left
    if (hoursUntilExpiry <= 24) {
      return 'final';
    }
    
    // Second reminder - 3+ days since sent
    if (timeSinceSent >= this.reminderIntervals.second) {
      return 'second';
    }
    
    // First reminder - 1+ day since sent
    if (timeSinceSent >= this.reminderIntervals.first) {
      return 'first';
    }

    return null;
  }

  // Send reminder email
  async sendReminder(user, reminderType, timeUntilExpiry) {
    try {
      const hoursUntilExpiry = Math.ceil(timeUntilExpiry / (60 * 60 * 1000));
      const expiresIn = hoursUntilExpiry <= 24 
        ? `${hoursUntilExpiry} hours` 
        : `${Math.ceil(hoursUntilExpiry / 24)} days`;

      const setupLink = `${process.env.FRONTEND_URL}/setup-account?token=${user.invitation_token}&type=${user.role === 'manager' ? 'manager' : 'agent'}`;

      const emailResult = await brevoService.sendSetupReminder({
        userEmail: user.email,
        userName: user.first_name,
        role: user.role,
        setupLink,
        expiresIn,
        agencyName: user.agency_name
      });

      return emailResult.success;

    } catch (error) {
      console.error(`Error sending ${reminderType} reminder to ${user.email}:`, error);
      return false;
    }
  }

  // Clean up expired invitations
  async cleanupExpiredInvitations() {
    try {
      console.log('🧹 Cleaning up expired invitations...');

      // Check if invitation_expires_at column exists
      const columnCheck = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'invitation_expires_at'
      `);

      if (columnCheck.rows.length === 0) {
        console.log('ℹ️ No invitation_expires_at column found, skipping cleanup');
        return { success: true, cleanedUp: 0, details: [] };
      }

      const result = await pool.query(`
        DELETE FROM users
        WHERE status = 'invited'
        AND invitation_expires_at < NOW()
        RETURNING email, first_name, COALESCE(agency_name, 'Unknown') as agency_name, COALESCE(invited_by, 'Unknown') as invited_by
      `);

      console.log(`✅ Cleaned up ${result.rows.length} expired invitations`);

      return {
        success: true,
        cleanedUp: result.rows.length,
        details: result.rows
      };

    } catch (error) {
      console.error('❌ Error cleaning up expired invitations:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Start automatic reminder checking (call this on server startup)
  startReminderScheduler() {
    console.log('🕐 Starting invitation reminder scheduler...');
    
    // Check every 6 hours
    const checkInterval = 6 * 60 * 60 * 1000;
    
    setInterval(async () => {
      await this.sendPendingReminders();
      await this.cleanupExpiredInvitations();
    }, checkInterval);

    // Run initial check after 1 minute
    setTimeout(async () => {
      await this.sendPendingReminders();
      await this.cleanupExpiredInvitations();
    }, 60000);

    console.log('✅ Reminder scheduler started (checks every 6 hours)');
  }
}

module.exports = new ReminderService();
