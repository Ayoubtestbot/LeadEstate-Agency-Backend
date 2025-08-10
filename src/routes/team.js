const express = require('express');
const router = express.Router();
const { HTTP_STATUS } = require('../utils/constants');
const { formatResponse } = require('../utils/helpers');

// GET /api/team - Get team members
router.get('/', async (req, res) => {
  try {
    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, 'Team members retrieved successfully', [])
    );
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      formatResponse(false, 'Failed to retrieve team members')
    );
  }
});

module.exports = router;
