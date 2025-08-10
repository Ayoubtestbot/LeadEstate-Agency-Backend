const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Middleware to check subscription status and trial expiration
 */
const checkSubscriptionStatus = async (req, res, next) => {
  try {
    // Skip subscription check for certain routes
    const skipRoutes = ['/api/auth/', '/api/subscription/upgrade', '/api/subscription/status'];
    if (skipRoutes.some(route => req.path.startsWith(route))) {
      return next();
    }

    const authHeader = req.header('Authorization');
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
        code: 'NO_TOKEN'
      });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user's current subscription status
    const userQuery = await pool.query(`
      SELECT 
        u.id, u.email, u.subscription_status, u.trial_end_date, u.plan_name, u.agency_id
      FROM users u
      WHERE u.id = $1
    `, [decoded.userId]);

    if (userQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    const user = userQuery.rows[0];
    const trialEndDate = user.trial_end_date;
    const subscriptionStatus = user.subscription_status;

    // Check if trial has expired
    if (subscriptionStatus === 'trial' && trialEndDate) {
      const now = new Date();
      const endDate = new Date(trialEndDate);
      
      if (now > endDate) {
        // Trial expired - update status and block access
        await pool.query(
          'UPDATE users SET subscription_status = $1 WHERE id = $2',
          ['expired', user.id]
        );

        return res.status(402).json({
          success: false,
          message: 'Your free trial has expired. Please upgrade to continue using LeadEstate.',
          code: 'TRIAL_EXPIRED',
          data: {
            trialEndDate: trialEndDate,
            upgradeUrl: `${process.env.FRONTEND_URL}/upgrade`
          }
        });
      }
    }

    // Check if subscription is active
    if (!['trial', 'active'].includes(subscriptionStatus)) {
      return res.status(402).json({
        success: false,
        message: 'Your subscription is not active. Please upgrade to continue.',
        code: 'SUBSCRIPTION_INACTIVE',
        data: {
          status: subscriptionStatus,
          upgradeUrl: `${process.env.FRONTEND_URL}/upgrade`
        }
      });
    }

    // Get plan features (simplified for now)
    const planFeatures = {
      starter: {
        whatsapp: false,
        analytics: 'basic',
        branding: 'none',
        api_access: false,
        max_leads: 1000,
        max_users: 3,
        max_properties: 100
      },
      pro: {
        whatsapp: true,
        analytics: 'advanced',
        branding: 'basic',
        api_access: true,
        max_leads: 5000,
        max_users: 10,
        max_properties: 500
      },
      agency: {
        whatsapp: true,
        analytics: 'enterprise',
        branding: 'full',
        api_access: true,
        max_leads: null,
        max_users: null,
        max_properties: null
      }
    };

    const features = planFeatures[user.plan_name] || planFeatures.starter;

    // Attach subscription info to request
    req.subscription = {
      userId: user.id,
      agencyId: user.agency_id,
      status: subscriptionStatus,
      planName: user.plan_name,
      features: features,
      limits: {
        maxLeads: features.max_leads,
        maxUsers: features.max_users,
        maxProperties: features.max_properties
      },
      trialEndDate: trialEndDate,
      isActive: ['trial', 'active'].includes(subscriptionStatus)
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }

    logger.error('Subscription check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify subscription status'
    });
  }
};

/**
 * Middleware to check if user has access to a specific feature
 */
const requireFeature = (featureName) => {
  return async (req, res, next) => {
    try {
      if (!req.subscription) {
        return res.status(401).json({
          success: false,
          message: 'Subscription information not available',
          code: 'NO_SUBSCRIPTION_INFO'
        });
      }

      const { features, planName } = req.subscription;

      // Check if feature is enabled for this plan
      const hasFeature = features[featureName] === true || 
                        (typeof features[featureName] === 'string' && features[featureName] !== 'none');

      if (!hasFeature) {
        return res.status(403).json({
          success: false,
          message: `This feature requires a higher subscription plan. Current plan: ${planName}`,
          code: 'FEATURE_NOT_AVAILABLE',
          data: {
            feature: featureName,
            currentPlan: planName,
            upgradeUrl: `${process.env.FRONTEND_URL}/upgrade`
          }
        });
      }

      next();
    } catch (error) {
      logger.error('Feature access check error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to verify feature access'
      });
    }
  };
};

/**
 * Middleware to check usage limits (leads, users, properties)
 */
const checkUsageLimit = (resourceType) => {
  return async (req, res, next) => {
    try {
      if (!req.subscription) {
        return res.status(401).json({
          success: false,
          message: 'Subscription information not available'
        });
      }

      const { agencyId, limits } = req.subscription;
      const limitKey = `max${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)}`;
      const maxAllowed = limits[limitKey];

      // If limit is null, it means unlimited
      if (maxAllowed === null) {
        return next();
      }

      // Get current usage count
      let currentCount = 0;
      const tableMap = {
        'leads': 'leads',
        'users': 'users',
        'properties': 'properties'
      };

      const table = tableMap[resourceType];
      if (!table) {
        return res.status(400).json({
          success: false,
          message: 'Invalid resource type'
        });
      }

      // Count current resources for this user's agency
      const countQuery = await pool.query(`
        SELECT COUNT(*) as count 
        FROM ${table} 
        WHERE agency_id = $1
      `, [agencyId]);

      currentCount = parseInt(countQuery.rows[0].count);

      if (currentCount >= maxAllowed) {
        return res.status(403).json({
          success: false,
          message: `You have reached your ${resourceType} limit (${maxAllowed}). Please upgrade your plan.`,
          code: 'USAGE_LIMIT_EXCEEDED',
          data: {
            resourceType,
            currentCount,
            maxAllowed,
            upgradeUrl: `${process.env.FRONTEND_URL}/upgrade`
          }
        });
      }

      // Attach usage info to request
      req.usage = req.usage || {};
      req.usage[resourceType] = {
        current: currentCount,
        max: maxAllowed,
        remaining: maxAllowed - currentCount
      };

      next();
    } catch (error) {
      logger.error('Usage limit check error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to verify usage limits'
      });
    }
  };
};

/**
 * Middleware to add trial countdown info to responses
 */
const addTrialInfo = async (req, res, next) => {
  try {
    if (req.subscription && req.subscription.status === 'trial' && req.subscription.trialEndDate) {
      const now = new Date();
      const endDate = new Date(req.subscription.trialEndDate);
      const diffTime = endDate - now;
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      req.trialInfo = {
        daysRemaining: Math.max(0, daysRemaining),
        endDate: req.subscription.trialEndDate,
        isExpiringSoon: daysRemaining <= 3,
        upgradeUrl: `${process.env.FRONTEND_URL}/upgrade`
      };
    }

    next();
  } catch (error) {
    logger.error('Trial info error:', error);
    next(); // Don't block request for trial info errors
  }
};

module.exports = {
  checkSubscriptionStatus,
  requireFeature,
  checkUsageLimit,
  addTrialInfo
};
