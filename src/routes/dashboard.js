const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// GET /api/dashboard - Main dashboard endpoint for agency frontend
router.get('/', async (req, res) => {
  try {
    console.log('📊 Dashboard endpoint called for user:', req.user?.userId);
    
    // Get user info from auth middleware
    const userId = req.user?.userId;
    const agencyId = req.user?.agencyId;

    console.log('📊 Dashboard request for user:', userId, 'agency:', agencyId);
    console.log('📊 Full user object:', JSON.stringify(req.user, null, 2));

    if (!userId || !agencyId) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'User or agency information not found',
          code: 'AUTHENTICATION_ERROR',
          statusCode: 401
        }
      });
    }

    // Initialize dashboard data
    let dashboardData = {
      stats: {
        totalLeads: 0,
        totalProperties: 0,
        totalTeamMembers: 1,
        conversionRate: 0,
        closedWonLeads: 0,
        availableProperties: 0
      },
      recentLeads: [],
      recentProperties: [],
      teamMembers: [],
      activities: [],
      performance: {
        thisMonth: { leads: 0, properties: 0, conversions: 0 },
        lastMonth: { leads: 0, properties: 0, conversions: 0 }
      }
    };

    try {
      // Get leads data for this agency - use same logic as leads endpoint
      const leadsResult = await pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'closed_won' THEN 1 END) as closed_won,
          COUNT(CASE WHEN created_at >= date_trunc('month', CURRENT_DATE) THEN 1 END) as this_month
        FROM leads
        WHERE agency_id = $1 OR assigned_to = $2
      `, [agencyId, userId]);

      if (leadsResult.rows.length > 0) {
        const leadStats = leadsResult.rows[0];
        dashboardData.stats.totalLeads = parseInt(leadStats.total) || 0;
        dashboardData.stats.closedWonLeads = parseInt(leadStats.closed_won) || 0;
        dashboardData.performance.thisMonth.leads = parseInt(leadStats.this_month) || 0;
        
        if (dashboardData.stats.totalLeads > 0) {
          dashboardData.stats.conversionRate = ((dashboardData.stats.closedWonLeads / dashboardData.stats.totalLeads) * 100).toFixed(1);
        }
      }

      // Get recent leads - use same logic as leads endpoint
      const recentLeadsResult = await pool.query(`
        SELECT id, first_name, last_name, email, phone, status, source, created_at
        FROM leads
        WHERE agency_id = $1 OR assigned_to = $2
        ORDER BY created_at DESC
        LIMIT 10
      `, [agencyId, userId]);

      dashboardData.recentLeads = recentLeadsResult.rows.map(lead => ({
        id: lead.id,
        firstName: lead.first_name,
        lastName: lead.last_name,
        email: lead.email,
        phone: lead.phone,
        status: lead.status,
        source: lead.source,
        createdAt: lead.created_at
      }));

    } catch (leadsError) {
      console.log('Note: Leads table may not exist yet:', leadsError.message);
    }

    try {
      // Get properties data for this agency
      const propertiesResult = await pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'available' THEN 1 END) as available,
          COUNT(CASE WHEN created_at >= date_trunc('month', CURRENT_DATE) THEN 1 END) as this_month
        FROM properties 
        WHERE agency_id = $1
      `, [agencyId]);

      if (propertiesResult.rows.length > 0) {
        const propStats = propertiesResult.rows[0];
        dashboardData.stats.totalProperties = parseInt(propStats.total) || 0;
        dashboardData.stats.availableProperties = parseInt(propStats.available) || 0;
        dashboardData.performance.thisMonth.properties = parseInt(propStats.this_month) || 0;
      }

      // Get recent properties - use same logic as properties endpoint
      const recentPropsResult = await pool.query(`
        SELECT id, title, type, price, status, address, created_at
        FROM properties
        WHERE agency_id = $1 OR listed_by = $2
        ORDER BY created_at DESC
        LIMIT 10
      `, [agencyId, userId]);

      dashboardData.recentProperties = recentPropsResult.rows.map(prop => ({
        id: prop.id,
        title: prop.title,
        type: prop.type,
        price: prop.price,
        status: prop.status,
        address: prop.address,
        createdAt: prop.created_at
      }));

    } catch (propertiesError) {
      console.log('Note: Properties table may not exist yet:', propertiesError.message);
    }

    try {
      // Get team members for this agency
      const teamResult = await pool.query(`
        SELECT id, first_name, last_name, email, role, status, last_login_at
        FROM users 
        WHERE agency_id = $1 AND status = 'active'
        ORDER BY created_at DESC
      `, [agencyId]);

      dashboardData.teamMembers = teamResult.rows.map(member => ({
        id: member.id,
        firstName: member.first_name,
        lastName: member.last_name,
        email: member.email,
        role: member.role,
        status: member.status,
        lastLogin: member.last_login_at
      }));

      dashboardData.stats.totalTeamMembers = teamResult.rows.length;

    } catch (teamError) {
      console.log('Note: Team data query failed:', teamError.message);
    }

    // Add trial information if user is on trial
    if (req.user?.subscriptionStatus === 'trial') {
      dashboardData.trial = {
        status: 'trial',
        endDate: req.user?.trialEndDate,
        daysRemaining: req.user?.trialEndDate ? 
          Math.max(0, Math.ceil((new Date(req.user.trialEndDate) - new Date()) / (1000 * 60 * 60 * 24))) : 0,
        plan: req.user?.planName || 'starter'
      };
    }

    console.log('✅ Dashboard data loaded successfully:', {
      userId,
      agencyId,
      totalLeads: dashboardData.stats.totalLeads,
      totalProperties: dashboardData.stats.totalProperties,
      teamMembers: dashboardData.stats.totalTeamMembers,
      trialStatus: dashboardData.trial?.status
    });

    // Format response for frontend compatibility - populate the data arrays
    const frontendCompatibleData = {
      ...dashboardData,
      data: {
        leads: dashboardData.recentLeads || [],
        properties: dashboardData.recentProperties || [],
        team: dashboardData.teamMembers || []
      }
    };

    console.log('📊 Dashboard data prepared:');
    console.log('- Leads:', frontendCompatibleData.data.leads.length);
    console.log('- Properties:', frontendCompatibleData.data.properties.length);
    console.log('- Team:', frontendCompatibleData.data.team.length);

    res.json({
      success: true,
      data: frontendCompatibleData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Dashboard error:', error);
    
    // Return fallback data on error with frontend-compatible structure
    const fallbackData = {
      stats: {
        totalLeads: 0,
        totalProperties: 0,
        totalTeamMembers: 1,
        conversionRate: 0,
        closedWonLeads: 0,
        availableProperties: 0
      },
      recentLeads: [],
      recentProperties: [],
      teamMembers: [],
      activities: [],
      performance: {
        thisMonth: { leads: 0, properties: 0, conversions: 0 },
        lastMonth: { leads: 0, properties: 0, conversions: 0 }
      },
      trial: req.user?.subscriptionStatus === 'trial' ? {
        status: 'trial',
        endDate: req.user?.trialEndDate,
        daysRemaining: req.user?.trialEndDate ?
          Math.max(0, Math.ceil((new Date(req.user.trialEndDate) - new Date()) / (1000 * 60 * 60 * 24))) : 0,
        plan: req.user?.planName || 'starter'
      } : null,
      data: {
        leads: [],
        properties: [],
        team: []
      }
    };

    res.json({
      success: true,
      data: fallbackData,
      timestamp: new Date().toISOString(),
      fallback: true,
      error: error.message
    });
  }
});

// GET /api/dashboard/stats - Dashboard stats endpoint (alternative)
router.get('/stats', async (req, res) => {
  try {
    // Redirect to main dashboard endpoint
    const dashboardResponse = await fetch(`${req.protocol}://${req.get('host')}/api/dashboard`, {
      headers: req.headers
    });
    
    const dashboardData = await dashboardResponse.json();
    
    res.json({
      success: true,
      data: dashboardData.data?.stats || {},
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to load dashboard stats',
        code: 'DASHBOARD_ERROR',
        statusCode: 500
      }
    });
  }
});

module.exports = router;
