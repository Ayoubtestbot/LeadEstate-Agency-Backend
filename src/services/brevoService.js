const axios = require('axios');
const logger = require('../utils/logger');
const {
  getManagerInvitationTemplate,
  getAgentInvitationTemplate,
  getSetupReminderTemplate,
  getAccountCreatedTemplate
} = require('../templates/emailTemplates');

class BrevoService {
  constructor() {
    this.apiKey = process.env.BREVO_API_KEY;
    this.apiUrl = process.env.BREVO_API_URL || 'https://api.brevo.com/v3';
    this.senderEmail = process.env.BREVO_SENDER_EMAIL;
    this.senderName = process.env.BREVO_SENDER_NAME || 'LeadEstate';
    
    if (!this.apiKey) {
      logger.warn('Brevo API key not configured. Email functionality will be disabled.');
    }

    this.client = axios.create({
      baseURL: this.apiUrl,
      headers: {
        'api-key': this.apiKey,
        'Content-Type': 'application/json'
      }
    });
  }

  async sendEmail(options) {
    if (!this.apiKey) {
      logger.warn('Brevo not configured, skipping email send');
      return { success: false, error: 'Brevo not configured' };
    }

    try {
      const emailData = {
        sender: {
          name: this.senderName,
          email: this.senderEmail
        },
        to: Array.isArray(options.to) ? options.to : [{ email: options.to }],
        subject: options.subject,
        htmlContent: options.html || options.htmlContent,
        textContent: options.text || options.textContent,
        tags: options.tags || ['leadEstate'],
        params: options.params || {}
      };

      // Add CC and BCC if provided
      if (options.cc) {
        emailData.cc = Array.isArray(options.cc) ? options.cc : [{ email: options.cc }];
      }
      if (options.bcc) {
        emailData.bcc = Array.isArray(options.bcc) ? options.bcc : [{ email: options.bcc }];
      }

      // Add attachments if provided
      if (options.attachments) {
        emailData.attachment = options.attachments.map(att => ({
          name: att.filename,
          content: att.content,
          url: att.url
        }));
      }

      const response = await this.client.post('/smtp/email', emailData);
      
      logger.info(`Email sent successfully via Brevo: ${response.data.messageId}`);
      
      return {
        success: true,
        messageId: response.data.messageId,
        data: response.data
      };

    } catch (error) {
      logger.error('Brevo email send failed:', error.response?.data || error.message);
      
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        code: error.response?.status
      };
    }
  }

  async sendWelcomeEmail(user) {
    const subject = `Welcome to ${process.env.AGENCY_NAME || 'LeadEstate'}!`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #2563eb;">Welcome to ${process.env.AGENCY_NAME || 'LeadEstate'}!</h1>
        <p>Hi ${user.first_name},</p>
        <p>Welcome to our real estate CRM platform! We're excited to have you on board.</p>
        <p>Your account has been created with the following details:</p>
        <ul>
          <li><strong>Email:</strong> ${user.email}</li>
          <li><strong>Role:</strong> ${user.role}</li>
        </ul>
        <p>You can now log in to your dashboard and start managing your leads and properties.</p>
        <div style="margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/login" 
             style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            Login to Dashboard
          </a>
        </div>
        <p>If you have any questions, feel free to reach out to our support team.</p>
        <p>Best regards,<br>The ${process.env.AGENCY_NAME || 'LeadEstate'} Team</p>
      </div>
    `;

    return this.sendEmail({
      to: user.email,
      subject,
      html,
      tags: ['welcome', 'user-onboarding']
    });
  }

  async sendLeadNotification(lead, assignedUser) {
    const subject = `New Lead Assigned: ${lead.getFullName()}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #2563eb;">New Lead Assigned</h1>
        <p>Hi ${assignedUser.first_name},</p>
        <p>A new lead has been assigned to you:</p>
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">${lead.getFullName()}</h3>
          <p><strong>Email:</strong> ${lead.email || 'Not provided'}</p>
          <p><strong>Phone:</strong> ${lead.phone || 'Not provided'}</p>
          <p><strong>City:</strong> ${lead.city || 'Not provided'}</p>
          <p><strong>Source:</strong> ${lead.source}</p>
          <p><strong>Status:</strong> ${lead.status}</p>
          ${lead.notes ? `<p><strong>Notes:</strong> ${lead.notes}</p>` : ''}
        </div>
        <div style="margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/leads" 
             style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            View Lead
          </a>
        </div>
        <p>Please follow up with this lead as soon as possible.</p>
        <p>Best regards,<br>The ${process.env.AGENCY_NAME || 'LeadEstate'} Team</p>
      </div>
    `;

    return this.sendEmail({
      to: assignedUser.email,
      subject,
      html,
      tags: ['lead-notification', 'assignment']
    });
  }

  async sendFollowUpReminder(followUp, user) {
    const subject = `Follow-up Reminder: ${followUp.lead.getFullName()}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #f59e0b;">Follow-up Reminder</h1>
        <p>Hi ${user.first_name},</p>
        <p>This is a reminder for your scheduled follow-up:</p>
        <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">${followUp.lead.getFullName()}</h3>
          <p><strong>Type:</strong> ${followUp.type}</p>
          <p><strong>Due:</strong> ${new Date(followUp.due_date).toLocaleString()}</p>
          <p><strong>Priority:</strong> ${followUp.priority}</p>
          ${followUp.description ? `<p><strong>Description:</strong> ${followUp.description}</p>` : ''}
        </div>
        <div style="margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/follow-up" 
             style="background-color: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            View Follow-up
          </a>
        </div>
        <p>Don't forget to complete this follow-up task!</p>
        <p>Best regards,<br>The ${process.env.AGENCY_NAME || 'LeadEstate'} Team</p>
      </div>
    `;

    return this.sendEmail({
      to: user.email,
      subject,
      html,
      tags: ['follow-up', 'reminder']
    });
  }

  async sendPropertyAlert(properties, lead) {
    const subject = `New Properties Matching Your Criteria`;
    const propertiesHtml = properties.map(property => `
      <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin: 10px 0;">
        <h4 style="margin-top: 0;">${property.title}</h4>
        <p><strong>Location:</strong> ${property.location}</p>
        <p><strong>Price:</strong> $${property.price.toLocaleString()}</p>
        <p><strong>Type:</strong> ${property.type}</p>
        <p><strong>Bedrooms:</strong> ${property.bedrooms} | <strong>Bathrooms:</strong> ${property.bathrooms}</p>
        <p><strong>Area:</strong> ${property.area} sq ft</p>
        ${property.description ? `<p>${property.description}</p>` : ''}
      </div>
    `).join('');

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #10b981;">New Properties Available</h1>
        <p>Hi ${lead.getFullName()},</p>
        <p>We found ${properties.length} new propert${properties.length === 1 ? 'y' : 'ies'} that match your criteria:</p>
        ${propertiesHtml}
        <div style="margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/properties" 
             style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            View All Properties
          </a>
        </div>
        <p>If you're interested in any of these properties or would like to schedule a viewing, please contact us.</p>
        <p>Best regards,<br>The ${process.env.AGENCY_NAME || 'LeadEstate'} Team</p>
      </div>
    `;

    return this.sendEmail({
      to: lead.email,
      subject,
      html,
      tags: ['property-alert', 'lead-engagement']
    });
  }

  async sendPasswordReset(user, resetToken) {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    const subject = 'Password Reset Request';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #dc2626;">Password Reset Request</h1>
        <p>Hi ${user.first_name},</p>
        <p>You requested a password reset for your ${process.env.AGENCY_NAME || 'LeadEstate'} account.</p>
        <p>Click the button below to reset your password:</p>
        <div style="margin: 30px 0;">
          <a href="${resetUrl}" 
             style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            Reset Password
          </a>
        </div>
        <p>This link will expire in 1 hour for security reasons.</p>
        <p>If you didn't request this password reset, please ignore this email.</p>
        <p>Best regards,<br>The ${process.env.AGENCY_NAME || 'LeadEstate'} Team</p>
      </div>
    `;

    return this.sendEmail({
      to: user.email,
      subject,
      html,
      tags: ['password-reset', 'security']
    });
  }

  // Enhanced Manager Invitation Email
  async sendManagerInvitation(data) {
    const {
      managerEmail,
      managerName,
      agencyName,
      invitedBy,
      setupLink,
      expiresIn = '48 hours'
    } = data;

    const subject = `🏢 You're invited to manage ${agencyName} on LeadEstate!`;
    const html = getManagerInvitationTemplate({
      managerName,
      agencyName,
      invitedBy,
      setupLink,
      expiresIn
    });

    return this.sendEmail({
      to: managerEmail,
      subject,
      html,
      tags: ['manager-invitation', 'onboarding', 'high-priority']
    });
  }

  // Enhanced Agent Invitation Email
  async sendAgentInvitation(data) {
    const {
      agentEmail,
      agentName,
      agencyName,
      managerName,
      role,
      setupLink,
      expiresIn = '7 days',
      agencyInfo = {}
    } = data;

    const roleDisplayName = role === 'super_agent' ? 'Super Agent' : 'Agent';
    const subject = `🎯 Join ${agencyName} as a ${roleDisplayName} - LeadEstate Invitation`;

    const html = getAgentInvitationTemplate({
      agentName,
      agencyName,
      managerName,
      role,
      setupLink,
      expiresIn,
      agencyInfo
    });

    return this.sendEmail({
      to: agentEmail,
      subject,
      html,
      tags: ['agent-invitation', 'onboarding', role]
    });
  }

  // Account Setup Reminder Email
  async sendSetupReminder(data) {
    const {
      userEmail,
      userName,
      role,
      setupLink,
      expiresIn,
      agencyName
    } = data;

    const subject = `⏰ Reminder: Complete your ${agencyName} account setup`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0;">⏰ Account Setup Reminder</h1>
        </div>

        <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Hi <strong>${userName}</strong>,</p>

          <p>We noticed you haven't completed your account setup for <strong>${agencyName}</strong> yet.</p>

          <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
            <p style="margin: 0;"><strong>⚠️ Your invitation expires in ${expiresIn}!</strong></p>
            <p style="margin: 10px 0 0 0;">Don't miss this opportunity to join the team.</p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${setupLink}"
               style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
              Complete Account Setup
            </a>
          </div>

          <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>

          <p>Best regards,<br>The LeadEstate Team</p>
        </div>
      </div>
    `;

    return this.sendEmail({
      to: userEmail,
      subject,
      html,
      tags: ['setup-reminder', 'follow-up']
    });
  }

  // Account Successfully Created Email
  async sendAccountCreatedConfirmation(data) {
    const {
      userEmail,
      userName,
      role,
      agencyName,
      loginUrl,
      managerName
    } = data;

    const subject = `✅ Welcome to ${agencyName}! Your account is ready`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0;">🎉 Account Created Successfully!</h1>
        </div>

        <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Hi <strong>${userName}</strong>,</p>

          <p>Congratulations! Your account for <strong>${agencyName}</strong> has been successfully created.</p>

          <div style="background-color: #d1fae5; border-left: 4px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
            <h3 style="margin-top: 0; color: #059669;">🚀 You're all set!</h3>
            <p><strong>Agency:</strong> ${agencyName}</p>
            <p><strong>Role:</strong> ${role}</p>
            ${managerName ? `<p><strong>Manager:</strong> ${managerName}</p>` : ''}
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${loginUrl}"
               style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
              Access Your Dashboard
            </a>
          </div>

          <h3>Next Steps:</h3>
          <ul>
            <li>📊 Explore your dashboard and familiarize yourself with the features</li>
            <li>👤 Complete your profile information</li>
            <li>🏠 Start managing leads and properties</li>
            <li>📱 Download our mobile app for on-the-go access</li>
          </ul>

          <p>If you need any help getting started, our support team is here to assist you.</p>

          <p>Welcome to the team!</p>

          <p>Best regards,<br>The LeadEstate Team</p>
        </div>
      </div>
    `;

    return this.sendEmail({
      to: userEmail,
      subject,
      html,
      tags: ['account-created', 'welcome', 'success']
    });
  }

  // Enhanced Manager Invitation Email
  async sendManagerInvitation(data) {
    const {
      managerEmail,
      managerName,
      agencyName,
      invitedBy,
      setupLink,
      expiresIn = '48 hours'
    } = data;

    const subject = `🏢 You're invited to manage ${agencyName} on LeadEstate!`;
    const html = getManagerInvitationTemplate({
      managerName,
      agencyName,
      invitedBy,
      setupLink,
      expiresIn
    });

    return this.sendEmail({
      to: managerEmail,
      subject,
      html,
      tags: ['manager-invitation', 'onboarding', 'high-priority']
    });
  }

  // Enhanced Agent Invitation Email
  async sendAgentInvitation(data) {
    const {
      agentEmail,
      agentName,
      agencyName,
      managerName,
      role,
      setupLink,
      expiresIn = '7 days',
      agencyInfo = {}
    } = data;

    const roleDisplayName = role === 'super_agent' ? 'Super Agent' : 'Agent';
    const subject = `🎯 Join ${agencyName} as a ${roleDisplayName} - LeadEstate Invitation`;

    const html = getAgentInvitationTemplate({
      agentName,
      agencyName,
      managerName,
      role,
      setupLink,
      expiresIn,
      agencyInfo
    });

    return this.sendEmail({
      to: agentEmail,
      subject,
      html,
      tags: ['agent-invitation', 'onboarding', role]
    });
  }

  // Setup Reminder Email
  async sendSetupReminder(data) {
    const {
      userEmail,
      userName,
      role,
      setupLink,
      expiresIn,
      agencyName
    } = data;

    const subject = `⏰ Reminder: Complete your ${agencyName} account setup`;
    const html = getSetupReminderTemplate({
      userName,
      role,
      setupLink,
      expiresIn,
      agencyName
    });

    return this.sendEmail({
      to: userEmail,
      subject,
      html,
      tags: ['setup-reminder', 'follow-up', 'urgent']
    });
  }

  // Account Created Confirmation Email
  async sendAccountCreatedConfirmation(data) {
    const {
      userEmail,
      userName,
      role,
      agencyName,
      loginUrl,
      managerName
    } = data;

    const subject = `✅ Welcome to ${agencyName}! Your account is ready`;
    const html = getAccountCreatedTemplate({
      userName,
      role,
      agencyName,
      loginUrl,
      managerName
    });

    return this.sendEmail({
      to: userEmail,
      subject,
      html,
      tags: ['account-created', 'welcome', 'success']
    });
  }

  async getEmailStats() {
    if (!this.apiKey) {
      return { success: false, error: 'Brevo not configured' };
    }

    try {
      const response = await this.client.get('/smtp/statistics');
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      logger.error('Failed to get Brevo email stats:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }
}

module.exports = new BrevoService();
