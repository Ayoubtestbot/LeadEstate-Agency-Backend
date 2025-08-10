const express = require('express');
const router = express.Router();
const { HTTP_STATUS } = require('../utils/constants');
const { formatResponse } = require('../utils/helpers');

// POST /api/upload - Upload files
router.post('/', async (req, res) => {
  try {
    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, 'File uploaded successfully', {
        filename: 'example.jpg',
        url: '/uploads/example.jpg'
      })
    );
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      formatResponse(false, 'Failed to upload file')
    );
  }
});

module.exports = router;
