const jwt = require('jsonwebtoken');
const { getSequelize } = require('../database/connection');
const logger = require('../utils/logger');
const { HTTP_STATUS, ERROR_CODES } = require('../utils/constants');

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request
 */
const authMiddleware = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: {
          message: 'Access denied. No token provided.',
          code: ERROR_CODES.AUTHENTICATION_ERROR,
          statusCode: HTTP_STATUS.UNAUTHORIZED,
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Extract token from "Bearer TOKEN"
    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : authHeader;

    if (!token) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: {
          message: 'Access denied. Invalid token format.',
          code: ERROR_CODES.AUTHENTICATION_ERROR,
          statusCode: HTTP_STATUS.UNAUTHORIZED,
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get database connection
    const sequelize = getSequelize();

    if (!sequelize) {
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: {
          message: 'Database not available.',
          code: ERROR_CODES.INTERNAL_ERROR,
          statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Find user in database using ONLY raw SQL (unified approach)
    let results = null;

    console.log('🔍 Auth middleware - looking for user:', decoded.userId);

    try {
      const { pool } = require('../config/database');
      const userResult = await pool.query(`
        SELECT
          id, email, first_name, last_name, role, agency_id, status,
          subscription_status, trial_end_date, plan_name, phone, avatar_url,
          last_login_at, email_verified_at, created_at, updated_at
        FROM users
        WHERE id = $1 AND status = $2
      `, [decoded.userId, 'active']);

      if (userResult.rows.length > 0) {
        results = userResult.rows[0];
        console.log('✅ User found via unified SQL query');
      } else {
        console.log('❌ User not found or inactive');
      }
    } catch (sqlError) {
      console.error('❌ Database query failed:', sqlError.message);
    }

    if (!results) {
      console.log('❌ User not found with either approach');
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: {
          message: 'Access denied. User not found or inactive.',
          code: ERROR_CODES.AUTHENTICATION_ERROR,
          statusCode: HTTP_STATUS.UNAUTHORIZED,
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Attach user to request with unified format
    req.user = {
      userId: results.id,
      id: results.id,
      email: results.email,
      firstName: results.first_name,
      lastName: results.last_name,
      role: results.role,
      agencyId: results.agency_id,
      isActive: results.is_active || (results.status === 'active'),
      status: results.status,
      subscriptionStatus: results.subscription_status || decoded.subscriptionStatus,
      trialEndDate: results.trial_end_date || decoded.trialEndDate,
      planName: results.plan_name || decoded.planName
    };

    console.log('✅ Auth middleware - user attached:', {
      userId: req.user.userId,
      email: req.user.email,
      agencyId: req.user.agencyId,
      subscriptionStatus: req.user.subscriptionStatus
    });

    // Log successful authentication
    logger.debug(`User authenticated: ${req.user.email} (${req.user.role})`);

    next();
  } catch (error) {
    logger.error('Authentication error:', error);

    if (error.name === 'JsonWebTokenError') {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: {
          message: 'Access denied. Invalid token.',
          code: ERROR_CODES.AUTHENTICATION_ERROR,
          statusCode: HTTP_STATUS.UNAUTHORIZED,
        },
        timestamp: new Date().toISOString(),
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: {
          message: 'Access denied. Token expired.',
          code: ERROR_CODES.AUTHENTICATION_ERROR,
          statusCode: HTTP_STATUS.UNAUTHORIZED,
        },
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        message: 'Internal server error during authentication.',
        code: ERROR_CODES.INTERNAL_ERROR,
        statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      },
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Role-based authorization middleware
 * @param {Array} allowedRoles - Array of allowed roles
 */
const authorize = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: {
          message: 'Access denied. User not authenticated.',
          code: ERROR_CODES.AUTHENTICATION_ERROR,
          statusCode: HTTP_STATUS.UNAUTHORIZED,
        },
        timestamp: new Date().toISOString(),
      });
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
      logger.warn(`Authorization failed for user ${req.user.email}. Required roles: ${allowedRoles.join(', ')}, User role: ${req.user.role}`);
      
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        error: {
          message: 'Access denied. Insufficient permissions.',
          code: ERROR_CODES.AUTHORIZATION_ERROR,
          statusCode: HTTP_STATUS.FORBIDDEN,
        },
        timestamp: new Date().toISOString(),
      });
    }

    next();
  };
};

/**
 * Agency isolation middleware
 * Ensures users can only access data from their agency
 */
const agencyIsolation = (req, res, next) => {
  if (!req.user || !req.user.agencyId) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      error: {
        message: 'Access denied. Agency information missing.',
        code: ERROR_CODES.AUTHENTICATION_ERROR,
        statusCode: HTTP_STATUS.UNAUTHORIZED,
      },
      timestamp: new Date().toISOString(),
    });
  }

  // Add agency filter to query parameters
  req.agencyId = req.user.agencyId;
  
  next();
};

/**
 * Optional authentication middleware
 * Attaches user if token is provided, but doesn't require it
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return next();
    }

    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : authHeader;

    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const sequelize = getSequelize();
    
    const [results] = await sequelize.query(
      'SELECT id, email, first_name, last_name, role, agency_id, is_active FROM users WHERE id = :userId AND is_active = true',
      {
        replacements: { userId: decoded.userId },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    if (results) {
      req.user = {
        id: results.id,
        email: results.email,
        firstName: results.first_name,
        lastName: results.last_name,
        role: results.role,
        agencyId: results.agency_id,
        isActive: results.is_active,
      };
    }

    next();
  } catch (error) {
    // Ignore authentication errors for optional auth
    next();
  }
};

module.exports = {
  authMiddleware,
  authorize,
  agencyIsolation,
  optionalAuth,
};
