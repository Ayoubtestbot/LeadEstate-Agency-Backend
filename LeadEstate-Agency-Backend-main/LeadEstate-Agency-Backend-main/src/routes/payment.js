const express = require('express');
const { body, validationResult } = require('express-validator');
const stripeService = require('../services/stripeService');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Create payment intent for subscription upgrade
 */
router.post('/create-payment-intent',
  [
    body('amount')
      .isFloat({ min: 0.01 })
      .withMessage('Amount must be greater than 0'),
    body('currency')
      .optional()
      .isIn(['usd', 'eur', 'gbp'])
      .withMessage('Invalid currency'),
    body('customerId')
      .optional()
      .isString()
      .withMessage('Customer ID must be a string')
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

      const { amount, currency = 'usd', customerId } = req.body;

      const paymentIntent = await stripeService.createPaymentIntent(
        amount,
        currency,
        customerId
      );

      res.json({
        success: true,
        data: {
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id
        }
      });

    } catch (error) {
      logger.error('Error creating payment intent:', error);
      
      if (error.message === 'Stripe not configured') {
        return res.status(503).json({
          success: false,
          message: 'Payment processing is currently unavailable'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to create payment intent'
      });
    }
  }
);

/**
 * Create Stripe customer
 */
router.post('/create-customer',
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email'),
    body('firstName')
      .trim()
      .isLength({ min: 1 })
      .withMessage('First name is required'),
    body('lastName')
      .trim()
      .isLength({ min: 1 })
      .withMessage('Last name is required'),
    body('agencyId')
      .isString()
      .withMessage('Agency ID is required'),
    body('userId')
      .isString()
      .withMessage('User ID is required')
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

      const customer = await stripeService.createCustomer(req.body);

      res.json({
        success: true,
        data: {
          customerId: customer.id,
          customer: customer
        }
      });

    } catch (error) {
      logger.error('Error creating Stripe customer:', error);
      
      if (error.message === 'Stripe not configured') {
        return res.status(503).json({
          success: false,
          message: 'Payment processing is currently unavailable'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to create customer'
      });
    }
  }
);

/**
 * Create subscription
 */
router.post('/create-subscription',
  [
    body('customerId')
      .isString()
      .withMessage('Customer ID is required'),
    body('priceId')
      .isString()
      .withMessage('Price ID is required'),
    body('trialDays')
      .optional()
      .isInt({ min: 0, max: 365 })
      .withMessage('Trial days must be between 0 and 365')
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

      const { customerId, priceId, trialDays = 0 } = req.body;

      const subscription = await stripeService.createSubscription(
        customerId,
        priceId,
        trialDays
      );

      res.json({
        success: true,
        data: {
          subscriptionId: subscription.id,
          clientSecret: subscription.latest_invoice?.payment_intent?.client_secret,
          subscription: subscription
        }
      });

    } catch (error) {
      logger.error('Error creating subscription:', error);
      
      if (error.message === 'Stripe not configured') {
        return res.status(503).json({
          success: false,
          message: 'Payment processing is currently unavailable'
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
 * Cancel subscription
 */
router.post('/cancel-subscription/:subscriptionId',
  [
    body('immediately')
      .optional()
      .isBoolean()
      .withMessage('Immediately must be a boolean')
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

      const { subscriptionId } = req.params;
      const { immediately = false } = req.body;

      const subscription = await stripeService.cancelSubscription(
        subscriptionId,
        immediately
      );

      res.json({
        success: true,
        message: immediately 
          ? 'Subscription cancelled immediately' 
          : 'Subscription scheduled for cancellation at period end',
        data: {
          subscription: subscription
        }
      });

    } catch (error) {
      logger.error('Error cancelling subscription:', error);
      
      if (error.message === 'Stripe not configured') {
        return res.status(503).json({
          success: false,
          message: 'Payment processing is currently unavailable'
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
 * Stripe webhook endpoint
 */
router.post('/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      const signature = req.headers['stripe-signature'];
      
      if (!signature) {
        return res.status(400).json({
          success: false,
          message: 'Missing stripe signature'
        });
      }

      const result = await stripeService.handleWebhook(req.body, signature);

      res.json(result);

    } catch (error) {
      logger.error('Webhook error:', error);
      
      res.status(400).json({
        success: false,
        message: 'Webhook signature verification failed'
      });
    }
  }
);

module.exports = router;
