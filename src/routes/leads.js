const express = require('express');
const router = express.Router();
const { HTTP_STATUS } = require('../utils/constants');
const { formatResponse } = require('../utils/helpers');
const { checkSubscriptionStatus, checkUsageLimit, addTrialInfo } = require('../middleware/subscription');
const { pool } = require('../config/database');
// GET /api/leads - Get all leads (with subscription check and trial info)
router.get('/', async (req, res) => {
  try {
    console.log('📋 Leads endpoint called for user:', req.user?.userId, 'agency:', req.user?.agencyId);

    let leads = [];

    // Get user info from auth middleware
    const userId = req.user?.userId;
    const agencyId = req.user?.agencyId;

    if (userId && agencyId) {
      try {
        // Query leads for this user/agency
        const leadsResult = await pool.query(`
          SELECT id, first_name, last_name, email, phone, whatsapp, status, source,
                 budget, notes, assigned_to, agency_id, created_at, updated_at, city, address
          FROM leads
          WHERE agency_id = $1 OR assigned_to = $2
          ORDER BY created_at DESC
        `, [agencyId, userId]);

        leads = leadsResult.rows.map(lead => ({
          id: lead.id,
          firstName: lead.first_name,
          lastName: lead.last_name,
          email: lead.email,
          phone: lead.phone,
          whatsapp: lead.whatsapp,
          status: lead.status,
          source: lead.source,
          budget: lead.budget,
          notes: lead.notes,
          assignedTo: lead.assigned_to,
          agencyId: lead.agency_id,
          createdAt: lead.created_at,
          updatedAt: lead.updated_at,
          city: lead.city,
          address: lead.address
        }));

        console.log(`✅ Found ${leads.length} leads for user ${userId}`);
      } catch (dbError) {
        console.error('❌ Database error fetching leads:', dbError);
        leads = [];
      }
    }

    // Add trial info to response if available
    const responseData = {
      data: leads,
      subscription: req.subscription ? {
        planName: req.subscription.planName,
        status: req.subscription.status,
        limits: req.subscription.limits
      } : null,
      trial: req.trialInfo || null
    };

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, 'Leads retrieved successfully', responseData)
    );
  } catch (error) {
    console.error('❌ Leads endpoint error:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      formatResponse(false, 'Failed to retrieve leads')
    );
  }
});

// POST /api/leads - Create new lead (with subscription and usage limit checks)
router.post('/', checkSubscriptionStatus, checkUsageLimit('leads'), async (req, res) => {
  try {
    // Usage info is available in req.usage.leads if limits apply
    const responseData = {
      lead: { id: 1, ...req.body },
      usage: req.usage ? req.usage.leads : null
    };

    res.status(HTTP_STATUS.CREATED).json(
      formatResponse(true, 'Lead created successfully', responseData)
    );
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      formatResponse(false, 'Failed to create lead')
    );
  }
});

module.exports = router;
