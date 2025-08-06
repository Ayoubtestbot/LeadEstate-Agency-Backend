const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { getSubscriptionModel } = require('../models/Subscription');
const { getSubscriptionPlanModel } = require('../models/SubscriptionPlan');
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
        u.id, u.email, u.subscription_status, u.trial_end_date, u.plan_name,
        s.id as subscription_id, s.status as sub_status, s.trial_end_date as sub_trial_end, 
        s.is_trial, sp.features, sp.max_leads, sp.max_users, sp.max_properties
      FROM users u
      LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status IN ('trial', 'active')
      LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
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
    const trialEndDate = user.sub_trial_end || user.trial_end_date;
    const subscriptionStatus = user.sub_status || user.subscription_status;

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

        if (user.subscription_id) {
          await pool.query(
            'UPDATE subscriptions SET status = $1 WHERE id = $2',
            ['expired', user.subscription_id]
          );
        }

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

    // Attach subscription info to request
    req.subscription = {
      userId: user.id,
      status: subscriptionStatus,
      planName: user.plan_name,
      features: user.features || {},
      limits: {
        maxLeads: user.max_leads,
        maxUsers: user.max_users,
        maxProperties: user.max_properties
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

      const { userId, limits } = req.subscription;
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
        WHERE agency_id = (SELECT agency_id FROM users WHERE id = $1)
      `, [userId]);

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
