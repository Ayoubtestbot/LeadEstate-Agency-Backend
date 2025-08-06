const { DataTypes } = require('sequelize');
const { getSequelize } = require('../../LeadEstate-Agency-Backend-main/LeadEstate-Agency-Backend-main/src/config/database');

// Lazy initialization function for Subscription model
const getSubscriptionModel = () => {
  const sequelize = getSequelize();
  if (!sequelize) {
    throw new Error('Database not initialized');
  }

  // Check if model is already defined
  if (sequelize.models.Subscription) {
    return sequelize.models.Subscription;
  }

  const Subscription = sequelize.define('Subscription', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    plan_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'subscription_plans',
        key: 'id'
      }
    },
    
    // Subscription details
    status: {
      type: DataTypes.ENUM('trial', 'active', 'cancelled', 'expired', 'suspended'),
      allowNull: false,
      defaultValue: 'trial'
    },
    billing_cycle: {
      type: DataTypes.ENUM('monthly', 'quarterly', 'semi_annual', 'annual'),
      allowNull: false,
      defaultValue: 'monthly'
    },
    
    // Trial information
    is_trial: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    trial_start_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    trial_end_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    trial_converted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    
    // Billing dates
    current_period_start: {
      type: DataTypes.DATE,
      allowNull: false
    },
    current_period_end: {
      type: DataTypes.DATE,
      allowNull: false
    },
    next_billing_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    
    // Payment information
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    currency: {
      type: DataTypes.STRING(3),
      defaultValue: 'USD'
    },
    payment_method_id: {
      type: DataTypes.STRING,
      allowNull: true
    },
    customer_id: {
      type: DataTypes.STRING,
      allowNull: true
    },
    
    // Subscription lifecycle
    started_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    cancelled_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    cancelled_reason: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'subscriptions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['status']
      },
      {
        fields: ['trial_end_date']
      },
      {
        fields: ['next_billing_date']
      }
    ]
  });

  // Instance methods
  Subscription.prototype.isActive = function() {
    return ['trial', 'active'].includes(this.status);
  };

  Subscription.prototype.isTrialExpired = function() {
    if (!this.is_trial || !this.trial_end_date) return false;
    return new Date() > new Date(this.trial_end_date);
  };

  Subscription.prototype.getDaysRemaining = function() {
    if (!this.is_trial || !this.trial_end_date) return 0;
    const now = new Date();
    const endDate = new Date(this.trial_end_date);
    const diffTime = endDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  };

  Subscription.prototype.canAccess = function(feature) {
    if (!this.isActive()) return false;
    if (this.isTrialExpired()) return false;
    return true; // Will be enhanced with plan-specific features
  };

  // Class methods
  Subscription.createTrial = async function(userId, planId = null) {
    const sequelize = getSequelize();
    
    // Get default starter plan if no plan specified
    if (!planId) {
      const SubscriptionPlan = require('./SubscriptionPlan').getSubscriptionPlanModel();
      const starterPlan = await SubscriptionPlan.findOne({ where: { name: 'starter' } });
      planId = starterPlan.id;
    }

    const trialStartDate = new Date();
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 14); // 14-day trial

    return await this.create({
      user_id: userId,
      plan_id: planId,
      status: 'trial',
      is_trial: true,
      trial_start_date: trialStartDate,
      trial_end_date: trialEndDate,
      current_period_start: trialStartDate,
      current_period_end: trialEndDate,
      amount: 0.00
    });
  };

  Subscription.findActiveByUserId = async function(userId) {
    return await this.findOne({
      where: {
        user_id: userId,
        status: ['trial', 'active']
      },
      order: [['created_at', 'DESC']]
    });
  };

  Subscription.findExpiringTrials = async function(daysAhead = 3) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysAhead);
    
    return await this.findAll({
      where: {
        status: 'trial',
        is_trial: true,
        trial_end_date: {
          [sequelize.Op.lte]: targetDate
        }
      },
      include: [{
        model: sequelize.models.User,
        as: 'user',
        attributes: ['id', 'email', 'first_name', 'last_name']
      }]
    });
  };

  return Subscription;
};

module.exports = { getSubscriptionModel };
