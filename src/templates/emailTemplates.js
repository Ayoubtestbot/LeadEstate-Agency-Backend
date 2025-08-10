// Enhanced Email Templates for LeadEstate CRM
// Professional, role-based email templates for user invitations and onboarding

const getBaseTemplate = (content, title = 'LeadEstate') => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .header { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 40px 30px; text-align: center; }
        .logo { color: #ffffff; font-size: 28px; font-weight: bold; margin: 0; }
        .content { padding: 40px 30px; }
        .button { display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3); }
        .button:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(37, 99, 235, 0.4); }
        .info-box { background-color: #f1f5f9; border-left: 4px solid #2563eb; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0; }
        .footer { background-color: #f8fafc; padding: 30px; text-align: center; color: #64748b; font-size: 14px; }
        .divider { height: 1px; background-color: #e2e8f0; margin: 30px 0; }
        .highlight { color: #2563eb; font-weight: 600; }
        .warning { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 0 6px 6px 0; }
        .success { background-color: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 0 6px 6px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="logo">🏠 LeadEstate</h1>
        </div>
        <div class="content">
            ${content}
        </div>
        <div class="footer">
            <p>© 2024 LeadEstate. All rights reserved.</p>
            <p>This email was sent to you because you were invited to join our platform.</p>
            <p>If you have any questions, contact our support team at <a href="mailto:support@leadestate.com">support@leadestate.com</a></p>
        </div>
    </div>
</body>
</html>
  `;
};

// Manager Invitation Template
const getManagerInvitationTemplate = (data) => {
  const { managerName, agencyName, invitedBy, setupLink, expiresIn = '48 hours' } = data;
  
  const content = `
    <h2 style="color: #1e293b; margin-bottom: 10px;">Welcome to LeadEstate! 🎉</h2>
    <p style="color: #64748b; font-size: 16px; margin-bottom: 30px;">You've been selected to manage a new real estate agency</p>
    
    <p>Hi <span class="highlight">${managerName}</span>,</p>
    
    <p>Congratulations! You've been invited by <strong>${invitedBy}</strong> to become the Manager of <strong>${agencyName}</strong> on the LeadEstate platform.</p>
    
    <div class="success">
        <h3 style="margin-top: 0; color: #059669;">🏢 Your New Agency</h3>
        <p><strong>Agency Name:</strong> ${agencyName}</p>
        <p><strong>Your Role:</strong> Agency Manager</p>
        <p><strong>Invited By:</strong> ${invitedBy}</p>
    </div>
    
    <h3 style="color: #1e293b;">As an Agency Manager, you'll be able to:</h3>
    <ul style="color: #475569; line-height: 1.8;">
        <li>📊 <strong>Manage your entire agency</strong> - View all leads, properties, and performance metrics</li>
        <li>👥 <strong>Build your team</strong> - Invite and manage Super Agents and Agents</li>
        <li>🎯 <strong>Track performance</strong> - Monitor team productivity and conversion rates</li>
        <li>⚙️ <strong>Configure settings</strong> - Customize your agency's workflow and preferences</li>
        <li>📈 <strong>Access analytics</strong> - Get detailed insights into your business performance</li>
    </ul>
    
    <div class="info-box">
        <h3 style="margin-top: 0; color: #2563eb;">🚀 Next Steps</h3>
        <ol style="margin: 0; padding-left: 20px;">
            <li>Click the button below to set up your account</li>
            <li>Create your secure password</li>
            <li>Complete your agency profile</li>
            <li>Start inviting your team members</li>
        </ol>
    </div>
    
    <div style="text-align: center; margin: 40px 0;">
        <a href="${setupLink}" class="button">Set Up My Agency Account</a>
    </div>
    
    <div class="warning">
        <p style="margin: 0;"><strong>⏰ Important:</strong> This invitation link will expire in <strong>${expiresIn}</strong>. Please set up your account as soon as possible.</p>
    </div>
    
    <div class="divider"></div>
    
    <h3 style="color: #1e293b;">Need Help Getting Started?</h3>
    <p>Our team is here to help you succeed:</p>
    <ul style="color: #475569;">
        <li>📚 <a href="#" style="color: #2563eb;">View our Manager's Guide</a></li>
        <li>🎥 <a href="#" style="color: #2563eb;">Watch setup tutorials</a></li>
        <li>💬 <a href="mailto:support@leadestate.com" style="color: #2563eb;">Contact our support team</a></li>
    </ul>
    
    <p style="margin-top: 30px;">We're excited to see your agency thrive on LeadEstate!</p>
    
    <p>Best regards,<br>
    <strong>The LeadEstate Team</strong></p>
  `;
  
  return getBaseTemplate(content, `Welcome to LeadEstate - ${agencyName} Manager`);
};

// Agent Invitation Template (Super Agent & Regular Agent)
const getAgentInvitationTemplate = (data) => {
  const { 
    agentName, 
    agencyName, 
    managerName, 
    role, 
    setupLink, 
    expiresIn = '7 days',
    agencyInfo = {}
  } = data;
  
  const roleDisplayName = role === 'super_agent' ? 'Super Agent' : 'Agent';
  const roleEmoji = role === 'super_agent' ? '⭐' : '👤';
  
  const content = `
    <h2 style="color: #1e293b; margin-bottom: 10px;">You're Invited to Join ${agencyName}! ${roleEmoji}</h2>
    <p style="color: #64748b; font-size: 16px; margin-bottom: 30px;">Start your real estate journey with our powerful CRM platform</p>
    
    <p>Hi <span class="highlight">${agentName}</span>,</p>
    
    <p>Great news! <strong>${managerName}</strong> has invited you to join <strong>${agencyName}</strong> as a <strong>${roleDisplayName}</strong> on the LeadEstate platform.</p>
    
    <div class="info-box">
        <h3 style="margin-top: 0; color: #2563eb;">🏢 Agency Information</h3>
        <p><strong>Agency:</strong> ${agencyName}</p>
        <p><strong>Your Role:</strong> ${roleDisplayName}</p>
        <p><strong>Manager:</strong> ${managerName}</p>
        ${agencyInfo.location ? `<p><strong>Location:</strong> ${agencyInfo.location}</p>` : ''}
        ${agencyInfo.specialization ? `<p><strong>Specialization:</strong> ${agencyInfo.specialization}</p>` : ''}
    </div>
    
    <h3 style="color: #1e293b;">As a ${roleDisplayName}, you'll have access to:</h3>
    <ul style="color: #475569; line-height: 1.8;">
        ${role === 'super_agent' ? `
        <li>👥 <strong>Team Management</strong> - Supervise and mentor regular agents</li>
        <li>📊 <strong>Advanced Analytics</strong> - Access detailed performance reports</li>
        <li>🎯 <strong>Lead Distribution</strong> - Assign leads to team members</li>
        ` : ''}
        <li>🏠 <strong>Lead Management</strong> - Track and nurture your prospects</li>
        <li>🏘️ <strong>Property Database</strong> - Access your agency's property listings</li>
        <li>📱 <strong>Mobile CRM</strong> - Manage your business on the go</li>
        <li>💬 <strong>Communication Tools</strong> - WhatsApp integration and email automation</li>
        <li>📈 <strong>Performance Tracking</strong> - Monitor your sales and conversion rates</li>
    </ul>
    
    <div class="success">
        <h3 style="margin-top: 0; color: #059669;">🎯 Ready to Get Started?</h3>
        <p>Setting up your account takes less than 5 minutes:</p>
        <ol style="margin: 0; padding-left: 20px;">
            <li>Click the setup button below</li>
            <li>Create your secure password</li>
            <li>Complete your profile</li>
            <li>Start managing leads!</li>
        </ol>
    </div>
    
    <div style="text-align: center; margin: 40px 0;">
        <a href="${setupLink}" class="button">Set Up My Account</a>
    </div>
    
    <div class="warning">
        <p style="margin: 0;"><strong>⏰ Important:</strong> This invitation expires in <strong>${expiresIn}</strong>. Don't miss out on this opportunity!</p>
    </div>
    
    <div class="divider"></div>
    
    <h3 style="color: #1e293b;">Questions? We're Here to Help!</h3>
    <p>Get started quickly with these resources:</p>
    <ul style="color: #475569;">
        <li>📱 <a href="#" style="color: #2563eb;">Download our mobile app</a></li>
        <li>🎥 <a href="#" style="color: #2563eb;">Watch quick start videos</a></li>
        <li>📞 <a href="tel:+1234567890" style="color: #2563eb;">Call our support team</a></li>
    </ul>
    
    <p style="margin-top: 30px;">Welcome to the team! We can't wait to see your success.</p>
    
    <p>Best regards,<br>
    <strong>${managerName}</strong><br>
    <em>Manager, ${agencyName}</em></p>
  `;
  
  return getBaseTemplate(content, `Welcome to ${agencyName} - ${roleDisplayName} Invitation`);
};

// Setup Reminder Template
const getSetupReminderTemplate = (data) => {
  const { userName, role, setupLink, expiresIn, agencyName } = data;

  const content = `
    <h2 style="color: #f59e0b; margin-bottom: 10px;">⏰ Don't Miss Out!</h2>
    <p style="color: #64748b; font-size: 16px; margin-bottom: 30px;">Your account setup is almost complete</p>

    <p>Hi <span class="highlight">${userName}</span>,</p>

    <p>We noticed you haven't completed your account setup for <strong>${agencyName}</strong> yet.</p>

    <div class="warning">
      <h3 style="margin-top: 0; color: #d97706;">⚠️ Time is Running Out!</h3>
      <p>Your invitation expires in <strong>${expiresIn}</strong>. Don't miss this opportunity to join the team!</p>
    </div>

    <p>Setting up your account only takes a few minutes:</p>
    <ol style="color: #475569; line-height: 1.8;">
      <li>Click the setup button below</li>
      <li>Create your secure password</li>
      <li>Complete your profile</li>
      <li>Start using the platform!</li>
    </ol>

    <div style="text-align: center; margin: 40px 0;">
      <a href="${setupLink}" class="button">Complete My Setup Now</a>
    </div>

    <p>If you're having trouble or have questions, our support team is ready to help you get started.</p>

    <p>Best regards,<br>
    <strong>The LeadEstate Team</strong></p>
  `;

  return getBaseTemplate(content, `Setup Reminder - ${agencyName}`);
};

// Account Created Confirmation Template
const getAccountCreatedTemplate = (data) => {
  const { userName, role, agencyName, loginUrl, managerName } = data;

  const content = `
    <h2 style="color: #10b981; margin-bottom: 10px;">🎉 Welcome to the Team!</h2>
    <p style="color: #64748b; font-size: 16px; margin-bottom: 30px;">Your account is ready and waiting for you</p>

    <p>Hi <span class="highlight">${userName}</span>,</p>

    <p>Congratulations! Your account for <strong>${agencyName}</strong> has been successfully created and you're now part of the team.</p>

    <div class="success">
      <h3 style="margin-top: 0; color: #059669;">✅ Account Details</h3>
      <p><strong>Agency:</strong> ${agencyName}</p>
      <p><strong>Your Role:</strong> ${role}</p>
      ${managerName ? `<p><strong>Manager:</strong> ${managerName}</p>` : ''}
      <p><strong>Status:</strong> Active and Ready</p>
    </div>

    <div style="text-align: center; margin: 40px 0;">
      <a href="${loginUrl}" class="button">Access My Dashboard</a>
    </div>

    <h3 style="color: #1e293b;">🚀 What's Next?</h3>
    <ul style="color: #475569; line-height: 1.8;">
      <li>📊 <strong>Explore your dashboard</strong> - Get familiar with all the features</li>
      <li>👤 <strong>Complete your profile</strong> - Add your photo and contact details</li>
      <li>🏠 <strong>Start managing leads</strong> - Begin tracking your prospects</li>
      <li>📱 <strong>Download our mobile app</strong> - Manage your business on the go</li>
      <li>🎯 <strong>Set your goals</strong> - Track your performance and achievements</li>
    </ul>

    <div class="info-box">
      <h3 style="margin-top: 0; color: #2563eb;">💡 Pro Tips for Success</h3>
      <ul style="margin: 0; padding-left: 20px;">
        <li>Check your dashboard daily for new leads and updates</li>
        <li>Use the mobile app to respond quickly to prospects</li>
        <li>Keep your property knowledge up to date</li>
        <li>Leverage the analytics to improve your performance</li>
      </ul>
    </div>

    <p>If you need any assistance getting started, our support team is here to help you succeed.</p>

    <p>Welcome aboard!</p>

    <p>Best regards,<br>
    <strong>The LeadEstate Team</strong></p>
  `;

  return getBaseTemplate(content, `Welcome to ${agencyName}!`);
};

module.exports = {
  getManagerInvitationTemplate,
  getAgentInvitationTemplate,
  getSetupReminderTemplate,
  getAccountCreatedTemplate,
  getBaseTemplate
};
