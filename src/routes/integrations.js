const express = require('express');
const router = express.Router();
const { HTTP_STATUS } = require('../utils/constants');
const { formatResponse } = require('../utils/helpers');

// GET /api/integrations - Get integrations
router.get('/', async (req, res) => {
  try {
    const integrations = {
      email: {
        provider: 'Brevo',
        status: 'connected',
        lastSync: new Date().toISOString()
      },
      whatsapp: {
        provider: 'Twilio',
        status: 'connected',
        lastSync: new Date().toISOString()
      }
    };
    
    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, 'Integrations retrieved successfully', integrations)
    );
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      formatResponse(false, 'Failed to retrieve integrations')
    );
  }
});

module.exports = router;
