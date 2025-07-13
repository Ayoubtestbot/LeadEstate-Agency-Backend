const { DataTypes } = require('sequelize');
const { getSequelize } = require('../database/connection');

// Lazy initialization function
const getLeadAssignmentHistoryModel = () => {
  const sequelize = getSequelize();
  if (!sequelize) {
    throw new Error('Database not initialized');
  }

  // Check if model is already defined
  if (sequelize.models.LeadAssignmentHistory) {
    return sequelize.models.LeadAssignmentHistory;
  }

  const LeadAssignmentHistory = sequelize.define('LeadAssignmentHistory', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    lead_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'leads',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    from_agent_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    from_agent_name: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        len: [0, 100]
      }
    },
    to_agent_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    to_agent_name: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        len: [0, 100]
      }
    },
    changed_by_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    changed_by_name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [1, 100]
      }
    },
    reason: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        len: [0, 500]
      }
    },
    action_type: {
      type: DataTypes.ENUM('assigned', 'reassigned', 'unassigned'),
      allowNull: false,
      defaultValue: 'assigned'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'lead_assignment_history',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['lead_id']
      },
      {
        fields: ['from_agent_id']
      },
      {
        fields: ['to_agent_id']
      },
      {
        fields: ['changed_by_id']
      },
      {
        fields: ['created_at']
      },
      {
        fields: ['action_type']
      }
    ]
  });

  return LeadAssignmentHistory;
};

module.exports = { getLeadAssignmentHistoryModel };
