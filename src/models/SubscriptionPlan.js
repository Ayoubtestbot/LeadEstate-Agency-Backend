const { DataTypes } = require('sequelize');
const { getSequelize } = require('../config/database');

// Lazy initialization function for SubscriptionPlan model
const getSubscriptionPlanModel = () => {
  const sequelize = getSequelize();
  if (!sequelize) {
    throw new Error('Database not initialized');
  }

  // Check if model is already defined
  if (sequelize.models.SubscriptionPlan) {
    return sequelize.models.SubscriptionPlan;
  }

  const SubscriptionPlan = sequelize.define('SubscriptionPlan', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      validate: {
        isIn: [['starter', 'pro', 'agency']]
      }
    },
    display_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    
    // Pricing
    monthly_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    quarterly_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    semi_annual_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    annual_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    
    // Plan limits
    max_leads: {
      type: DataTypes.INTEGER,
      allowNull: true, // NULL = unlimited
      validate: {
        min: 0
      }
    },
    max_users: {
      type: DataTypes.INTEGER,
      allowNull: true, // NULL = unlimited
      validate: {
        min: 1
      }
    },
    max_properties: {
      type: DataTypes.INTEGER,
      allowNull: true, // NULL = unlimited
      validate: {
        min: 0
      }
    },
    
    // Features (JSON for flexibility)
    features: {
      type: DataTypes.JSONB,
      defaultValue: {},
      validate: {
        isValidFeatures(value) {
          const validFeatures = [
            'whatsapp', 'analytics', 'branding', 'api_access', 
            'google_sheets', 'white_label', 'custom_domain'
          ];
          
          for (const feature in value) {
            if (!validFeatures.includes(feature)) {
              throw new Error(`Invalid feature: ${feature}`);
            }
          }
        }
      }
    },
    
    // Status
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    sort_order: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    tableName: 'subscription_plans',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['name']
      },
      {
        fields: ['is_active']
      },
      {
        fields: ['sort_order']
      }
    ]
  });

  // Instance methods
  SubscriptionPlan.prototype.getPriceForCycle = function(cycle) {
    const priceMap = {
      'monthly': this.monthly_price,
      'quarterly': this.quarterly_price,
      'semi_annual': this.semi_annual_price,
      'annual': this.annual_price
    };
    
    return priceMap[cycle] || this.monthly_price;
  };

  SubscriptionPlan.prototype.hasFeature = function(featureName) {
    return this.features && this.features[featureName] === true;
  };

  SubscriptionPlan.prototype.getFeatureValue = function(featureName) {
    return this.features ? this.features[featureName] : null;
  };

  SubscriptionPlan.prototype.getSavingsPercentage = function(cycle) {
    if (cycle === 'monthly') return 0;
    
    const monthlyPrice = parseFloat(this.monthly_price);
    const cyclePrice = parseFloat(this.getPriceForCycle(cycle));
    
    const cycleMonths = {
      'quarterly': 3,
      'semi_annual': 6,
      'annual': 12
    };
    
    const months = cycleMonths[cycle] || 1;
    const totalMonthlyPrice = monthlyPrice * months;
    
    if (totalMonthlyPrice === 0) return 0;
    
    const savings = ((totalMonthlyPrice - cyclePrice) / totalMonthlyPrice) * 100;
    return Math.round(savings);
  };

  // Class methods
  SubscriptionPlan.getActivePlans = async function() {
    return await this.findAll({
      where: { is_active: true },
      order: [['sort_order', 'ASC'], ['monthly_price', 'ASC']]
    });
  };

  SubscriptionPlan.getByName = async function(name) {
    return await this.findOne({
      where: { name, is_active: true }
    });
  };

  SubscriptionPlan.getStarterPlan = async function() {
    return await this.getByName('starter');
  };

  SubscriptionPlan.seedDefaultPlans = async function() {
    const plans = [
      {
        name: 'starter',
        display_name: 'Starter Plan',
        description: 'Perfect for small agencies getting started',
        monthly_price: 99.00,
        quarterly_price: 267.00,
        semi_annual_price: 495.00,
        annual_price: 950.00,
        max_leads: 1000,
        max_users: 3,
        max_properties: 100,
        features: {
          whatsapp: false,
          analytics: 'basic',
          branding: 'none',
          api_access: false,
          google_sheets: false,
          white_label: false,
          custom_domain: false
        },
        sort_order: 1
      },
      {
        name: 'pro',
        display_name: 'Pro Plan',
        description: 'Ideal for growing agencies with advanced needs',
        monthly_price: 199.00,
        quarterly_price: 537.00,
        semi_annual_price: 995.00,
        annual_price: 1900.00,
        max_leads: 5000,
        max_users: 10,
        max_properties: 500,
        features: {
          whatsapp: true,
          analytics: 'advanced',
          branding: 'basic',
          api_access: true,
          google_sheets: true,
          white_label: false,
          custom_domain: false
        },
        sort_order: 2
      },
      {
        name: 'agency',
        display_name: 'Agency Plan',
        description: 'Complete white-label solution for large agencies',
        monthly_price: 399.00,
        quarterly_price: 1077.00,
        semi_annual_price: 1995.00,
        annual_price: 3800.00,
        max_leads: null, // unlimited
        max_users: null, // unlimited
        max_properties: null, // unlimited
        features: {
          whatsapp: true,
          analytics: 'enterprise',
          branding: 'full',
          api_access: true,
          google_sheets: true,
          white_label: true,
          custom_domain: true
        },
        sort_order: 3
      }
    ];

    for (const planData of plans) {
      await this.findOrCreate({
        where: { name: planData.name },
        defaults: planData
      });
    }
  };

  return SubscriptionPlan;
};

module.exports = { getSubscriptionPlanModel };
