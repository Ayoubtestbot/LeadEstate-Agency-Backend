const { getModels } = require('../models');
const logger = require('../utils/logger');

class SubscriptionService {
  constructor() {
    this.plans = [
      {
        id: 'starter',
        name: 'Starter Plan',
        price: 29,
        currency: 'USD',
        interval: 'month',
        features: [
          'Up to 50 leads',
          'Basic CRM features',
          'Email support',
          '1 user account'
        ],
        limits: {
          leads: 50,
          users: 1,
          properties: 20
        }
      },
      {
        id: 'professional',
        name: 'Professional Plan',
        price: 79,
        currency: 'USD',
        interval: 'month',
        features: [
          'Up to 500 leads',
          'Advanced CRM features',
          'Priority support',
          'Up to 5 users',
          'Advanced analytics',
          'Integrations'
        ],
        limits: {
          leads: 500,
          users: 5,
          properties: 100
        }
      },
      {
        id: 'enterprise',
        name: 'Enterprise Plan',
        price: 199,
        currency: 'USD',
        interval: 'month',
        features: [
          'Unlimited leads',
          'Full CRM suite',
          '24/7 support',
          'Unlimited users',
          'Custom integrations',
          'White label options'
        ],
        limits: {
          leads: -1, // Unlimited
          users: -1, // Unlimited
          properties: -1 // Unlimited
        }
      }
    ];
  }

  /**
   * Get all available subscription plans
   */
  getAllPlans() {
    return this.plans;
  }

  /**
   * Get a specific plan by ID
   */
  getPlan(planId) {
    return this.plans.find(plan => plan.id === planId);
  }

  /**
   * Create a new subscription
   */
  async createSubscription(userId, agencyId, planId, paymentMethod = 'trial') {
    try {
      const models = getModels();
      const { Subscription } = models;

      const plan = this.getPlan(planId);
      if (!plan) {
        throw new Error(`Plan ${planId} not found`);
      }

      // Check if user already has an active subscription
      const existingSubscription = await Subscription.findOne({
        where: {
          user_id: userId,
          status: ['active', 'trial']
        }
      });

      if (existingSubscription) {
        throw new Error('User already has an active subscription');
      }

      const subscriptionData = {
        user_id: userId,
        agency_id: agencyId,
        plan_id: planId,
        plan_name: plan.name,
        price: plan.price,
        currency: plan.currency,
        interval: plan.interval,
        status: paymentMethod === 'trial' ? 'trial' : 'active',
        payment_method: paymentMethod,
        current_period_start: new Date(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        features: JSON.stringify(plan.features),
        limits: JSON.stringify(plan.limits)
      };

      // If it's a trial, set 13 days from now
      if (paymentMethod === 'trial') {
        subscriptionData.current_period_end = new Date(Date.now() + 13 * 24 * 60 * 60 * 1000); // 13 days
      }

      const subscription = await Subscription.create(subscriptionData);
      
      logger.info('âœ… Subscription created successfully:', subscription.id);
      
      return subscription;
    } catch (error) {
      logger.error('âŒ Failed to create subscription:', error);
      throw error;
    }
  }

  /**
   * Get user's current subscription
   */
  async getUserSubscription(userId) {
    try {
      const models = getModels();
      const { Subscription } = models;

      const subscription = await Subscription.findOne({
        where: {
          user_id: userId,
          status: ['active', 'trial', 'past_due']
        },
        order: [['created_at', 'DESC']]
      });

      if (!subscription) {
        return null;
      }

      // Parse JSON fields
      if (subscription.features && typeof subscription.features === 'string') {
        subscription.features = JSON.parse(subscription.features);
      }
      if (subscription.limits && typeof subscription.limits === 'string') {
        subscription.limits = JSON.parse(subscription.limits);
      }

      // Check if trial has expired
      if (subscription.status === 'trial' && new Date() > new Date(subscription.current_period_end)) {
        // Update status to expired
        await Subscription.update(
          { status: 'expired' },
          { where: { id: subscription.id } }
        );
        subscription.status = 'expired';
      }

      return subscription;
    } catch (error) {
      logger.error('âŒ Failed to get user subscription:', error);
      throw error;
    }
  }

  /**
   * Update subscription status
   */
  async updateSubscriptionStatus(subscriptionId, status, data = {}) {
    try {
      const models = getModels();
      const { Subscription } = models;

      const updateData = {
        status,
        updated_at: new Date(),
        ...data
      };

      const [updatedCount] = await Subscription.update(
        updateData,
        { where: { id: subscriptionId } }
      );

      if (updatedCount === 0) {
        throw new Error('Subscription not found');
      }

      logger.info(`âœ… Subscription ${subscriptionId} updated to ${status}`);
      
      return true;
    } catch (error) {
      logger.error('âŒ Failed to update subscription:', error);
      throw error;
    }
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(subscriptionId, reason = 'User requested cancellation') {
    try {
      const models = getModels();
      const { Subscription } = models;

      const subscription = await Subscription.findByPk(subscriptionId);
      if (!subscription) {
        throw new Error('Subscription not found');
      }

      await Subscription.update(
        { 
          status: 'cancelled',
          cancelled_at: new Date(),
          cancellation_reason: reason
        },
        { where: { id: subscriptionId } }
      );

      logger.info(`âœ… Subscription ${subscriptionId} cancelled`);
      
      return true;
    } catch (error) {
      logger.error('âŒ Failed to cancel subscription:', error);
      throw error;
    }
  }

  /**
   * Check if user has access to a feature
   */
  async hasFeatureAccess(userId, feature) {
    try {
      const subscription = await this.getUserSubscription(userId);
      
      if (!subscription || subscription.status === 'expired' || subscription.status === 'cancelled') {
        return false;
      }

      const features = subscription.features || [];
      return features.includes(feature);
    } catch (error) {
      logger.error('âŒ Failed to check feature access:', error);
      return false;
    }
  }

  /**
   * Check if user has reached a limit
   */
  async hasReachedLimit(userId, limitType, currentCount) {
    try {
      const subscription = await this.getUserSubscription(userId);
      
      if (!subscription || subscription.status === 'expired' || subscription.status === 'cancelled') {
        return true; // No active subscription, so limit reached
      }

      const limits = subscription.limits || {};
      const limit = limits[limitType];
      
      // -1 means unlimited
      if (limit === -1) {
        return false;
      }

      return currentCount >= limit;
    } catch (error) {
      logger.error('âŒ Failed to check limit:', error);
      return true; // Error side, assume limit reached
    }
  }

  /**
   * Get days remaining in current period
   */
  async getDaysRemaining(userId) {
    try {
      const subscription = await this.getUserSubscription(userId);
      
      if (!subscription || subscription.status === 'expired' || subscription.status === 'cancelled') {
        return 0;
      }

      const endDate = new Date(subscription.current_period_end);
      const today = new Date();
      const diffTime = endDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 3600 * 24));
      
      return Math.max(0, diffDays);
    } catch (error) {
      logger.error('âŒ Failed to get days remaining:', error);
      return 0;
    }
  }
}

module.exports = new SubscriptionService();
