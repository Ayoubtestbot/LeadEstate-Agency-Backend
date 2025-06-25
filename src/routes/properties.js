const express = require('express');
const router = express.Router();
const { HTTP_STATUS } = require('../utils/constants');
const { formatResponse } = require('../utils/helpers');

// GET /api/properties - Get all properties
router.get('/', async (req, res) => {
  try {
    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, 'Properties retrieved successfully', [])
    );
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      formatResponse(false, 'Failed to retrieve properties')
    );
  }
});

// POST /api/properties - Create new property
router.post('/', async (req, res) => {
  try {
    res.status(HTTP_STATUS.CREATED).json(
      formatResponse(true, 'Property created successfully', { id: 1, ...req.body })
    );
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      formatResponse(false, 'Failed to create property')
    );
  }
});

module.exports = router;
