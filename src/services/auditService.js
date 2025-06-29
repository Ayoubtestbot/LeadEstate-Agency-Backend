// Simple audit service for single-tenant mode
// This is a placeholder that doesn't break the system

class AuditService {
  constructor() {
    console.log('AuditService initialized (single-tenant mode)');
    
    this.actionTypes = {
      USER_LOGIN: 'user_login',
      USER_LOGOUT: 'user_logout',
      AGENCY_CREATED: 'agency_created',
      DATA_EXPORT: 'data_export'
    };
  }

  // Log an audit event (placeholder)
  async log(auditData) {
    try {
      console.log('📝 Audit log (single-tenant mode):', {
        action: auditData.action,
        resourceType: auditData.resourceType,
        userId: auditData.userId,
        timestamp: new Date().toISOString()
      });
      
      return true;
    } catch (error) {
      console.error('Failed to log audit event:', error);
      return false;
    }
  }

  // Log user login (placeholder)
  async logUserLogin(userId, ipAddress, userAgent, success = true) {
    return this.log({
      userId,
      action: this.actionTypes.USER_LOGIN,
      resourceType: 'user',
      resourceId: userId,
      details: { success, loginTime: new Date().toISOString() },
      ipAddress,
      userAgent
    });
  }

  // Log user logout (placeholder)
  async logUserLogout(userId, ipAddress, userAgent) {
    return this.log({
      userId,
      action: this.actionTypes.USER_LOGOUT,
      resourceType: 'user',
      resourceId: userId,
      details: { logoutTime: new Date().toISOString() },
      ipAddress,
      userAgent
    });
  }

  // Get audit logs (placeholder)
  async getAuditLogs(filters = {}) {
    return {
      success: true,
      data: [],
      count: 0
    };
  }

  // Get audit statistics (placeholder)
  async getAuditStats() {
    return {
      success: true,
      data: {
        events: [],
        summary: {
          total_events: 0,
          unique_users: 0,
          error_count: 0,
          warning_count: 0,
          login_events: 0
        }
      }
    };
  }

  // Export audit logs (placeholder)
  async exportAuditLogs(filters = {}, format = 'json') {
    return {
      success: true,
      data: [],
      format: format
    };
  }
}

module.exports = new AuditService();
