const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { getSubscriptionModel } = require('../models/Subscription');
const { getSubscriptionPlanModel } = require('../models/SubscriptionPlan');
const { authMiddleware } = require('../middleware/auth');
const logger = require('../utils/logger');

// GET /api/subscription/status - Get current subscription status
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user's subscription details
    const subscriptionQuery = await pool.query(`
      SELECT 
        s.id, s.status, s.billing_cycle, s.is_trial, s.trial_end_date,
        s.current_period_start, s.current_period_end, s.amount, s.currency,
        sp.name as plan_name, sp.display_name, sp.features, sp.max_leads, 
        sp.max_users, sp.max_properties
      FROM subscriptions s
      JOIN subscription_plans sp ON s.plan_id = sp.id
      WHERE s.user_id = $1 AND s.status IN ('trial', 'active')
      ORDER BY s.created_at DESC
      LIMIT 1
    `, [userId]);

    if (subscriptionQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found',
        code: 'NO_SUBSCRIPTION'
      });
    }

    const subscription = subscriptionQuery.rows[0];
    
    // Calculate trial info if applicable
    let trialInfo = null;
    if (subscription.is_trial && subscription.trial_end_date) {
      const now = new Date();
      const endDate = new Date(subscription.trial_end_date);
      const diffTime = endDate - now;
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      trialInfo = {
        daysRemaining: Math.max(0, daysRemaining),
        endDate: subscription.trial_end_date,
        isExpired: daysRemaining <= 0,
        isExpiringSoon: daysRemaining <= 3
      };
    }

    // Get current usage
    const usageQuery = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM leads WHERE agency_id = $1) as leads_count,
        (SELECT COUNT(*) FROM users WHERE agency_id = $1 AND status = 'active') as users_count,
        (SELECT COUNT(*) FROM properties WHERE agency_id = $1) as properties_count
    `, [req.user.agencyId]);

    const usage = usageQuery.rows[0];

    res.json({
      success: true,
      data: {
        subscription: {
          id: subscription.id,
          status: subscription.status,
          planName: subscription.plan_name,
          displayName: subscription.display_name,
          billingCycle: subscription.billing_cycle,
          amount: parseFloat(subscription.amount),
          currency: subscription.currency,
          currentPeriodStart: subscription.current_period_start,
          currentPeriodEnd: subscription.current_period_end
        },
        plan: {
          features: subscription.features,
          limits: {
            maxLeads: subscription.max_leads,
            maxUsers: subscription.max_users,
            maxProperties: subscription.max_properties
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

// GET /api/subscription/plans - Get available subscription plans
router.get('/plans', async (req, res) => {
  try {
    const SubscriptionPlan = getSubscriptionPlanModel();
    const plans = await SubscriptionPlan.getActivePlans();

    const formattedPlans = plans.map(plan => ({
      id: plan.id,
      name: plan.name,
      displayName: plan.display_name,
      description: plan.description,
      pricing: {
        monthly: parseFloat(plan.monthly_price),
        quarterly: parseFloat(plan.quarterly_price),
        semiAnnual: parseFloat(plan.semi_annual_price),
        annual: parseFloat(plan.annual_price)
      },
      limits: {
        maxLeads: plan.max_leads,
        maxUsers: plan.max_users,
        maxProperties: plan.max_properties
      },
      features: plan.features,
      savings: {
        quarterly: plan.getSavingsPercentage('quarterly'),
        semiAnnual: plan.getSavingsPercentage('semi_annual'),
        annual: plan.getSavingsPercentage('annual')
      }
    }));

    res.json({
      success: true,
      data: formattedPlans
    });

  } catch (error) {
    logger.error('Get plans error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get subscription plans'
    });
  }
});

// POST /api/subscription/upgrade - Upgrade subscription (placeholder for payment integration)
router.post('/upgrade', authMiddleware, async (req, res) => {
  try {
    const { planId, billingCycle, paymentMethodId } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!planId || !billingCycle) {
      return res.status(400).json({
        success: false,
        message: 'Plan ID and billing cycle are required'
      });
    }

    // Get the target plan
    const SubscriptionPlan = getSubscriptionPlanModel();
    const targetPlan = await SubscriptionPlan.findByPk(planId);
    
    if (!targetPlan) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found'
      });
    }

    // Get current subscription
    const currentSubscription = await pool.query(`
      SELECT id, status, plan_id FROM subscriptions 
      WHERE user_id = $1 AND status IN ('trial', 'active')
      ORDER BY created_at DESC LIMIT 1
    `, [userId]);

    if (currentSubscription.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found'
      });
    }

    const subscription = currentSubscription.rows[0];
    const amount = targetPlan.getPriceForCycle(billingCycle);

    // For now, simulate successful upgrade (payment integration will be added later)
    // In production, this would integrate with Stripe/PayPal
    
    // Update subscription
    const now = new Date();
    const nextBilling = new Date(now);
    
    // Calculate next billing date based on cycle
    switch (billingCycle) {
      case 'quarterly':
        nextBilling.setMonth(nextBilling.getMonth() + 3);
        break;
      case 'semi_annual':
        nextBilling.setMonth(nextBilling.getMonth() + 6);
        break;
      case 'annual':
        nextBilling.setFullYear(nextBilling.getFullYear() + 1);
        break;
      default: // monthly
        nextBilling.setMonth(nextBilling.getMonth() + 1);
    }

    await pool.query(`
      UPDATE subscriptions SET 
        plan_id = $1,
        status = 'active',
        billing_cycle = $2,
        is_trial = false,
        trial_converted = CASE WHEN is_trial THEN true ELSE trial_converted END,
        amount = $3,
        current_period_start = $4,
        current_period_end = $5,
        next_billing_date = $5,
        updated_at = NOW()
      WHERE id = $6
    `, [planId, billingCycle, amount, now, nextBilling, subscription.id]);

    // Update user subscription status
    await pool.query(`
      UPDATE users SET 
        subscription_status = 'active',
        plan_name = $1,
        trial_end_date = NULL,
        updated_at = NOW()
      WHERE id = $2
    `, [targetPlan.name, userId]);

    // Log the upgrade
    await pool.query(`
      INSERT INTO billing_history (
        subscription_id, user_id, transaction_type, amount, currency,
        status, description, billing_period_start, billing_period_end,
        processed_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
    `, [
      subscription.id,
      userId,
      'upgrade',
      amount,
      'USD',
      'completed',
      `Upgraded to ${targetPlan.display_name} (${billingCycle})`,
      now,
      nextBilling
    ]);

    logger.info(`User ${userId} upgraded to ${targetPlan.name} (${billingCycle})`);

    res.json({
      success: true,
      message: 'Subscription upgraded successfully',
      data: {
        planName: targetPlan.name,
        displayName: targetPlan.display_name,
        billingCycle,
        amount,
        nextBillingDate: nextBilling
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

// POST /api/subscription/cancel - Cancel subscription
router.post('/cancel', authMiddleware, async (req, res) => {
  try {
    const { reason } = req.body;
    const userId = req.user.id;

    // Get current subscription
    const subscriptionQuery = await pool.query(`
      SELECT id, status FROM subscriptions 
      WHERE user_id = $1 AND status = 'active'
      ORDER BY created_at DESC LIMIT 1
    `, [userId]);

    if (subscriptionQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found to cancel'
      });
    }

    const subscription = subscriptionQuery.rows[0];

    // Update subscription to cancelled
    await pool.query(`
      UPDATE subscriptions SET 
        status = 'cancelled',
        cancelled_at = NOW(),
        cancelled_reason = $1,
        updated_at = NOW()
      WHERE id = $2
    `, [reason || 'User requested cancellation', subscription.id]);

    // Update user status
    await pool.query(`
      UPDATE users SET 
        subscription_status = 'cancelled',
        updated_at = NOW()
      WHERE id = $1
    `, [userId]);

    logger.info(`User ${userId} cancelled subscription: ${reason}`);

    res.json({
      success: true,
      message: 'Subscription cancelled successfully'
    });

  } catch (error) {
    logger.error('Subscription cancellation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel subscription'
    });
  }
});

// GET /api/subscription/billing-history - Get billing history
router.get('/billing-history', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 10, offset = 0 } = req.query;

    const historyQuery = await pool.query(`
      SELECT 
        id, transaction_type, amount, currency, status, description,
        billing_period_start, billing_period_end, processed_at, created_at
      FROM billing_history 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);

    const totalQuery = await pool.query(`
      SELECT COUNT(*) as total FROM billing_history WHERE user_id = $1
    `, [userId]);

    res.json({
      success: true,
      data: {
        history: historyQuery.rows.map(row => ({
          id: row.id,
          type: row.transaction_type,
          amount: parseFloat(row.amount),
          currency: row.currency,
          status: row.status,
          description: row.description,
          billingPeriod: {
            start: row.billing_period_start,
            end: row.billing_period_end
          },
          processedAt: row.processed_at,
          createdAt: row.created_at
        })),
        pagination: {
          total: parseInt(totalQuery.rows[0].total),
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      }
    });

  } catch (error) {
    logger.error('Billing history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get billing history'
    });
  }
});

module.exports = router;
