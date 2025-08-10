const express = require('express');
const router = express.Router();
const { HTTP_STATUS } = require('../utils/constants');
const { formatResponse } = require('../utils/helpers');

// GET /api/users - Get all users
router.get('/', async (req, res) => {
  try {
    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, 'Users retrieved successfully', [])
    );
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      formatResponse(false, 'Failed to retrieve users')
    );
  }
});

// GET /api/users/profile - Get current user profile
router.get('/profile', async (req, res) => {
  try {
    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, 'Profile retrieved successfully', req.user)
    );
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      formatResponse(false, 'Failed to retrieve profile')
    );
  }
});

module.exports = router;
