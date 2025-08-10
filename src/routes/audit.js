const express = require('express');
const router = express.Router();
const auditService = require('../services/auditService');

// Simple audit routes for single-tenant mode
// These are simplified versions that work with your existing system

// GET /api/audit/logs - Get audit logs (placeholder)
router.get('/logs', async (req, res) => {
  try {
    const {
      userId,
      action,
      resourceType,
      startDate,
      endDate,
      limit = 100,
      offset = 0
    } = req.query;

    // For single-tenant mode, return empty logs
    const result = await auditService.getAuditLogs({
      userId,
      action,
      resourceType,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: result.data,
      count: result.count || 0,
      filters: {
        userId,
        action,
        resourceType,
        startDate,
        endDate,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch audit logs',
      error: error.message
    });
  }
});

// GET /api/audit/stats - Get audit statistics (placeholder)
router.get('/stats', async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const result = await auditService.getAuditStats();

    res.json({
      success: true,
      data: result.data,
      period: `${days} days`
    });

  } catch (error) {
    console.error('Error fetching audit statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch audit statistics',
      error: error.message
    });
  }
});

// GET /api/audit/user/:userId - Get audit logs for specific user (placeholder)
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, offset = 0, days = 30 } = req.query;

    const result = await auditService.getAuditLogs({
      userId,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: result.data,
      count: result.count || 0,
      userId,
      period: `${days} days`
    });

  } catch (error) {
    console.error('Error fetching user audit logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user audit logs',
      error: error.message
    });
  }
});

// POST /api/audit/export - Export audit logs (placeholder)
router.post('/export', async (req, res) => {
  try {
    const {
      filters = {},
      format = 'json'
    } = req.body;

    // Validate format
    if (!['json', 'csv'].includes(format)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid format. Must be "json" or "csv"'
      });
    }

    const result = await auditService.exportAuditLogs(filters, format);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to export audit logs',
        error: result.error
      });
    }

    // Set appropriate headers for download
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `audit_logs_${timestamp}.${format}`;

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(''); // Empty CSV for single-tenant mode
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.json({
        success: true,
        data: result.data,
        exportedAt: new Date().toISOString(),
        format: format
      });
    }

    // Log the export action
    await auditService.log({
      action: 'data_export',
      resourceType: 'audit_logs',
      details: { format, filters, recordCount: result.data.length }
    });

  } catch (error) {
    console.error('Error exporting audit logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export audit logs',
      error: error.message
    });
  }
});

// GET /api/audit/actions - Get available audit actions (placeholder)
router.get('/actions', (req, res) => {
  try {
    const actions = Object.values(auditService.actionTypes || {});
    
    res.json({
      success: true,
      data: actions,
      count: actions.length
    });

  } catch (error) {
    console.error('Error fetching audit actions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch audit actions',
      error: error.message
    });
  }
});

module.exports = router;
