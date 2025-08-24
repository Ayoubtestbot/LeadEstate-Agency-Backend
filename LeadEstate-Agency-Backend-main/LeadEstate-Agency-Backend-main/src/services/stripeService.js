const stripe = require('stripe');
const logger = require('../utils/logger');
const { getModels } = require('../models');

class StripeService {
  constructor() {
    this.stripe = null;
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    if (process.env.STRIPE_SECRET_KEY) {
      this.stripe = stripe(process.env.STRIPE_SECRET_KEY);
      logger.info('âœ… Stripe service initialized');
    } else {
      logger.warn('âš ï¸ Stripe not configured - payment functionality will be disabled');
    }
  }

  /**
   * Create a Stripe customer
   */
  async createCustomer(userData) {
    if (!this.stripe) {
      throw new Error('Stripe not configured');
    }

    try {
      const customer = await this.stripe.customers.create({
        email: userData.email,
        name: `${userData.firstName} ${userData.lastName}`,
        metadata: {
          agency_id: userData.agencyId,
          user_id: userData.userId
        }
      });

      logger.info(`âœ… Stripe customer created: ${customer.id}`);
      return customer;
    } catch (error) {
      logger.error('âŒ Failed to create Stripe customer:', error);
      throw error;
    }
  }

  /**
   * Create a subscription
   */
  async createSubscription(customerId, priceId, trialDays = 0) {
    if (!this.stripe) {
      throw new Error('Stripe not configured');
    }

    try {
      const subscriptionData = {
        customer: customerId,
        items: [{ price: priceId }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
      };

      if (trialDays > 0) {
        subscriptionData.trial_period_days = trialDays;
      }

      const subscription = await this.stripe.subscriptions.create(subscriptionData);

      logger.info(`âœ… Stripe subscription created: ${subscription.id}`);
      return subscription;
    } catch (error) {
      logger.error('âŒ Failed to create Stripe subscription:', error);
      throw error;
    }
  }

  /**
   * Create a payment intent for one-time payments
   */
  async createPaymentIntent(amount, currency = 'usd', customerId = null) {
    if (!this.stripe) {
      throw new Error('Stripe not configured');
    }

    try {
      const paymentIntentData = {
        amount: Math.round(amount * 100), // Convert to cents
        currency: currency,
        automatic_payment_methods: { enabled: true },
      };

      if (customerId) {
        paymentIntentData.customer = customerId;
      }

      const paymentIntent = await this.stripe.paymentIntents.create(paymentIntentData);

      logger.info(`âœ… Payment intent created: ${paymentIntent.id}`);
      return paymentIntent;
    } catch (error) {
      logger.error('âŒ Failed to create payment intent:', error);
      throw error;
    }
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(subscriptionId, immediately = false) {
    if (!this.stripe) {
      throw new Error('Stripe not configured');
    }

    try {
      let subscription;
      
      if (immediately) {
        subscription = await this.stripe.subscriptions.cancel(subscriptionId);
      } else {
        subscription = await this.stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true
        });
      }

      logger.info(`âœ… Stripe subscription ${immediately ? 'cancelled' : 'scheduled for cancellation'}: ${subscriptionId}`);
      return subscription;
    } catch (error) {
      logger.error('âŒ Failed to cancel Stripe subscription:', error);
      throw error;
    }
  }

  /**
   * Handle Stripe webhooks
   */
  async handleWebhook(body, signature) {
    if (!this.stripe || !this.webhookSecret) {
      throw new Error('Stripe webhook not configured');
    }

    try {
      const event = this.stripe.webhooks.constructEvent(body, signature, this.webhookSecret);
      
      logger.info(`ðŸ“¨ Stripe webhook received: ${event.type}`);

      switch (event.type) {
        case 'customer.subscription.created':
          await this.handleSubscriptionCreated(event.data.object);
          break;
        
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(event.data.object);
          break;
        
        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object);
          break;
        
        case 'invoice.payment_succeeded':
          await this.handlePaymentSucceeded(event.data.object);
          break;
        
        case 'invoice.payment_failed':
          await this.handlePaymentFailed(event.data.object);
          break;
        
        default:
          logger.info(`ðŸ”„ Unhandled webhook event type: ${event.type}`);
      }

      return { received: true };
    } catch (error) {
      logger.error('âŒ Webhook signature verification failed:', error);
      throw error;
    }
  }

  /**
   * Handle subscription created webhook
   */
  async handleSubscriptionCreated(subscription) {
    try {
      const models = getModels();
      const { Subscription } = models;

      // Update local subscription record
      await Subscription.update(
        {
          stripe_subscription_id: subscription.id,
          status: subscription.status,
          current_period_start: new Date(subscription.current_period_start * 1000),
          current_period_end: new Date(subscription.current_period_end * 1000),
        },
        {
          where: { stripe_subscription_id: subscription.id }
        }
      );

      logger.info(`âœ… Local subscription updated for Stripe subscription: ${subscription.id}`);
    } catch (error) {
      logger.error('âŒ Failed to handle subscription created:', error);
    }
  }

  /**
   * Handle subscription updated webhook
   */
  async handleSubscriptionUpdated(subscription) {
    try {
      const models = getModels();
      const { Subscription } = models;

      await Subscription.update(
        {
          status: subscription.status,
          current_period_start: new Date(subscription.current_period_start * 1000),
          current_period_end: new Date(subscription.current_period_end * 1000),
        },
        {
          where: { stripe_subscription_id: subscription.id }
        }
      );

      logger.info(`âœ… Subscription updated: ${subscription.id}`);
    } catch (error) {
      logger.error('âŒ Failed to handle subscription updated:', error);
    }
  }

  /**
   * Handle subscription deleted webhook
   */
  async handleSubscriptionDeleted(subscription) {
    try {
      const models = getModels();
      const { Subscription, User, Agency } = models;

      // Update subscription status
      await Subscription.update(
        { status: 'cancelled' },
        { where: { stripe_subscription_id: subscription.id } }
      );

      // Update user and agency status
      const localSubscription = await Subscription.findOne({
        where: { stripe_subscription_id: subscription.id }
      });

      if (localSubscription) {
        await User.update(
          { subscription_status: 'cancelled' },
          { where: { id: localSubscription.user_id } }
        );

        await Agency.update(
          { subscription_status: 'cancelled' },
          { where: { id: localSubscription.agency_id } }
        );
      }

      logger.info(`âœ… Subscription cancelled: ${subscription.id}`);
    } catch (error) {
      logger.error('âŒ Failed to handle subscription deleted:', error);
    }
  }

  /**
   * Handle payment succeeded webhook
   */
  async handlePaymentSucceeded(invoice) {
    try {
      const models = getModels();
      const { Payment } = models;

      // Create payment record
      await Payment.create({
        stripe_invoice_id: invoice.id,
        amount: invoice.amount_paid / 100, // Convert from cents
        currency: invoice.currency.toUpperCase(),
        status: 'completed',
        payment_method: 'stripe',
        description: invoice.description || 'Subscription payment',
        processed_at: new Date()
      });

      logger.info(`âœ… Payment recorded: ${invoice.id}`);
    } catch (error) {
      logger.error('âŒ Failed to handle payment succeeded:', error);
    }
  }

  /**
   * Handle payment failed webhook
   */
  async handlePaymentFailed(invoice) {
    try {
      const models = getModels();
      const { Payment } = models;

      // Create failed payment record
      await Payment.create({
        stripe_invoice_id: invoice.id,
        amount: invoice.amount_due / 100, // Convert from cents
        currency: invoice.currency.toUpperCase(),
        status: 'failed',
        payment_method: 'stripe',
        description: invoice.description || 'Failed subscription payment',
        processed_at: new Date()
      });

      logger.info(`âŒ Payment failed recorded: ${invoice.id}`);
    } catch (error) {
      logger.error('âŒ Failed to handle payment failed:', error);
    }
  }
}

module.exports = new StripeService();
