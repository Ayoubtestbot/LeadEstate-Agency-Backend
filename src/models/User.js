const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const { getSequelize } = require('../database/connection');

// Lazy initialization function
const getUserModel = () => {
  const sequelize = getSequelize();
  if (!sequelize) {
    throw new Error('Database not initialized');
  }

  // Check if model is already defined
  if (sequelize.models.User) {
    return sequelize.models.User;
  }

  const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [6, 255]
    }
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
    allowNull: false,
    validate: {
      len: [1, 50]
    }
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      is: /^[\+]?[1-9][\d]{0,15}$/
    }
  },
  role: {
    type: DataTypes.ENUM('manager', 'super_agent', 'agent'),
    allowNull: false,
    defaultValue: 'agent'
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'suspended'),
    allowNull: false,
    defaultValue: 'active'
  },
  avatar: {
    type: DataTypes.STRING,
    allowNull: true
  },
  language: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'en',
    validate: {
      isIn: [['en', 'fr']]
    }
  },
  timezone: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'UTC'
  },
  last_login: {
    type: DataTypes.DATE,
    allowNull: true
  },
  email_verified: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  email_verification_token: {
    type: DataTypes.STRING,
    allowNull: true
  },
  password_reset_token: {
    type: DataTypes.STRING,
    allowNull: true
  },
  password_reset_expires: {
    type: DataTypes.DATE,
    allowNull: true
  },
  preferences: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {
      notifications: {
        email: true,
        whatsapp: true,
        browser: true
      },
      dashboard: {
        defaultView: 'kanban',
        itemsPerPage: 25
      }
    }
  },
  permissions: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {}
  },
  agency_id: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: process.env.AGENCY_ID || 'default'
  }
}, {
  tableName: 'users',
  indexes: [
    {
      unique: true,
      fields: ['email', 'agency_id']
    },
    {
      fields: ['role']
    },
    {
      fields: ['status']
    },
    {
      fields: ['agency_id']
    }
  ],
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
        user.password = await bcrypt.hash(user.password, saltRounds);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
        user.password = await bcrypt.hash(user.password, saltRounds);
      }
    }
  }
  });

  // Instance methods
  User.prototype.validatePassword = async function(password) {
    return bcrypt.compare(password, this.password);
  };

  User.prototype.getFullName = function() {
    return `${this.first_name} ${this.last_name}`;
  };

  User.prototype.toJSON = function() {
    const values = { ...this.get() };
    delete values.password;
    delete values.email_verification_token;
    delete values.password_reset_token;
    delete values.password_reset_expires;
    return values;
  };

  // Class methods
  User.findByEmail = function(email, agencyId = null) {
    const where = { email };
    if (agencyId) {
      where.agency_id = agencyId;
    }
    return this.findOne({ where });
  };

  User.findActiveUsers = function(agencyId = null) {
    const where = { status: 'active' };
    if (agencyId) {
      where.agency_id = agencyId;
    }
    return this.findAll({ where });
  };

  User.getUsersByRole = function(role, agencyId = null) {
    const where = { role, status: 'active' };
    if (agencyId) {
      where.agency_id = agencyId;
    }
    return this.findAll({ where });
  };

  return User;
};

// Export the lazy initialization function
module.exports = getUserModel;
