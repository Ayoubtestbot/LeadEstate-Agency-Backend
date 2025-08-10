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

    // Find user in database
    const [results] = await sequelize.query(
      'SELECT id, email, first_name, last_name, role, agency_id, is_active FROM users WHERE id = :userId AND is_active = true',
      {
        replacements: { userId: decoded.userId },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    if (!results) {
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

    // Attach user to request
    req.user = {
      id: results.id,
      email: results.email,
      firstName: results.first_name,
      lastName: results.last_name,
      role: results.role,
      agencyId: results.agency_id,
      isActive: results.is_active,
    };

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
