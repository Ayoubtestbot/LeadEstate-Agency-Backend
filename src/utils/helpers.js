const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

/**
 * Generate a random string
 * @param {number} length - Length of the string
 * @returns {string} Random string
 */
const generateRandomString = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Generate JWT token
 * @param {object} payload - Token payload
 * @param {string} expiresIn - Token expiration
 * @returns {string} JWT token
 */
const generateToken = (payload, expiresIn = '24h') => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
};

/**
 * Verify JWT token
 * @param {string} token - JWT token
 * @returns {object} Decoded token
 */
const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

/**
 * Hash password
 * @param {string} password - Plain text password
 * @returns {string} Hashed password
 */
const hashPassword = async (password) => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

/**
 * Compare password with hash
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {boolean} Password match result
 */
const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

/**
 * Generate pagination metadata
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @param {number} total - Total items
 * @returns {object} Pagination metadata
 */
const getPaginationMeta = (page, limit, total) => {
  const totalPages = Math.ceil(total / limit);
  const hasNext = page < totalPages;
  const hasPrev = page > 1;

  return {
    currentPage: page,
    totalPages,
    totalItems: total,
    itemsPerPage: limit,
    hasNext,
    hasPrev,
    nextPage: hasNext ? page + 1 : null,
    prevPage: hasPrev ? page - 1 : null,
  };
};

/**
 * Format API response
 * @param {boolean} success - Success status
 * @param {string} message - Response message
 * @param {any} data - Response data
 * @param {object} meta - Additional metadata
 * @returns {object} Formatted response
 */
const formatResponse = (success, message, data = null, meta = null) => {
  const response = {
    success,
    message,
    timestamp: new Date().toISOString(),
  };

  if (data !== null) {
    response.data = data;
  }

  if (meta !== null) {
    response.meta = meta;
  }

  return response;
};

/**
 * Format error response
 * @param {string} message - Error message
 * @param {any} errors - Error details
 * @param {number} statusCode - HTTP status code
 * @returns {object} Formatted error response
 */
const formatErrorResponse = (message, errors = null, statusCode = 500) => {
  const response = {
    success: false,
    message,
    statusCode,
    timestamp: new Date().toISOString(),
  };

  if (errors !== null) {
    response.errors = errors;
  }

  return response;
};

/**
 * Validate email format
 * @param {string} email - Email address
 * @returns {boolean} Valid email
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate phone number format
 * @param {string} phone - Phone number
 * @returns {boolean} Valid phone number
 */
const isValidPhone = (phone) => {
  const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
  return phoneRegex.test(phone);
};

/**
 * Sanitize string input
 * @param {string} input - Input string
 * @returns {string} Sanitized string
 */
const sanitizeString = (input) => {
  if (typeof input !== 'string') return input;
  return input.trim().replace(/[<>]/g, '');
};

/**
 * Generate slug from string
 * @param {string} text - Input text
 * @returns {string} URL-friendly slug
 */
const generateSlug = (text) => {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

/**
 * Calculate lead score based on criteria
 * @param {object} lead - Lead data
 * @returns {number} Lead score (0-100)
 */
const calculateLeadScore = (lead) => {
  let score = 0;

  // Email provided
  if (lead.email && isValidEmail(lead.email)) {
    score += 20;
  }

  // Phone provided
  if (lead.phone && isValidPhone(lead.phone)) {
    score += 20;
  }

  // Budget specified
  if (lead.budget && lead.budget > 0) {
    score += 15;
  }

  // Property type specified
  if (lead.propertyType) {
    score += 10;
  }

  // Location specified
  if (lead.location) {
    score += 10;
  }

  // Source quality
  if (lead.source) {
    switch (lead.source.toLowerCase()) {
      case 'referral':
        score += 15;
        break;
      case 'website':
        score += 10;
        break;
      case 'social_media':
        score += 5;
        break;
      default:
        score += 5;
    }
  }

  // Recent activity
  const daysSinceCreated = Math.floor(
    (new Date() - new Date(lead.createdAt)) / (1000 * 60 * 60 * 24)
  );
  if (daysSinceCreated <= 1) {
    score += 10;
  } else if (daysSinceCreated <= 7) {
    score += 5;
  }

  return Math.min(score, 100);
};

/**
 * Format currency
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code
 * @returns {string} Formatted currency
 */
const formatCurrency = (amount, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount);
};

/**
 * Get time ago string
 * @param {Date} date - Date to compare
 * @returns {string} Time ago string
 */
const getTimeAgo = (date) => {
  const now = new Date();
  const diffInSeconds = Math.floor((now - new Date(date)) / 1000);

  if (diffInSeconds < 60) {
    return 'just now';
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else if (diffInSeconds < 2592000) {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  } else {
    return new Date(date).toLocaleDateString();
  }
};

module.exports = {
  generateRandomString,
  generateToken,
  verifyToken,
  hashPassword,
  comparePassword,
  getPaginationMeta,
  formatResponse,
  formatErrorResponse,
  isValidEmail,
  isValidPhone,
  sanitizeString,
  generateSlug,
  calculateLeadScore,
  formatCurrency,
  getTimeAgo,
};
