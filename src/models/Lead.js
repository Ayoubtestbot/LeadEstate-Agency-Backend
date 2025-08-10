const { DataTypes } = require('sequelize');
const { getSequelize } = require('../database/connection');

// Lazy initialization function
const getLeadModel = () => {
  const sequelize = getSequelize();
  if (!sequelize) {
    throw new Error('Database not initialized');
  }

  // Check if model is already defined
  if (sequelize.models.Lead) {
    return sequelize.models.Lead;
  }

  const Lead = sequelize.define('Lead', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  first_name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [1, 50]
    }
  },
  last_name: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [0, 50]
    }
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isEmail: true
    }
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      is: /^[\+]?[1-9][\d]{0,15}$/
    }
  },
  whatsapp: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      is: /^[\+]?[1-9][\d]{0,15}$/
    }
  },
  city: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [0, 100]
    }
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM(
      'new', 
      'contacted', 
      'qualified', 
      'proposal', 
      'negotiation', 
      'closed-won', 
      'closed-lost'
    ),
    allowNull: false,
    defaultValue: 'new'
  },
  source: {
    type: DataTypes.ENUM(
      'website', 
      'facebook', 
      'google', 
      'referral', 
      'walk-in', 
      'phone', 
      'email',
      'whatsapp',
      'google_sheets',
      'csv_import',
      'manual'
    ),
    allowNull: false,
    defaultValue: 'manual'
  },
  budget_min: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
    validate: {
      min: 0
    }
  },
  budget_max: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
    validate: {
      min: 0
    }
  },
  property_type: {
    type: DataTypes.ENUM(
      'apartment', 
      'house', 
      'condo', 
      'townhouse', 
      'villa', 
      'commercial',
      'land'
    ),
    allowNull: true
  },
  bedrooms: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 0,
      max: 20
    }
  },
  bathrooms: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 0,
      max: 20
    }
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  assigned_to: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high'),
    allowNull: false,
    defaultValue: 'medium'
  },
  score: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    validate: {
      min: 0,
      max: 100
    }
  },
  last_contact: {
    type: DataTypes.DATE,
    allowNull: true
  },
  next_follow_up: {
    type: DataTypes.DATE,
    allowNull: true
  },
  conversion_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  conversion_value: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
    validate: {
      min: 0
    }
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: []
  },
  custom_fields: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {}
  },
  communication_preferences: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {
      email: true,
      whatsapp: true,
      phone: true
    }
  },
  agency_id: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: process.env.AGENCY_ID || 'default'
  }
}, {
  tableName: 'leads',
  indexes: [
    {
      fields: ['email', 'agency_id']
    },
    {
      fields: ['phone', 'agency_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['source']
    },
    {
      fields: ['assigned_to']
    },
    {
      fields: ['priority']
    },
    {
      fields: ['score']
    },
    {
      fields: ['agency_id']
    },
    {
      fields: ['created_at']
    },
    {
      fields: ['next_follow_up']
    }
  ],
  validate: {
    mustHaveContactInfo() {
      if (!this.email && !this.phone && !this.whatsapp) {
        throw new Error('Lead must have at least one contact method (email, phone, or WhatsApp)');
      }
    },
    budgetRange() {
      if (this.budget_min && this.budget_max && this.budget_min > this.budget_max) {
        throw new Error('Minimum budget cannot be greater than maximum budget');
      }
    }
  }
  });

  // Instance methods
  Lead.prototype.getFullName = function() {
    return this.last_name ?
      `${this.first_name} ${this.last_name}` :
      this.first_name;
  };

  Lead.prototype.getPrimaryContact = function() {
    return this.email || this.phone || this.whatsapp;
  };

  Lead.prototype.getBudgetRange = function() {
    if (this.budget_min && this.budget_max) {
      return `$${this.budget_min.toLocaleString()} - $${this.budget_max.toLocaleString()}`;
    } else if (this.budget_min) {
      return `$${this.budget_min.toLocaleString()}+`;
    } else if (this.budget_max) {
      return `Up to $${this.budget_max.toLocaleString()}`;
    }
    return 'Not specified';
  };

  Lead.prototype.isHotLead = function() {
    return this.score >= 80 || this.priority === 'high';
  };

  Lead.prototype.daysSinceCreated = function() {
    const now = new Date();
    const created = new Date(this.created_at);
    return Math.floor((now - created) / (1000 * 60 * 60 * 24));
  };

  // Class methods
  Lead.findByEmail = function(email, agencyId = null) {
    const where = { email };
    if (agencyId) {
      where.agency_id = agencyId;
    }
    return this.findOne({ where });
  };

  Lead.findByPhone = function(phone, agencyId = null) {
    const where = { phone };
    if (agencyId) {
      where.agency_id = agencyId;
    }
    return this.findOne({ where });
  };

  Lead.findByStatus = function(status, agencyId = null) {
    const where = { status };
    if (agencyId) {
      where.agency_id = agencyId;
    }
    return this.findAll({ where });
  };

  Lead.findAssignedTo = function(userId, agencyId = null) {
    const where = { assigned_to: userId };
    if (agencyId) {
      where.agency_id = agencyId;
    }
    return this.findAll({ where });
  };

  Lead.findHotLeads = function(agencyId = null) {
    const where = {
      [sequelize.Sequelize.Op.or]: [
        { score: { [sequelize.Sequelize.Op.gte]: 80 } },
        { priority: 'high' }
      ]
    };
    if (agencyId) {
      where.agency_id = agencyId;
    }
    return this.findAll({ where });
  };

  return Lead;
};

// Export the lazy initialization function
module.exports = getLeadModel;
