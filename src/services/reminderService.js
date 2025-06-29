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

      // Get users who need reminders
      const pendingUsers = await pool.query(`
        SELECT 
          u.*,
          EXTRACT(EPOCH FROM (NOW() - u.invitation_sent_at)) * 1000 as time_since_sent,
          EXTRACT(EPOCH FROM (u.invitation_expires_at - NOW())) * 1000 as time_until_expiry
        FROM users u
        WHERE u.status = 'invited' 
        AND u.invitation_expires_at > NOW()
        AND u.invitation_sent_at IS NOT NULL
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

  // Start automatic reminder checking (call this on server startup)
  startReminderScheduler() {
    console.log('🕐 Starting invitation reminder scheduler...');
    
    // Check every 6 hours
    const checkInterval = 6 * 60 * 60 * 1000;
    
    setInterval(async () => {
      await this.sendPendingReminders();
    }, checkInterval);

    // Run initial check after 1 minute
    setTimeout(async () => {
      await this.sendPendingReminders();
    }, 60000);

    console.log('✅ Reminder scheduler started (checks every 6 hours)');
  }
}

module.exports = new ReminderService();
