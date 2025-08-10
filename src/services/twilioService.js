const axios = require('axios');
const logger = require('../utils/logger');

class TwilioService {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;
    this.apiUrl = process.env.TWILIO_API_URL || 'https://api.twilio.com/2010-04-01';
    
    if (!this.accountSid || !this.authToken) {
      logger.warn('Twilio credentials not configured. WhatsApp functionality will be disabled.');
    }

    // Create basic auth header
    this.authHeader = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
  }

  async sendWhatsAppMessage(options) {
    if (!this.accountSid || !this.authToken) {
      logger.warn('Twilio not configured, skipping WhatsApp send');
      return { success: false, error: 'Twilio not configured' };
    }

    try {
      const messageData = {
        From: `whatsapp:${this.whatsappNumber}`,
        To: `whatsapp:${options.to}`,
        Body: options.message
      };

      // Add media if provided
      if (options.mediaUrl) {
        messageData.MediaUrl = options.mediaUrl;
      }

      const response = await axios.post(
        `${this.apiUrl}/Accounts/${this.accountSid}/Messages.json`,
        new URLSearchParams(messageData),
        {
          headers: {
            'Authorization': `Basic ${this.authHeader}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      logger.info(`WhatsApp message sent successfully: ${response.data.sid}`);
      
      return {
        success: true,
        messageSid: response.data.sid,
        status: response.data.status,
        data: response.data
      };

    } catch (error) {
      logger.error('Twilio WhatsApp send failed:', error.response?.data || error.message);
      
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        code: error.response?.status
      };
    }
  }

  async sendWelcomeMessage(lead) {
    const message = `
🏠 Welcome to ${process.env.AGENCY_NAME || 'LeadEstate'}!

Hi ${lead.getFullName()},

Thank you for your interest in our real estate services. We're excited to help you find your perfect property!

Our team will be in touch with you shortly to discuss your requirements.

If you have any immediate questions, feel free to reply to this message.

Best regards,
${process.env.AGENCY_NAME || 'LeadEstate'} Team
    `.trim();

    return this.sendWhatsAppMessage({
      to: lead.whatsapp || lead.phone,
      message
    });
  }

  async sendPropertyDetails(properties, lead, customMessage = '') {
    let message = customMessage ? `${customMessage}\n\n` : '';
    
    message += `🏠 *Property Details for ${lead.getFullName()}*\n\n`;
    
    properties.forEach((property, index) => {
      message += `*${index + 1}. ${property.title}*\n`;
      message += `📍 Location: ${property.location}\n`;
      message += `💰 Price: $${property.price.toLocaleString()}\n`;
      message += `🏠 Type: ${property.type}\n`;
      message += `🛏️ Bedrooms: ${property.bedrooms}\n`;
      message += `🚿 Bathrooms: ${property.bathrooms}\n`;
      message += `📐 Area: ${property.area} sq ft\n`;
      
      if (property.description) {
        message += `📝 ${property.description}\n`;
      }
      
      message += '\n---\n\n';
    });

    message += `For more details or to schedule a viewing, please contact us!\n\n`;
    message += `Best regards,\n${process.env.AGENCY_NAME || 'LeadEstate'} Team`;

    return this.sendWhatsAppMessage({
      to: lead.whatsapp || lead.phone,
      message
    });
  }

  async sendFollowUpMessage(followUp, lead) {
    const message = `
🔔 *Follow-up Reminder*

Hi ${lead.getFullName()},

This is a friendly reminder about our upcoming ${followUp.type}.

📅 Scheduled: ${new Date(followUp.due_date).toLocaleString()}
${followUp.description ? `📝 Details: ${followUp.description}` : ''}

We look forward to speaking with you!

Best regards,
${process.env.AGENCY_NAME || 'LeadEstate'} Team
    `.trim();

    return this.sendWhatsAppMessage({
      to: lead.whatsapp || lead.phone,
      message
    });
  }

  async sendAppointmentConfirmation(appointment, lead) {
    const message = `
✅ *Appointment Confirmed*

Hi ${lead.getFullName()},

Your appointment has been confirmed:

📅 Date: ${new Date(appointment.date).toLocaleDateString()}
🕐 Time: ${new Date(appointment.date).toLocaleTimeString()}
📍 Location: ${appointment.location || 'To be confirmed'}
👤 Agent: ${appointment.agent_name}

${appointment.notes ? `📝 Notes: ${appointment.notes}` : ''}

If you need to reschedule, please contact us as soon as possible.

Best regards,
${process.env.AGENCY_NAME || 'LeadEstate'} Team
    `.trim();

    return this.sendWhatsAppMessage({
      to: lead.whatsapp || lead.phone,
      message
    });
  }

  async sendPropertyAlert(properties, lead) {
    const message = `
🚨 *New Properties Alert*

Hi ${lead.getFullName()},

Great news! We found ${properties.length} new propert${properties.length === 1 ? 'y' : 'ies'} that match your criteria:

${properties.map((property, index) => `
${index + 1}. *${property.title}*
📍 ${property.location}
💰 $${property.price.toLocaleString()}
🏠 ${property.bedrooms} bed, ${property.bathrooms} bath
`).join('\n')}

Would you like more details about any of these properties?

Best regards,
${process.env.AGENCY_NAME || 'LeadEstate'} Team
    `.trim();

    return this.sendWhatsAppMessage({
      to: lead.whatsapp || lead.phone,
      message
    });
  }

  async sendCustomMessage(lead, message, mediaUrl = null) {
    return this.sendWhatsAppMessage({
      to: lead.whatsapp || lead.phone,
      message,
      mediaUrl
    });
  }

  async getMessageStatus(messageSid) {
    if (!this.accountSid || !this.authToken) {
      return { success: false, error: 'Twilio not configured' };
    }

    try {
      const response = await axios.get(
        `${this.apiUrl}/Accounts/${this.accountSid}/Messages/${messageSid}.json`,
        {
          headers: {
            'Authorization': `Basic ${this.authHeader}`
          }
        }
      );

      return {
        success: true,
        status: response.data.status,
        data: response.data
      };

    } catch (error) {
      logger.error('Failed to get Twilio message status:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  async getWhatsAppStats() {
    if (!this.accountSid || !this.authToken) {
      return { success: false, error: 'Twilio not configured' };
    }

    try {
      // Get messages from the last 30 days
      const dateFilter = new Date();
      dateFilter.setDate(dateFilter.getDate() - 30);
      
      const response = await axios.get(
        `${this.apiUrl}/Accounts/${this.accountSid}/Messages.json`,
        {
          headers: {
            'Authorization': `Basic ${this.authHeader}`
          },
          params: {
            From: `whatsapp:${this.whatsappNumber}`,
            DateSent: dateFilter.toISOString().split('T')[0]
          }
        }
      );

      const messages = response.data.messages;
      const stats = {
        total: messages.length,
        sent: messages.filter(m => m.status === 'sent').length,
        delivered: messages.filter(m => m.status === 'delivered').length,
        read: messages.filter(m => m.status === 'read').length,
        failed: messages.filter(m => m.status === 'failed').length
      };

      return {
        success: true,
        data: stats
      };

    } catch (error) {
      logger.error('Failed to get Twilio WhatsApp stats:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  formatPhoneNumber(phone) {
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    
    // Add + if not present
    if (!cleaned.startsWith('+')) {
      return `+${cleaned}`;
    }
    
    return cleaned;
  }

  validateWhatsAppNumber(phone) {
    const formatted = this.formatPhoneNumber(phone);
    // Basic validation for international phone numbers
    return /^\+[1-9]\d{1,14}$/.test(formatted);
  }
}

module.exports = new TwilioService();
