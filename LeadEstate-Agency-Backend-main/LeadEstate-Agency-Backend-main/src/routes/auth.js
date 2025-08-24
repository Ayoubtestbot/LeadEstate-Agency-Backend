const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { getModels } = require('../models');
const brevoService = require('../services/brevoService');
const trialEmailService = require('../services/trialEmailService');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

const router = express.Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: 900
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      role: user.role,
      agency_id: user.agency_id 
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// Generate refresh token
const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user.id, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );
};

// Trial signup endpoint
router.post('/trial-signup',
  authLimiter,
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email'),
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
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Company name is required and must be less than 100 characters')
  ],
  async (req, res) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { email, password, firstName, lastName, companyName } = req.body;

      logger.info('ðŸ” Creating trial user:', {
        email,
        firstName,
        lastName,
        companyName
      });

      // Get models
      const models = getModels();
      if (!models || !models.User || !models.Agency) {
        return res.status(500).json({
          success: false,
          message: 'Database not initialized'
        });
      }

      // Check if user already exists
      const existingUser = await models.User.findOne({
        where: { email }
      });

      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'User with this email already exists'
        });
      }

      // Generate unique agency ID
      const agencyId = uuidv4();
      
      // Calculate trial end date (14 days from now)
      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + 14);

      // Create new user with trial status
      const user = await models.User.create({
        email,
        password,
        first_name: firstName,
        last_name: lastName,
        role: 'manager', // Trial users are managers
        agency_id: agencyId,
        status: 'active',
        subscription_status: 'trial',
        trial_end_date: trialEndDate,
        plan_name: 'starter'
      });

      logger.info('âœ… User created successfully:', {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        agency_id: user.agency_id,
        subscription_status: user.subscription_status,
        trial_end_date: user.trial_end_date
      });

      // Create agency
      logger.info('ðŸ” Creating agency:', {
        agencyId,
        companyName,
        email,
        userId: user.id
      });

      const agency = await models.Agency.create({
        id: agencyId,
        name: companyName,
        email: email,
        owner_id: user.id,
        status: 'active',
        subscription_status: 'trial',
        trial_end_date: trialEndDate
      });

      logger.info('âœ… Agency created successfully');

      // Send trial welcome email
      try {
        const emailResult = await trialEmailService.sendTrialWelcomeEmail({
          userEmail: email,
          userName: `${firstName} ${lastName}`,
          planName: 'Starter Plan',
          trialEndDate: trialEndDate
        });

        if (emailResult.success) {
          logger.info('âœ… Trial welcome email sent successfully');
        } else {
          logger.warn('âš ï¸ Failed to send trial welcome email:', emailResult.error);
        }
      } catch (emailError) {
        logger.warn('âš ï¸ Email service error:', emailError.message);
      }

      // Generate tokens
      const token = generateToken(user);
      const refreshToken = generateRefreshToken(user);

      logger.info(`âœ… Trial signup successful for: ${user.id}`);

      res.status(201).json({
        success: true,
        message: 'Trial account created successfully',
        data: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            role: user.role,
            agencyId: user.agency_id,
            subscriptionStatus: user.subscription_status,
            trialEndDate: user.trial_end_date
          },
          token,
          refreshToken,
          agency: {
            id: agency.id,
            name: agency.name,
            status: agency.status
          },
          expiresIn: process.env.JWT_EXPIRES_IN || '7d'
        }
      });

    } catch (error) {
      logger.error('âŒ Trial signup error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create trial account'
      });
    }
  }
);

// Login endpoint
router.post('/login', 
  authLimiter,
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long')
  ],
  async (req, res) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { email, password } = req.body;
      const agencyId = process.env.AGENCY_ID || 'default';

      // Debug logging
      console.log('=== LOGIN ATTEMPT DEBUG ===');
      console.log('Email:', email);
      console.log('Password provided:', !!password);
      console.log('Expected agency_id:', agencyId);
      console.log('Headers:', req.headers);
      console.log('Body:', req.body);

      // Get models
      const models = getModels();
      if (!models || !models.User) {
        console.log('ERROR: Models not available');
        return res.status(500).json({
          success: false,
          message: 'Database not initialized'
        });
      }

      // Find user by email and agency
      console.log('Searching for user with:', { email, agency_id: agencyId, status: 'active' });
      const user = await models.User.findOne({
        where: {
          email,
          agency_id: agencyId,
          status: 'active'
        }
      });

      console.log('User found:', !!user);
      if (user) {
        console.log('User details:', {
          id: user.id,
          email: user.email,
          agency_id: user.agency_id,
          status: user.status
        });
      }

      if (!user) {
        console.log('ERROR: User not found with provided criteria');
        logger.warn(`Failed login attempt for email: ${email}`);
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      // Validate password
      console.log('Validating password...');
      const isValidPassword = await user.validatePassword(password);
      console.log('Password valid:', isValidPassword);

      if (!isValidPassword) {
        console.log('ERROR: Password validation failed');
        logger.warn(`Failed login attempt for user: ${user.id}`);
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      // Update last login
      console.log('Updating last login...');
      await user.update({ last_login: new Date() });

      // Generate tokens
      console.log('Generating tokens...');
      const token = generateToken(user);
      const refreshToken = generateRefreshToken(user);

      console.log('LOGIN SUCCESS for user:', user.id);
      logger.info(`User logged in successfully: ${user.id}`);

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          user: user.toJSON(),
          token,
          refreshToken,
          expiresIn: process.env.JWT_EXPIRES_IN || '7d'
        }
      });

    } catch (error) {
      logger.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

module.exports = router;