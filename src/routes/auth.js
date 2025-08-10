const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { getModels } = require('../models');
const brevoService = require('../services/brevoService');
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

// Register endpoint (for creating new users)
router.post('/register',
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long'),
    body('first_name')
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('First name is required and must be less than 50 characters'),
    body('last_name')
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Last name is required and must be less than 50 characters'),
    body('role')
      .isIn(['manager', 'super_agent', 'agent'])
      .withMessage('Invalid role specified')
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

      const { email, password, first_name, last_name, role, phone } = req.body;
      const agencyId = process.env.AGENCY_ID || 'default';

      // Get models
      const models = getModels();
      if (!models || !models.User) {
        return res.status(500).json({
          success: false,
          message: 'Database not initialized'
        });
      }

      // Check if user already exists
      const existingUser = await models.User.findOne({
        where: { 
          email, 
          agency_id: agencyId 
        }
      });

      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'User with this email already exists'
        });
      }

      // Create new user
      const user = await models.User.create({
        email,
        password,
        first_name,
        last_name,
        role,
        phone,
        agency_id: agencyId,
        status: 'active'
      });

      // Send welcome email
      try {
        await brevoService.sendWelcomeEmail(user);
      } catch (emailError) {
        logger.warn('Failed to send welcome email:', emailError);
      }

      // Generate tokens
      const token = generateToken(user);
      const refreshToken = generateRefreshToken(user);

      logger.info(`New user registered: ${user.id}`);

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
          user: user.toJSON(),
          token,
          refreshToken,
          expiresIn: process.env.JWT_EXPIRES_IN || '7d'
        }
      });

    } catch (error) {
      logger.error('Registration error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// Refresh token endpoint
router.post('/refresh',
  [
    body('refreshToken')
      .notEmpty()
      .withMessage('Refresh token is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { refreshToken } = req.body;

      // Verify refresh token
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
      
      if (decoded.type !== 'refresh') {
        return res.status(401).json({
          success: false,
          message: 'Invalid refresh token'
        });
      }

      // Get models
      const models = getModels();
      if (!models || !models.User) {
        return res.status(500).json({
          success: false,
          message: 'Database not initialized'
        });
      }

      // Find user
      const user = await models.User.findByPk(decoded.id);
      if (!user || user.status !== 'active') {
        return res.status(401).json({
          success: false,
          message: 'User not found or inactive'
        });
      }

      // Generate new tokens
      const newToken = generateToken(user);
      const newRefreshToken = generateRefreshToken(user);

      res.json({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          token: newToken,
          refreshToken: newRefreshToken,
          expiresIn: process.env.JWT_EXPIRES_IN || '7d'
        }
      });

    } catch (error) {
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired refresh token'
        });
      }

      logger.error('Token refresh error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// Logout endpoint
router.post('/logout', (req, res) => {
  // In a stateless JWT system, logout is handled client-side
  // Here we could implement token blacklisting if needed
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

// Verify token endpoint
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get models
    const models = getModels();
    if (!models || !models.User) {
      return res.status(500).json({
        success: false,
        message: 'Database not initialized'
      });
    }

    const user = await models.User.findByPk(decoded.id);

    if (!user || user.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token or user not found'
      });
    }

    res.json({
      success: true,
      message: 'Token is valid',
      data: {
        user: user.toJSON()
      }
    });

  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    logger.error('Token verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// ===== OWNER DASHBOARD AUTHENTICATION =====

// Owner Login endpoint (for Owner Dashboard)
router.post('/owner/login', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
], async (req, res) => {
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

    // Get database connection
    const { pool } = require('../config/database');
    if (!pool) {
      logger.error('Database connection not available');
      return res.status(500).json({
        success: false,
        message: 'Database connection error'
      });
    }

    // Create owners table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS owners (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        role VARCHAR(50) DEFAULT 'owner',
        status VARCHAR(20) DEFAULT 'active',
        phone VARCHAR(20),
        company_name VARCHAR(255),
        company_address TEXT,
        reset_token VARCHAR(255),
        reset_token_expires TIMESTAMP,
        last_login_at TIMESTAMP,
        email_verified_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create default owner if it doesn't exist
    const existingOwner = await pool.query('SELECT id FROM owners WHERE email = $1', ['owner@leadestate.com']);
    if (existingOwner.rows.length === 0) {
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('password123', 12);

      await pool.query(`
        INSERT INTO owners (
          email, password_hash, first_name, last_name, role, status,
          company_name, email_verified_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `, [
        'owner@leadestate.com',
        hashedPassword,
        'Owner',
        'Admin',
        'owner',
        'active',
        'LeadEstate'
      ]);
    }

    // Find owner by email
    const ownerResult = await pool.query(
      'SELECT * FROM owners WHERE email = $1 AND status = $2',
      [email, 'active']
    );

    if (ownerResult.rows.length === 0) {
      logger.warn(`Failed owner login attempt for email: ${email}`);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const owner = ownerResult.rows[0];

    // Verify password
    const bcrypt = require('bcryptjs');
    const isValidPassword = await bcrypt.compare(password, owner.password_hash);

    if (!isValidPassword) {
      logger.warn(`Failed owner login attempt for email: ${email} - invalid password`);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Update last login time
    await pool.query(
      'UPDATE owners SET last_login_at = NOW() WHERE id = $1',
      [owner.id]
    );

    // Generate JWT token for owner
    const token = jwt.sign(
      {
        id: owner.id,
        email: owner.email,
        role: owner.role,
        userType: 'owner'
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    logger.info(`Owner login successful: ${email}`);

    return res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: owner.id,
          email: owner.email,
          firstName: owner.first_name,
          lastName: owner.last_name,
          role: owner.role,
          userType: 'owner'
        }
      }
    });

  } catch (error) {
    logger.error('Owner login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
