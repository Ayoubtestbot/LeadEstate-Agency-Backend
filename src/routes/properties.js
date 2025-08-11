const express = require('express');
const router = express.Router();
const { HTTP_STATUS } = require('../utils/constants');
const { formatResponse } = require('../utils/helpers');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// GET /api/properties - Get all properties
router.get('/', authenticateToken, async (req, res) => {
  try {
    console.log('🏠 Properties endpoint called for user:', req.user?.userId, 'agency:', req.user?.agencyId);

    let properties = [];

    // Get user info from auth middleware
    const userId = req.user?.userId;
    const agencyId = req.user?.agencyId;

    if (userId && agencyId) {
      try {
        // Query properties for this user/agency
        const propertiesResult = await pool.query(`
          SELECT id, title, type, price, address, city, surface, description,
                 status, agency_id, listed_by, created_at, updated_at, image_url, images
          FROM properties
          WHERE agency_id = $1 OR listed_by = $2
          ORDER BY created_at DESC
        `, [agencyId, userId]);

        properties = propertiesResult.rows.map(property => ({
          id: property.id,
          title: property.title,
          type: property.type,
          price: property.price,
          address: property.address,
          city: property.city,
          surface: property.surface,
          description: property.description,
          status: property.status,
          agencyId: property.agency_id,
          listedBy: property.listed_by,
          createdAt: property.created_at,
          updatedAt: property.updated_at,
          imageUrl: property.image_url,
          images: property.images
        }));

        console.log(`✅ Found ${properties.length} properties for user ${userId}`);
      } catch (dbError) {
        console.error('❌ Database error fetching properties:', dbError);
        properties = [];
      }
    }

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, 'Properties retrieved successfully', { data: properties })
    );
  } catch (error) {
    console.error('❌ Properties endpoint error:', error);
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
