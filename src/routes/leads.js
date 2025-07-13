const express = require('express');
const router = express.Router();
const { HTTP_STATUS } = require('../utils/constants');
const { formatResponse } = require('../utils/helpers');
const { getModels } = require('../models');

// GET /api/leads - Get all leads with notes and assignment history
router.get('/', async (req, res) => {
  try {
    const models = getModels();
    if (!models) {
      // Fallback data when database is not available
      const mockLeads = [
        {
          id: '1',
          name: 'John Doe',
          email: 'john@example.com',
          phone: '+1234567890',
          city: 'New York',
          status: 'new',
          source: 'website',
          propertyType: 'apartment',
          budget: '$200,000 - $300,000',
          assignedTo: 'Sarah Johnson',
          assignedAgent: 'Sarah Johnson',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: '2',
          name: 'Jane Smith',
          email: 'jane@example.com',
          phone: '+1987654321',
          city: 'Los Angeles',
          status: 'qualified',
          source: 'facebook',
          propertyType: 'house',
          budget: '$400,000 - $500,000',
          assignedTo: 'Mike Chen',
          assignedAgent: 'Mike Chen',
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];
      
      return res.status(HTTP_STATUS.OK).json(
        formatResponse(true, 'Leads retrieved successfully (mock data)', mockLeads)
      );
    }

    const { Lead, LeadNote, LeadAssignmentHistory } = models;
    
    const leads = await Lead.findAll({
      include: [
        {
          model: LeadNote,
          as: 'notes',
          limit: 5,
          order: [['created_at', 'DESC']]
        },
        {
          model: LeadAssignmentHistory,
          as: 'assignmentHistory',
          limit: 10,
          order: [['created_at', 'DESC']]
        }
      ],
      order: [['created_at', 'DESC']]
    });

    // Transform data to match frontend expectations
    const transformedLeads = leads.map(lead => ({
      id: lead.id,
      name: `${lead.first_name} ${lead.last_name || ''}`.trim(),
      email: lead.email,
      phone: lead.phone,
      whatsapp: lead.whatsapp,
      city: lead.city,
      address: lead.address,
      status: lead.status,
      source: lead.source,
      propertyType: lead.property_type,
      budget: lead.budget_min && lead.budget_max ? 
        `$${lead.budget_min.toLocaleString()} - $${lead.budget_max.toLocaleString()}` :
        lead.budget_min ? `$${lead.budget_min.toLocaleString()}+` : null,
      bedrooms: lead.bedrooms,
      bathrooms: lead.bathrooms,
      notes: lead.notes,
      assignedTo: lead.assigned_to,
      assignedAgent: lead.assigned_to, // For compatibility
      createdAt: lead.created_at,
      updatedAt: lead.updated_at,
      lastContactDate: lead.last_contact_date,
      interestedProperties: lead.interested_properties || []
    }));

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, 'Leads retrieved successfully', transformedLeads)
    );
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      formatResponse(false, 'Failed to retrieve leads', null, error.message)
    );
  }
});

// GET /api/leads/:id - Get single lead with full details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const models = getModels();
    
    if (!models) {
      return res.status(HTTP_STATUS.OK).json(
        formatResponse(true, 'Lead retrieved successfully (mock)', {
          id,
          name: 'John Doe',
          email: 'john@example.com',
          phone: '+1234567890',
          status: 'new',
          source: 'website'
        })
      );
    }

    const { Lead, LeadNote, LeadAssignmentHistory } = models;
    
    const lead = await Lead.findByPk(id, {
      include: [
        {
          model: LeadNote,
          as: 'notes',
          order: [['created_at', 'DESC']]
        },
        {
          model: LeadAssignmentHistory,
          as: 'assignmentHistory',
          order: [['created_at', 'DESC']]
        }
      ]
    });

    if (!lead) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(
        formatResponse(false, 'Lead not found')
      );
    }

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, 'Lead retrieved successfully', lead)
    );
  } catch (error) {
    console.error('Error fetching lead:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      formatResponse(false, 'Failed to retrieve lead', null, error.message)
    );
  }
});

// GET /api/leads/:id/notes - Get all notes for a lead
router.get('/:id/notes', async (req, res) => {
  try {
    const { id } = req.params;
    const models = getModels();
    
    if (!models) {
      // Mock notes data
      const mockNotes = [
        {
          id: '1',
          content: 'Initial contact made via phone. Client interested in 3-bedroom apartments.',
          type: 'note',
          createdBy: 'Sarah Johnson',
          createdAt: new Date().toISOString()
        },
        {
          id: '2',
          content: 'Follow-up call scheduled for tomorrow at 2 PM.',
          type: 'note',
          createdBy: 'Sarah Johnson',
          createdAt: new Date(Date.now() - 3600000).toISOString()
        }
      ];
      
      return res.status(HTTP_STATUS.OK).json(
        formatResponse(true, 'Notes retrieved successfully (mock)', mockNotes)
      );
    }

    const { LeadNote } = models;
    
    const notes = await LeadNote.findAll({
      where: { lead_id: id },
      order: [['created_at', 'DESC']]
    });

    // Transform notes for frontend
    const transformedNotes = notes.map(note => ({
      id: note.id,
      content: note.content,
      type: note.type,
      createdBy: note.created_by_name,
      createdAt: note.created_at,
      isPrivate: note.is_private,
      metadata: note.metadata
    }));

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, 'Notes retrieved successfully', transformedNotes)
    );
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      formatResponse(false, 'Failed to retrieve notes', null, error.message)
    );
  }
});

// POST /api/leads/:id/notes - Add a new note to a lead
router.post('/:id/notes', async (req, res) => {
  try {
    const { id } = req.params;
    const { content, type = 'note', createdBy, isPrivate = false } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        formatResponse(false, 'Note content is required')
      );
    }

    const models = getModels();
    
    if (!models) {
      // Mock response when database is not available
      const mockNote = {
        id: Date.now().toString(),
        content: content.trim(),
        type,
        createdBy: createdBy || 'Unknown User',
        createdAt: new Date().toISOString(),
        isPrivate
      };
      
      return res.status(HTTP_STATUS.CREATED).json(
        formatResponse(true, 'Note added successfully (mock)', mockNote)
      );
    }

    const { LeadNote, Lead } = models;
    
    // Verify lead exists
    const lead = await Lead.findByPk(id);
    if (!lead) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(
        formatResponse(false, 'Lead not found')
      );
    }

    // Create the note
    const note = await LeadNote.create({
      lead_id: id,
      content: content.trim(),
      type,
      created_by_name: createdBy || 'Unknown User',
      is_private: isPrivate
    });

    // Transform for frontend
    const transformedNote = {
      id: note.id,
      content: note.content,
      type: note.type,
      createdBy: note.created_by_name,
      createdAt: note.created_at,
      isPrivate: note.is_private
    };

    res.status(HTTP_STATUS.CREATED).json(
      formatResponse(true, 'Note added successfully', transformedNote)
    );
  } catch (error) {
    console.error('Error adding note:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      formatResponse(false, 'Failed to add note', null, error.message)
    );
  }
});

// GET /api/leads/:id/assignee-history - Get assignment history for a lead
router.get('/:id/assignee-history', async (req, res) => {
  try {
    const { id } = req.params;
    const models = getModels();
    
    if (!models) {
      // Mock assignment history data
      const mockHistory = [
        {
          id: '1',
          fromAgent: null,
          toAgent: 'Sarah Johnson',
          changedAt: new Date().toISOString(),
          changedBy: 'System',
          reason: 'Initial assignment'
        }
      ];
      
      return res.status(HTTP_STATUS.OK).json(
        formatResponse(true, 'Assignment history retrieved successfully (mock)', mockHistory)
      );
    }

    const { LeadAssignmentHistory } = models;
    
    const history = await LeadAssignmentHistory.findAll({
      where: { lead_id: id },
      order: [['created_at', 'DESC']]
    });

    // Transform history for frontend
    const transformedHistory = history.map(record => ({
      id: record.id,
      fromAgent: record.from_agent_name,
      toAgent: record.to_agent_name,
      changedAt: record.created_at,
      changedBy: record.changed_by_name,
      reason: record.reason,
      actionType: record.action_type
    }));

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, 'Assignment history retrieved successfully', transformedHistory)
    );
  } catch (error) {
    console.error('Error fetching assignment history:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      formatResponse(false, 'Failed to retrieve assignment history', null, error.message)
    );
  }
});

// POST /api/leads - Create new lead
router.post('/', async (req, res) => {
  try {
    const models = getModels();
    
    if (!models) {
      return res.status(HTTP_STATUS.CREATED).json(
        formatResponse(true, 'Lead created successfully (mock)', { id: Date.now(), ...req.body })
      );
    }

    const { Lead } = models;
    
    // Create lead logic here
    const lead = await Lead.create(req.body);
    
    res.status(HTTP_STATUS.CREATED).json(
      formatResponse(true, 'Lead created successfully', lead)
    );
  } catch (error) {
    console.error('Error creating lead:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      formatResponse(false, 'Failed to create lead', null, error.message)
    );
  }
});

module.exports = router;
