const { getSequelize } = require('../database/connection');

// Import model factory functions
const getUserModel = require('./User');
const getLeadModel = require('./Lead');

// Initialize models and setup associations
const initializeModels = () => {
  try {
    const sequelize = getSequelize();

    if (!sequelize) {
      console.log('Database not ready, skipping model initialization');
      return null;
    }

    // Initialize models
    const User = getUserModel();
    const Lead = getLeadModel();

    // Setup associations
    User.hasMany(Lead, {
      foreignKey: 'assigned_to',
      as: 'assignedLeads'
    });

    Lead.belongsTo(User, {
      foreignKey: 'assigned_to',
      as: 'assignedUser'
    });

    console.log('Models initialized and associations setup complete');

    return { User, Lead };
  } catch (error) {
    console.log('Model initialization skipped:', error.message);
    return null;
  }
};

// Get models (lazy initialization)
const getModels = () => {
  const sequelize = getSequelize();
  if (!sequelize) {
    return null;
  }

  // Return existing models if already initialized
  if (sequelize.models.User && sequelize.models.Lead) {
    return {
      User: sequelize.models.User,
      Lead: sequelize.models.Lead
    };
  }

  // Initialize models if not already done
  return initializeModels();
};

module.exports = {
  getUserModel,
  getLeadModel,
  initializeModels,
  getModels
};
