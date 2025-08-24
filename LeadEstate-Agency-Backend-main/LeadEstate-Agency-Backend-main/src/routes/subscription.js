const express = require('express');
const { body, validationResult } = require('express-validator');
const subscriptionService = require('../services/subscriptionService');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Get all available subscription plans
 */
router.get('/plans', async (req, res) => {
  try {
    const plans = subscriptionService.getAllPlans();
    \n    res.json({
      success: true,
      data: plans
    });
  } catch (error) {
    logger.error('Error getting subscription plans:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get subscription plans'
    });
  }
});

/**
 * Get a specific plan by ID
 */
router.get('/plans/:planId', async (req, res) => {
  try {
    const { planId } = req.params;
    const plan = subscriptionService.getPlan(planId);
    
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }
    
    res.json({
      success: true,
      data: plan
    });
  } catch (error) {
    logger.error('Error getting subscription plan:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get subscription plan'
    });
  }
});

/**
 * Get current user's subscription
 */
router.get('/current', async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware
    
    const subscription = await subscriptionService.getUserSubscription(userId);
    
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found'
      });
    }
    
    // Add days remaining
    const daysRemaining = await subscriptionService.getDaysRemaining(userId);
    
    res.json({
      success: true,
      data: {
        ...subscription.dataValues,
        daysRemaining
      }
    });
  } catch (error) {
    logger.error('Error getting current subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get current subscription'
    });
  }
});

/**
 * Get subscription status (backward compatibility)
 */
router.get('/status', async (req, res) => {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'No authorization token provided'
      });
    }

    const jwt = require('jsonwebtoken');
    const { pool } = require('../config/database');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user's subscription details
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
        code: 'NO_USER'
      });
    }

    const user = userQuery.rows[0];
    
    // Calculate trial info if applicable
    let trialInfo = null;
    if (user.subscription_status === 'trial' && user.trial_end_date) {
      const now = new Date();
      const endDate = new Date(user.trial_end_date);
      const diffTime = endDate - now;
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      trialInfo = {
        daysRemaining: Math.max(0, daysRemaining),
        endDate: user.trial_end_date,
        isExpired: daysRemaining <= 0,
        isExpiringSoon: daysRemaining <= 3
      };
    }

    // Get plan features (simplified)
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

    // Get current usage
    const usageQuery = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM leads WHERE agency_id = $1) as leads_count,
        (SELECT COUNT(*) FROM users WHERE agency_id = $1 AND status = 'active') as users_count,
        (SELECT COUNT(*) FROM properties WHERE agency_id = $1) as properties_count
    `, [user.agency_id]);

    const usage = usageQuery.rows[0];

    res.json({
      success: true,
      data: {
        subscription: {
          status: user.subscription_status,
          planName: user.plan_name,
          displayName: user.plan_name.charAt(0).toUpperCase() + user.plan_name.slice(1) + ' Plan'
        },
        plan: {
          features: features,
          limits: {
            maxLeads: features.max_leads,
            maxUsers: features.max_users,
            maxProperties: features.max_properties
          }
        },
        usage: {
          leads: parseInt(usage.leads_count),
          users: parseInt(usage.users_count),
          properties: parseInt(usage.properties_count)
        },
        trial: trialInfo
      }
    });

  } catch (error) {
    logger.error('Subscription status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get subscription status'
    });
  }
});

/**
 * Create a new subscription
 */
router.post('/create',
  [
    body('planId')
      .isString()
      .withMessage('Plan ID is required'),
    body('paymentMethod')
      .optional()
      .isIn(['trial', 'stripe', 'paypal'])
      .withMessage('Invalid payment method')
  ],
  async (req, res) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const userId = req.user.id;
      const agencyId = req.user.agency_id;
      const { planId, paymentMethod = 'trial' } = req.body;

      const subscription = await subscriptionService.createSubscription(
        userId,
        agencyId,
        planId,
        paymentMethod
      );

      res.status(201).json({
        success: true,
        message: 'Subscription created successfully',
        data: subscription
      });

    } catch (error) {
      logger.error('Error creating subscription:', error);
      
      if (error.message.includes('already has')) {
        return res.status(409).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to create subscription'
      });
    }
  }
);

/**
 * Update subscription status
 */
router.put('/:id/status',
  [
    body('status')
      .isIn(['active', 'cancelled', 'expired', 'past_due'])
      .withMessage('Invalid status')
  ],
  async (req, res) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { id } = req.params;
      const { status } = req.body;

      await subscriptionService.updateSubscriptionStatus(id, status);

      res.json({
        success: true,
        message: 'Subscription status updated successfully'
      });

    } catch (error) {
      logger.error('Error updating subscription status:', error);
      
      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to update subscription status'
      });
    }
  }
);

/**
 * Cancel a subscription
 */
router.delete('/:id',
  [
    body('reason')
      .optional()
      .isString()
      .withMessage('Reason must be a string')
  ],
  async (req, res) => {
    try {
      const { id } = req.params;
      const { reason = 'User requested cancellation' } = req.body;

      await subscriptionService.cancelSubscription(id, reason);

      res.json({
        success: true,
        message: 'Subscription cancelled successfully'
      });

    } catch (error) {
      logger.error('Error cancelling subscription:', error);
      
      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to cancel subscription'
      });
    }
  }
);

/**
 * Check feature access
 */
router.get('/feature/:feature', async (req, res) => {
  try {
    const userId = req.user.id;
    const { feature } = req.params;

    const hasAccess = await subscriptionService.hasFeatureAccess(userId, feature);

    res.json({
      success: true,
      data: {
        feature,
        hasAccess
      }
    });

  } catch (error) {
    logger.error('Error checking feature access:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check feature access'
    });
  }
});

/**
 * Check limit status
 */
router.get('/limit/:limitType/:currentCount', async (req, res) => {
  try {
    const userId = req.user.id;
    const { limitType, currentCount } = req.params;

    const hasReachedLimit = await subscriptionService.hasReachedLimit(
      userId,
      limitType,
      parseInt(currentCount)
    );

    res.json({
      success: true,
      data: {
        limitType,
        currentCount: parseInt(currentCount),
        hasReachedLimit
      }
    });

  } catch (error) {
    logger.error('Error checking limit:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check limit'
    });
  }
});

/**
 * Upgrade subscription (placeholder)
 */
router.post('/upgrade', async (req, res) => {
  try {
    const { planId, billingCycle } = req.body;
    
    // For now, return success message
    // Payment integration will be added in Phase 6
    res.json({
      success: true,
      message: 'Upgrade functionality will be available soon',
      data: {
        planId,
        billingCycle,
        status: 'pending_payment_integration'
      }
    });

  } catch (error) {
    logger.error('Subscription upgrade error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upgrade subscription'
    });
  }
});

module.exports = router;
