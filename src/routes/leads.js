const express = require('express');
const router = express.Router();
const { HTTP_STATUS } = require('../utils/constants');
const { formatResponse } = require('../utils/helpers');

// GET /api/leads - Get all leads
router.get('/', async (req, res) => {
  try {
    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, 'Leads retrieved successfully', [])
    );
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      formatResponse(false, 'Failed to retrieve leads')
    );
  }
});

// POST /api/leads - Create new lead
router.post('/', async (req, res) => {
  try {
    res.status(HTTP_STATUS.CREATED).json(
      formatResponse(true, 'Lead created successfully', { id: 1, ...req.body })
    );
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      formatResponse(false, 'Failed to create lead')
    );
  }
});

module.exports = router;
