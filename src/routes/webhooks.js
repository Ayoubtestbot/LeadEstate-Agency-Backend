const express = require('express');
const router = express.Router();
const { HTTP_STATUS } = require('../utils/constants');
const { formatResponse } = require('../utils/helpers');

// POST /webhooks/brevo - Brevo webhook
router.post('/brevo', async (req, res) => {
  try {
    console.log('Brevo webhook received:', req.body);
    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, 'Webhook processed successfully')
    );
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      formatResponse(false, 'Failed to process webhook')
    );
  }
});

// POST /webhooks/twilio - Twilio webhook
router.post('/twilio', async (req, res) => {
  try {
    console.log('Twilio webhook received:', req.body);
    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, 'Webhook processed successfully')
    );
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      formatResponse(false, 'Failed to process webhook')
    );
  }
});

module.exports = router;
