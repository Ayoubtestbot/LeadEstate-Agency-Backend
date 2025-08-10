const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const router = express.Router();

const { pool } = require('../config/database');
const logger = require('../utils/logger');

// POST /api/auth/trial-signup - Free trial registration
router.post('/trial-signup', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('firstName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name is required and must be less than 50 characters'),
  body('lastName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name is required and must be less than 50 characters'),
  body('companyName')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Company name must be less than 100 characters')
], async (req, res) => {
  try {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password, firstName, lastName, companyName } = req.body;

    // Check if user already exists
    const existingUserQuery = await pool.query(
      'SELECT id, email, subscription_status FROM users WHERE email = $1',
      [email]
    );

    if (existingUserQuery.rows.length > 0) {
      const existingUser = existingUserQuery.rows[0];
      
      // If user exists but trial expired, allow new trial
      if (existingUser.subscription_status === 'expired') {
        return res.status(409).json({
          success: false,
          message: 'Account exists but trial expired. Please contact support to reactivate.',
          code: 'TRIAL_EXPIRED'
        });
      }
      
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists',
        code: 'EMAIL_EXISTS'
      });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Generate unique agency ID for trial user
    const crypto = require('crypto');
    const agencyId = crypto.randomUUID();

    // Create user with trial status
    const userId = crypto.randomUUID();
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 14); // 14-day trial

    console.log('🔍 Creating trial user:', { email, firstName, lastName, companyName });

    const userResult = await pool.query(`
      INSERT INTO users (
        id, email, password_hash, first_name, last_name, role, status,
        agency_id, subscription_status, trial_end_date, plan_name,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      RETURNING id, email, first_name, last_name, role, agency_id, subscription_status, trial_end_date
    `, [
      userId,
      email,
      hashedPassword,
      firstName,
      lastName,
      'manager', // Trial users start as managers
      'active',
      agencyId,
      'trial',
      trialEndDate,
      'starter'
    ]);

    console.log('✅ User created successfully:', userResult.rows[0]);

    const newUser = userResult.rows[0];

    // Create agency record for the trial user
    console.log('🔍 Creating agency:', { agencyId, companyName, email, userId });

    await pool.query(`
      INSERT INTO agencies (
        id, name, email, status, settings, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
    `, [
      agencyId,
      companyName || `${firstName} ${lastName}'s Agency`,
      email,
      'active',
      JSON.stringify({
        trial: true,
        plan: 'starter',
        features: {
          whatsapp: false,
          analytics: 'basic',
          branding: 'none',
          api_access: false
        }
      })
    ]);

    console.log('✅ Agency created successfully');

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: newUser.id,
        email: newUser.email,
        role: newUser.role,
        agencyId: newUser.agency_id,
        subscriptionStatus: 'trial',
        trialEndDate: trialEndDate.toISOString()
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' } // Longer expiry for trial users
    );

    // Log successful trial signup
    logger.info(`New trial signup: ${email} (${firstName} ${lastName})`);

    // Calculate trial days remaining
    const daysRemaining = Math.ceil((trialEndDate - new Date()) / (1000 * 60 * 60 * 24));

    res.status(201).json({
      success: true,
      message: 'Trial account created successfully',
      data: {
        user: {
          id: newUser.id,
          email: newUser.email,
          firstName: newUser.first_name,
          lastName: newUser.last_name,
          role: newUser.role,
          agencyId: newUser.agency_id
        },
        subscription: {
          status: 'trial',
          plan: 'starter',
          trialEndDate: trialEndDate.toISOString(),
          daysRemaining,
          features: {
            whatsapp: false,
            analytics: 'basic',
            branding: 'none',
            api_access: false
          }
        },
        token
      }
    });

  } catch (error) {
    logger.error('Trial signup error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to create trial account. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/auth/trial-status - Check trial status for current user
router.get('/trial-status', async (req, res) => {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'No authorization token provided'
      });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get current subscription status
    const userQuery = await pool.query(`
      SELECT 
        u.id, u.email, u.first_name, u.last_name, u.subscription_status, u.trial_end_date, u.plan_name
      FROM users u
      WHERE u.id = $1
    `, [decoded.userId]);

    if (userQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userQuery.rows[0];
    const trialEndDate = user.trial_end_date;
    const isTrialActive = user.subscription_status === 'trial';
    
    let daysRemaining = 0;
    let trialExpired = false;

    if (trialEndDate && isTrialActive) {
      const now = new Date();
      const endDate = new Date(trialEndDate);
      const diffTime = endDate - now;
      daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      trialExpired = daysRemaining <= 0;
    }

    res.json({
      success: true,
      data: {
        userId: user.id,
        email: user.email,
        subscriptionStatus: user.subscription_status,
        planName: user.plan_name,
        isTrial: isTrialActive,
        trialEndDate: trialEndDate,
        daysRemaining: Math.max(0, daysRemaining),
        trialExpired,
        needsUpgrade: trialExpired && isTrialActive
      }
    });

  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    logger.error('Trial status check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check trial status'
    });
  }
});

module.exports = router;
