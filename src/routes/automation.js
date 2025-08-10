const express = require('express');
const router = express.Router();
const { HTTP_STATUS } = require('../utils/constants');
const { formatResponse } = require('../utils/helpers');

// GET /api/automation - Get automation rules
router.get('/', async (req, res) => {
  try {
    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, 'Automation rules retrieved successfully', [])
    );
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      formatResponse(false, 'Failed to retrieve automation rules')
    );
  }
});

module.exports = router;
