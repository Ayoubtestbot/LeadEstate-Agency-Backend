const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

class BrevoSMTPEmailService {
  constructor() {
    this.smtpKey = process.env.BREVO_SMTP_KEY;
    this.smtpHost = process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com';
    this.smtpPort = process.env.BREVO_SMTP_PORT || 587;
    this.smtpUser = process.env.BREVO_SMTP_USER;
    this.senderEmail = process.env.BREVO_SENDER_EMAIL || this.smtpUser;
    this.senderName = process.env.BREVO_SENDER_NAME || 'LeadEstate';
    
    if (this.smtpKey && this.smtpUser) {
      this.transporter = nodemailer.createTransporter({
        host: this.smtpHost,
        port: this.smtpPort,
        secure: false, // true for 465, false for other ports
        auth: {
          user: this.smtpUser,
          pass: this.smtpKey
        },
        tls: {
          rejectUnauthorized: false
        }
      });
      
      logger.info('âœ… Brevo SMTP email service initialized');
      logger.info('ðŸ” SMTP Configuration:', {
        host: this.smtpHost,
        port: this.smtpPort,
        user: this.smtpUser,
        senderEmail: this.senderEmail,
        senderName: this.senderName
      });
    } else {
      logger.warn('âš 0️‏ Brevo SMTP not configured - email functionality will be disabled');
      logger.warn('Missing:', {
        smtpKey: this.smtpKey ? 'SET' : 'NOT SET',
        smtpUser: this.smtpUser ? 'SET' : 'NOT SET'
      });
    }
  }

  async sendTrialWelcomeEmail(options) {
    logger.info('ðŸ” BrevoSMTPEmailService.sendTrialWelcomeEmail called with options:', options);
    
    if (!this.transporter) {
      logger.warn('Brevo SMTP not configured, skipping trial welcome email');
      return { success: false, error: 'Brevo SMTP not configured' };
    }

    const { userEmail, userName, planName, trialEndDate } = options;

    const subject = `Welcome to LeadEstate! Your ${planName} trial has started ðŸŽ‰%;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to LeadEstate</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to LeadEstate!</h1>
          <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">Your real estate CRM journey starts now</p>
        </div>

        <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <h2 style="color: #333; margin-top: 0;">Hi ${userName}! ðŸ‘‹</h2>

          <p>Congratulations! Your <strong>${planName}</strong> trial has been activated and you now have full access to LeadEstate for the next 14 days.</p>

          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #28a745;">ðŸŽ¯ What's included in your trial:</h3>
            <ul style="margin: 0; padding-left: 20px;">
              <li>Complete lead management system</li>
              <li>Property management tools</li>
              <li>Team collaboration features</li>
              <li>Analytics and reporting</li>
              <li>Mobile app access</li>
              <li>Email notifications</li>
            </ul>
          </div>

          <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0;"><strong>â¯  Trial expires:</strong> ${new Date(trialEndDate).toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}</p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || 'https://lead-estate-agency-frontend.vercel.app'}"
               style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
              Access Your Dashboard
            </a>
          </div>

          <h3 style="color: #333;">ðŸš‬ Quick Start Tips:</h3>
          <ol>
            <li><strong>Import your leads:</strong> Use our CSV import feature to get started quickly</li>
            <li><strong>Set up your team:</strong> Invite team members to collaborate</li>
            <li><strong>Customize your workflow:</strong> Configure lead statuses and automation</li>
            <li><strong>Explore analytics:</strong> Track your performance with detailed reports</li>
          </ol>

          <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h4 style="margin-top: 0; color: #1976d2;">ðŸ’¬ Need Help?</h4>
            <p style="margin-bottom: 0;">Our support team is here to help you succeed:</p>
            <ul style="margin: 10px 0 0 0; padding-left: 20px;">
              <li>ðŸ“§ Email: support@leadestate.com</li>
              <li>ðŸ’¬ Live chat in your dashboard</li>
              <li>ðŸ“š Help center: help.leadestate.com</li>
            </ul>
          </div>

          <p>We're excited to help you grow your real estate business!</p>

          <p style="margin-bottom: 0;">
            Best regards,<br>
            <strong>The LeadEstate Team</strong>
          </p>
        </div>

        <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
          <p>Â© 2024 LeadEstate. All rights reserved.</p>
          <p>You received this email because you signed up for a LeadEstate trial.</p>
        </div>
      </body>
      </html>
    `;

    const textContent = `Welcome to LeadEstate!

Hi ${userName}!

Congratulations! Your ${planName} trial has been activated and you now have full access to LeadEstate for the next 14 days.

Trial expires: ${new Date(trialEndDate).toLocaleDateString()}

Access your dashboard: ${process.env.FRONTEND_URL || 'https://lead-estate-agency-frontend.vercel.app'}

What's included in your trial:
- Complete lead management system
- Property management tools
- Team collaboration features
- Analytics and reporting
- Mobile app access
- Email notifications

Quick Start Tips:
1. Import your leads using our CSV import feature
2. Set up your team by inviting team members
3. Customize your workflow with lead statuses and automation
4. Explore analytics to track your performance

Need help? Contact us at support@leadestate.com

Best regards,
The LeadEstate Team`;

    try {
      const mailOptions = {
        from: `${this.senderName} <${this.senderEmail}>`,
        to: userEmail,
        subject: subject,
        html: htmlContent,
        text: textContent
      };

      logger.info('ðŸ“§ Attempting to send email with options:', {
        from: mailOptions.from,
        to: mailOptions.to,
        subject: mailOptions.subject
      });

      const result = await this.transporter.sendMail(mailOptions);
      
      logger.info(`âœ… Trial welcome email sent successfully via Brevo SMTP: ${result.messageId}`);
      
      return {
        success: true,
        messageId: result.messageId,
        data: result
      };

    } catch (error) {
      logger.error('âŒ Brevo SMTP email send failed:', error.message);
      logger.error('âŒ Full error details:', error);
      
      return {
        success: false,
        error: error.message,
        details: error
      };
    }
  }

  // Test email connection
  async testConnection() {
    if (!this.transporter) {
      return { success: false, error: 'SMTP not configured' };
    }

    try {
      await this.transporter.verify();
      logger.info('âœ… Brevo SMTP connection verified successfully');
      return { success: true, message: 'SMTP connection verified' };
    } catch (error) {
      logger.error('âŒ Brevo SMTP connection failed:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new BrevoSMTPEmailService();
