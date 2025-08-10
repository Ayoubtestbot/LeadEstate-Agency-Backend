const express = require('express');
const router = express.Router();
const { HTTP_STATUS } = require('../utils/constants');
const { formatResponse } = require('../utils/helpers');
const { checkSubscriptionStatus, checkUsageLimit, addTrialInfo } = require('../middleware/subscription');

// GET /api/leads - Get all leads (with subscription check and trial info)
router.get('/', checkSubscriptionStatus, addTrialInfo, async (req, res) => {
  try {
    // Add trial info to response if available
    const responseData = {
      leads: [],
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
