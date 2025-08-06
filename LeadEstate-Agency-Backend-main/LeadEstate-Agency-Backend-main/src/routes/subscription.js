const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const logger = require('../utils/logger');

// GET /api/subscription/status - Get current subscription status
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

// GET /api/subscription/plans - Get available subscription plans
router.get('/plans', async (req, res) => {
  try {
    const plans = [
      {
        id: 'starter',
        name: 'starter',
        displayName: 'Starter Plan',
        description: 'Perfect for small agencies getting started',
        pricing: {
          monthly: 99.00,
          quarterly: 267.00,
          semiAnnual: 495.00,
          annual: 950.00
        },
        limits: {
          maxLeads: 1000,
          maxUsers: 3,
          maxProperties: 100
        },
        features: {
          whatsapp: false,
          analytics: 'basic',
          branding: 'none',
          api_access: false
        },
        savings: {
          quarterly: 10,
          semiAnnual: 17,
          annual: 20
        }
      },
      {
        id: 'pro',
        name: 'pro',
        displayName: 'Pro Plan',
        description: 'Ideal for growing agencies with advanced needs',
        pricing: {
          monthly: 199.00,
          quarterly: 537.00,
          semiAnnual: 995.00,
          annual: 1900.00
        },
        limits: {
          maxLeads: 5000,
          maxUsers: 10,
          maxProperties: 500
        },
        features: {
          whatsapp: true,
          analytics: 'advanced',
          branding: 'basic',
          api_access: true
        },
        savings: {
          quarterly: 10,
          semiAnnual: 17,
          annual: 20
        }
      },
      {
        id: 'agency',
        name: 'agency',
        displayName: 'Agency Plan',
        description: 'Complete white-label solution for large agencies',
        pricing: {
          monthly: 399.00,
          quarterly: 1077.00,
          semiAnnual: 1995.00,
          annual: 3800.00
        },
        limits: {
          maxLeads: null,
          maxUsers: null,
          maxProperties: null
        },
        features: {
          whatsapp: true,
          analytics: 'enterprise',
          branding: 'full',
          api_access: true,
          white_label: true,
          custom_domain: true
        },
        savings: {
          quarterly: 10,
          semiAnnual: 17,
          annual: 20
        }
      }
    ];

    res.json({
      success: true,
      data: plans
    });

  } catch (error) {
    logger.error('Get plans error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get subscription plans'
    });
  }
});

// POST /api/subscription/upgrade - Upgrade subscription (placeholder)
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
