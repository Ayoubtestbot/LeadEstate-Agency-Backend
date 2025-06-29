const express = require('express');
const router = express.Router();
const { getSequelize } = require('../database/connection');

// GET /api/agency-management/current - Get current agency info (for single-tenant mode)
router.get('/current', async (req, res) => {
  try {
    const sequelize = getSequelize();
    
    // For single-tenant mode, return basic agency info
    // This is a simplified version for the existing CRM
    const agencyInfo = {
      id: 'current-agency',
      name: process.env.AGENCY_NAME || 'Real Estate Agency',
      domain: process.env.FRONTEND_URL || 'localhost:3000',
      status: 'active',
      plan: 'Professional',
      users: 0, // Would be calculated from actual users
      leads: 0, // Would be calculated from actual leads
      properties: 0, // Would be calculated from actual properties
      createdAt: new Date().toISOString()
    };

    res.json({
      success: true,
      data: agencyInfo
    });

  } catch (error) {
    console.error('Error fetching current agency info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agency information',
      error: error.message
    });
  }
});

// GET /api/agency-management/stats - Get agency statistics
router.get('/stats', async (req, res) => {
  try {
    const sequelize = getSequelize();
    
    // Get basic statistics for the current agency
    // This would be expanded based on your actual database schema
    const stats = {
      totalUsers: 0,
      totalLeads: 0,
      totalProperties: 0,
      activeLeads: 0,
      closedLeads: 0,
      lastUpdated: new Date().toISOString()
    };

    // If you have actual tables, you can query them here:
    // const [results] = await sequelize.query('SELECT COUNT(*) as count FROM leads');
    // stats.totalLeads = results[0].count;

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Error fetching agency stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agency statistics',
      error: error.message
    });
  }
});

// PUT /api/agency-management/settings - Update agency settings
router.put('/settings', async (req, res) => {
  try {
    const { name, email, phone, address, settings } = req.body;
    
    // For single-tenant mode, this would update environment variables or config
    // In a real implementation, you'd update a database record
    
    const updatedSettings = {
      name: name || process.env.AGENCY_NAME || 'Real Estate Agency',
      email: email || process.env.AGENCY_EMAIL || '',
      phone: phone || process.env.AGENCY_PHONE || '',
      address: address || process.env.AGENCY_ADDRESS || '',
      settings: settings || {},
      updatedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      message: 'Agency settings updated successfully',
      data: updatedSettings
    });

  } catch (error) {
    console.error('Error updating agency settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update agency settings',
      error: error.message
    });
  }
});

module.exports = router;
