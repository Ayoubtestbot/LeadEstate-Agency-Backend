const express = require('express');
const router = express.Router();
const { HTTP_STATUS } = require('../utils/constants');
const { formatResponse } = require('../utils/helpers');
const { checkSubscriptionStatus, requireFeature } = require('../middleware/subscription');

// GET /api/integrations - Get integrations (with feature access control)
router.get('/', checkSubscriptionStatus, async (req, res) => {
  try {
    const integrations = {
      email: {
        provider: 'Brevo',
        status: 'connected',
        lastSync: new Date().toISOString(),
        available: true // Email is available for all plans
      }
    };

    // Only show WhatsApp if user has access to this feature
    if (req.subscription && req.subscription.features.whatsapp) {
      integrations.whatsapp = {
        provider: 'Twilio',
        status: 'connected',
        lastSync: new Date().toISOString(),
        available: true
      };
    } else {
      integrations.whatsapp = {
        available: false,
        requiresPlan: 'pro',
        message: 'WhatsApp integration requires Pro plan or higher'
      };
    }

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, 'Integrations retrieved successfully', integrations)
    );
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      formatResponse(false, 'Failed to retrieve integrations')
    );
  }
});

// POST /api/integrations/whatsapp - Configure WhatsApp (requires WhatsApp feature)
router.post('/whatsapp', checkSubscriptionStatus, requireFeature('whatsapp'), async (req, res) => {
  try {
    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, 'WhatsApp integration configured successfully', {
        provider: 'Twilio',
        status: 'connected'
      })
    );
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      formatResponse(false, 'Failed to configure WhatsApp integration')
    );
  }
});

module.exports = router;
