const express = require('express');
const router = express.Router();
const { HTTP_STATUS } = require('../utils/constants');
const { formatResponse } = require('../utils/helpers');
const { pool } = require('../config/database');
// GET /api/team - Get team members
router.get('/', async (req, res) => {
  try {
    console.log('👥 Team endpoint called for user:', req.user?.userId, 'agency:', req.user?.agencyId);

    let teamMembers = [];

    // Get user info from auth middleware
    const userId = req.user?.userId;
    const agencyId = req.user?.agencyId;

    if (userId && agencyId) {
      try {
        // Query team members
        const teamResult = await pool.query(`
          SELECT id, name, email, phone, role, department, status,
                 joined_at, created_at, updated_at
          FROM team_members
          ORDER BY created_at DESC
        `);

        teamMembers = teamResult.rows.map(member => ({
          id: member.id,
          name: member.name,
          email: member.email,
          phone: member.phone,
          role: member.role,
          department: member.department,
          status: member.status,
          joinedAt: member.joined_at,
          createdAt: member.created_at,
          updatedAt: member.updated_at
        }));

        console.log(`✅ Found ${teamMembers.length} team members`);
      } catch (dbError) {
        console.error('❌ Database error fetching team members:', dbError);
        teamMembers = [];
      }
    }

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, 'Team members retrieved successfully', { data: teamMembers })
    );
  } catch (error) {
    console.error('❌ Team endpoint error:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      formatResponse(false, 'Failed to retrieve team members')
    );
  }
});

module.exports = router;
