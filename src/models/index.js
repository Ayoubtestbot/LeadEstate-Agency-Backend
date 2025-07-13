const { getSequelize } = require('../database/connection');

// Import model factory functions
const getUserModel = require('./User');
const getLeadModel = require('./Lead');
const { getLeadNoteModel } = require('./LeadNote');
const { getLeadAssignmentHistoryModel } = require('./LeadAssignmentHistory');

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
    const LeadNote = getLeadNoteModel();
    const LeadAssignmentHistory = getLeadAssignmentHistoryModel();

    // Setup associations
    User.hasMany(Lead, {
      foreignKey: 'assigned_to',
      as: 'assignedLeads'
    });

    Lead.belongsTo(User, {
      foreignKey: 'assigned_to',
      as: 'assignedUser'
    });

    // Lead Notes associations
    Lead.hasMany(LeadNote, {
      foreignKey: 'lead_id',
      as: 'notes'
    });

    LeadNote.belongsTo(Lead, {
      foreignKey: 'lead_id',
      as: 'lead'
    });

    LeadNote.belongsTo(User, {
      foreignKey: 'created_by',
      as: 'creator'
    });

    // Lead Assignment History associations
    Lead.hasMany(LeadAssignmentHistory, {
      foreignKey: 'lead_id',
      as: 'assignmentHistory'
    });

    LeadAssignmentHistory.belongsTo(Lead, {
      foreignKey: 'lead_id',
      as: 'lead'
    });

    LeadAssignmentHistory.belongsTo(User, {
      foreignKey: 'from_agent_id',
      as: 'fromAgent'
    });

    LeadAssignmentHistory.belongsTo(User, {
      foreignKey: 'to_agent_id',
      as: 'toAgent'
    });

    LeadAssignmentHistory.belongsTo(User, {
      foreignKey: 'changed_by_id',
      as: 'changedBy'
    });

    console.log('Models initialized and associations setup complete');

    return { User, Lead, LeadNote, LeadAssignmentHistory };
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
      Lead: sequelize.models.Lead,
      LeadNote: sequelize.models.LeadNote,
      LeadAssignmentHistory: sequelize.models.LeadAssignmentHistory
    };
  }

  // Initialize models if not already done
  return initializeModels();
};

module.exports = {
  getUserModel,
  getLeadModel,
  getLeadNoteModel,
  getLeadAssignmentHistoryModel,
  initializeModels,
  getModels
};
