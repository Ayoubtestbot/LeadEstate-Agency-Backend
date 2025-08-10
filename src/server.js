const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const { connectDatabase } = require('./database/connection');
const { setupAssociations } = require('./models');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const { authMiddleware } = require('./middleware/auth');

// Import routes with error handling
let authRoutes, userRoutes, leadRoutes, propertyRoutes, teamRoutes, analyticsRoutes, automationRoutes, integrationRoutes, webhookRoutes, uploadRoutes;
let trialAuthRoutes, subscriptionRoutes;

try {
  authRoutes = require('./routes/auth');
  userRoutes = require('./routes/users');
  leadRoutes = require('./routes/leads');
  propertyRoutes = require('./routes/properties');
  teamRoutes = require('./routes/team');
  analyticsRoutes = require('./routes/analytics');
  automationRoutes = require('./routes/automation');
  integrationRoutes = require('./routes/integrations');
  webhookRoutes = require('./routes/webhooks');
  uploadRoutes = require('./routes/upload');
  console.log('✅ Basic routes imported successfully');
} catch (error) {
  console.error('❌ Error importing basic routes:', error.message);
}

try {
  trialAuthRoutes = require('./routes/trial-auth');
  subscriptionRoutes = require('./routes/subscription');
  console.log('✅ SaaS routes imported successfully');
} catch (error) {
  console.error('❌ Error importing SaaS routes:', error.message);
}

// Import subscription middleware with error handling
let checkSubscriptionStatus, addTrialInfo;
try {
  const subscriptionMiddleware = require('./middleware/subscription');
  checkSubscriptionStatus = subscriptionMiddleware.checkSubscriptionStatus;
  addTrialInfo = subscriptionMiddleware.addTrialInfo;

  // Verify they are functions
  if (typeof checkSubscriptionStatus !== 'function') {
    console.error('checkSubscriptionStatus is not a function:', typeof checkSubscriptionStatus);
    checkSubscriptionStatus = (req, res, next) => next(); // fallback
  }
  if (typeof addTrialInfo !== 'function') {
    console.error('addTrialInfo is not a function:', typeof addTrialInfo);
    addTrialInfo = (req, res, next) => next(); // fallback
  }
} catch (error) {
  console.error('Error loading subscription middleware:', error);
  // Fallback middleware
  checkSubscriptionStatus = (req, res, next) => next();
  addTrialInfo = (req, res, next) => next();
}

const app = express();
const server = createServer(app);

// Define allowed origins for CORS
const allowedOrigins = [
  'http://localhost:5001',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'https://lead-estate-owner-dashboard.vercel.app',
  'https://lead-estate-agency-frontend.vercel.app',
  'https://leadestate-landing-page.vercel.app',
  'https://leadestate-owner-dashboard.vercel.app',
  'https://leadestate-agency-frontend.vercel.app'
];

// Socket.IO setup for real-time features
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || allowedOrigins,
    credentials: true
  }
});

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-owner-api-key']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000) / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Body parsing middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Simple test endpoint
app.get('/test', (req, res) => {
  res.status(200).json({
    message: 'Server is working!',
    timestamp: new Date().toISOString(),
    saasRoutes: 'enabled'
  });
});

// Database test endpoint
app.get('/test-db', async (req, res) => {
  try {
    const { pool } = require('./config/database');

    if (!pool) {
      return res.status(500).json({
        success: false,
        message: 'Database pool not available',
        details: 'Pool is null or undefined'
      });
    }

    // Test basic query
    const result = await pool.query('SELECT NOW() as current_time');

    res.status(200).json({
      success: true,
      message: 'Database connection working!',
      data: {
        currentTime: result.rows[0].current_time,
        poolConnected: true
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Database connection failed',
      error: error.message,
      details: {
        name: error.name,
        code: error.code
      }
    });
  }
});

// API routes
app.use('/api/auth', authRoutes);

// SaaS Trial and Subscription routes with error handling
try {
  app.use('/api/auth', trialAuthRoutes);
  console.log('✅ Trial auth routes registered');
} catch (error) {
  console.error('❌ Failed to register trial auth routes:', error.message);
}

try {
  app.use('/api/subscription', subscriptionRoutes);
  console.log('✅ Subscription routes registered');
} catch (error) {
  console.error('❌ Failed to register subscription routes:', error.message);
}

// Protected routes with subscription middleware
app.use('/api/users', authMiddleware, checkSubscriptionStatus, userRoutes);
app.use('/api/leads', authMiddleware, checkSubscriptionStatus, addTrialInfo, leadRoutes);
app.use('/api/properties', authMiddleware, checkSubscriptionStatus, propertyRoutes);
app.use('/api/team', authMiddleware, checkSubscriptionStatus, teamRoutes);
app.use('/api/analytics', authMiddleware, checkSubscriptionStatus, analyticsRoutes);
app.use('/api/automation', authMiddleware, checkSubscriptionStatus, automationRoutes);
app.use('/api/integrations', authMiddleware, checkSubscriptionStatus, integrationRoutes);
app.use('/api/upload', authMiddleware, checkSubscriptionStatus, uploadRoutes);
app.use('/webhooks', webhookRoutes); // No auth for webhooks

// Serve uploaded files
app.use('/uploads', express.static('uploads'));

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  // Join agency room for real-time updates
  socket.on('join-agency', (agencyId) => {
    socket.join(`agency-${agencyId}`);
    logger.info(`Socket ${socket.id} joined agency-${agencyId}`);
  });

  // Handle lead updates
  socket.on('lead-update', (data) => {
    socket.to(`agency-${data.agencyId}`).emit('lead-updated', data);
  });

  // Handle property updates
  socket.on('property-update', (data) => {
    socket.to(`agency-${data.agencyId}`).emit('property-updated', data);
  });

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Make io available to routes
app.set('io', io);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use(errorHandler);

// Database connection and server startup
const PORT = process.env.PORT || 6001;
const HOST = process.env.HOST || '0.0.0.0';

async function startServer() {
  try {
    // Connect to database
    await connectDatabase();
    logger.info('Database connected successfully');

    // Setup model associations
    setupAssociations();
    logger.info('Model associations setup complete');

    // Start server
    server.listen(PORT, HOST, () => {
      logger.info(`🚀 LeadEstate Agency Backend running on http://${HOST}:${PORT}`);
      logger.info(`📊 Environment: ${process.env.NODE_ENV}`);
      logger.info(`🏢 Agency: ${process.env.AGENCY_NAME || 'Demo Agency'}`);
      logger.info(`🔗 Frontend URL: ${process.env.FRONTEND_URL}`);
      
      if (process.env.NODE_ENV === 'development') {
        logger.info(`📖 API Documentation: http://${HOST}:${PORT}/api/docs`);
        logger.info(`🔍 Health Check: http://${HOST}:${PORT}/health`);
      }
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
if (require.main === module) {
  startServer();
}

module.exports = { app, server, io };
