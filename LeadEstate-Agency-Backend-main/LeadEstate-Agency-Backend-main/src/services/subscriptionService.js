const { getModels } = require('../models');
const brevoService = require('./brevoService');
const logger = require('../utils/logger');

class SubscriptionService {
  constructor() {
    this.models = null;
  }

  /**
   * Initialize models
   */
  init() {
    this.models = getModels();
  }

  /**
   * Create a trial subscription
   */
  async createTrialSubscription(userData, planName) {
    try {
      if (!this.models) {
        this.init();
      }

      const { User, Agency, Subscription, SubscriptionPlan, Payment } = this.models;

      // Get or create subscription plan
      let plan = await SubscriptionPlan.findOne({ where: { name: planName } });
      
      if (!plan) {
        // Create default starter plan
        plan = await SubscriptionPlan.create({
          name: 'starter',
          display_name: 'Starter Plan',
          description: 'Perfect for small agencies getting started',
          monthly_price: 99.00,
          annual_price: 990.00,
          features: ['Unlimited Leads', 'Basic Analytics', 'Email Support'],
          limits: {
            max_agents: 5,
            max_leads: 1000,
            max_properties: 50
          },
          is_active: true
        });
      }

      if (!plan) {
        throw new Error(`Subscription plan '${planName}' not found`);
      }

      logger.info('ðŸ” Creating trial user:', {
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        companyName: userData.companyName
      });

      // Create the user first
      const agencyId = `agency_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + (parseInt(process.env.TRIAL_PERIOD_DAYS) || 14));

      const user = await User.create({
        email: userData.email,
        password: userData.password,
        first_name: userData.firstName,
        last_name: userData.lastName,
        role: 'manager', // Trial users are managers of their agency
        agency_id: agencyId,
        status: 'active',
        subscription_status: 'trial',
        trial_end_date: trialEndDate
      });

      logger.info('âœ… User created successfully:', {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        agency_id: user.agency_id,
        subscription_status: user.subscription_status,
        trial_end_date: user.trial_end_date
      });

      // Create agency
      logger.info('ðŸ” Creating agency:', {
        agencyId: agencyId,
        companyName: userData.companyName,
        email: userData.email,
        userId: user.id
      });

      const agency = await Agency.create({
        id: agencyId,
        name: userData.companyName,
        email: userData.email,
        owner_id: user.id,
        status: 'active',
        subscription_status: 'trial',
        trial_end_date: trialEndDate
      });

      logger.info('âœ… Agency created successfully');

      // Create trial subscription
      const subscription = await Subscription.create({
        user_id: user.id,
        agency_id: agencyId,
        plan_id: plan.id,
        status: 'trial',
        trial_end_date: trialEndDate,
        current_period_start: new Date(),
        current_period_end: trialEndDate,
        created_at: new Date(),
        updated_at: new Date()
      });

      // Create initial payment record (free trial)
      await Payment.create({
        subscription_id: subscription.id,
        amount: 0.00,
        currency: 'USD',
        status: 'completed',
        payment_method: 'trial',
        description: 'Free trial period',
        billing_period_start: new Date(),
        billing_period_end: trialEndDate,
        processed_at: new Date()
      });

      // Send welcome email
      try {
        logger.info('ðŸ“§ Attempting to send trial welcome email to:', user.email);
        logger.info('ðŸ“§ Email data:', {
          userEmail: user.email,
          userName: user.first_name,
          planName: plan.display_name,
          trialEndDate: trialEndDate
        });
        
        const emailResult = await brevoService.sendTrialWelcomeEmail({
          userEmail: user.email,
          userName: user.first_name,
          planName: plan.display_name,
          trialEndDate: trialEndDate
        });
        
        logger.info('âœ… Trial welcome email sent successfully:', emailResult);
      } catch (emailError) {
        logger.error('âŒ Failed to send trial welcome email:', emailError);
        logger.error('âŒ Email error details:', {
          message: emailError.message,
          stack: emailError.stack
        });
      }

      logger.info(`Trial subscription created for user: ${user.id}`);

      return {
        success: true,
        user: user,
        agency: agency,
        subscription: subscription,
        plan: plan,
        trialEndDate: trialEndDate
      };

    } catch (error) {
      logger.error('Trial subscription creation error:', error);
      throw error;
    }
  }

  /**
   * Get all available subscription plans
   */
  async getAvailablePlans() {
    try {
      if (!this.models) {
        this.init();
      }

      const { SubscriptionPlan } = this.models;

      const plans = await SubscriptionPlan.findAll({
        where: { is_active: true },
        order: [['monthly_price', 'ASC']]
      });

      return plans.map(plan => ({
        id: plan.id,
        name: plan.name,
        displayName: plan.display_name,
        description: plan.description,
        monthlyPrice: plan.monthly_price,
        annualPrice: plan.annual_price,
        features: plan.features,
        limits: plan.limits
      }));

    } catch (error) {
      logger.error('Error fetching subscription plans:', error);
      throw error;
    }
  }
}

module.exports = new SubscriptionService();
