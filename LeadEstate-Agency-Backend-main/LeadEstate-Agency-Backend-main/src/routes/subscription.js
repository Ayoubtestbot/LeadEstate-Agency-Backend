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
    const plans = await subscriptionService.getAvailablePlans();
    
    res.json({
      success: true,
      data: plans
    });

  } catch (error) {
    logger.error('Error fetching subscription plans:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription plans'
    });
  }
});

/**
 * Create a new subscription
 */
router.post('/create',
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email'),
    body('planId')
      .notEmpty()
      .withMessage('Plan ID is required'),
    body('paymentMethod')
      .isIn(['paypal', 'stripe', 'trial'])
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

      const { email, planId, paymentMethod, paymentDetails } = req.body;

      // For now, return a success response
      // In a real implementation, you would integrate with payment processors
      res.json({
        success: true,
        message: 'Subscription created successfully',
        data: {
          subscriptionId: `sub_${Date.now()}`,
          planId,
          email,
          status: 'active',
          paymentMethod
        }
      });

    } catch (error) {
      logger.error('Error creating subscription:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create subscription'
      });
    }
  }
);

/**
 * Get subscription status
 */
router.get('/status/:subscriptionId', async (req, res) => {
  try {
    const { subscriptionId } = req.params;

    // For now, return a mock response
    // In a real implementation, you would fetch from database
    res.json({
      success: true,
      data: {
        id: subscriptionId,
        status: 'active',
        planName: 'Starter Plan',
        nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        trialEndDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      }
    });

  } catch (error) {
    logger.error('Error fetching subscription status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription status'
    });
  }
});

/**
 * Cancel subscription
 */
router.post('/cancel/:subscriptionId', async (req, res) => {
  try {
    const { subscriptionId } = req.params;

    // For now, return a success response
    // In a real implementation, you would update the database and cancel with payment processor
    res.json({
      success: true,
      message: 'Subscription cancelled successfully',
      data: {
        id: subscriptionId,
        status: 'cancelled',
        cancelledAt: new Date()
      }
    });

  } catch (error) {
    logger.error('Error cancelling subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel subscription'
    });
  }
});

module.exports = router;
