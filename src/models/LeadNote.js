const { DataTypes } = require('sequelize');
const { getSequelize } = require('../database/connection');

// Lazy initialization function
const getLeadNoteModel = () => {
  const sequelize = getSequelize();
  if (!sequelize) {
    throw new Error('Database not initialized');
  }

  // Check if model is already defined
  if (sequelize.models.LeadNote) {
    return sequelize.models.LeadNote;
  }

  const LeadNote = sequelize.define('LeadNote', {
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
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        len: [1, 5000] // Max 5000 characters
      }
    },
    type: {
      type: DataTypes.ENUM('note', 'comment', 'system', 'call', 'email', 'meeting'),
      allowNull: false,
      defaultValue: 'note'
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    created_by_name: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        len: [1, 100]
      }
    },
    is_private: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'lead_notes',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['lead_id']
      },
      {
        fields: ['created_by']
      },
      {
        fields: ['type']
      },
      {
        fields: ['created_at']
      }
    ]
  });

  return LeadNote;
};

module.exports = { getLeadNoteModel };
