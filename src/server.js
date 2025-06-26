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
const authMiddleware = require('./middleware/auth');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const leadRoutes = require('./routes/leads');
const propertyRoutes = require('./routes/properties');
const teamRoutes = require('./routes/team');
const analyticsRoutes = require('./routes/analytics');
const automationRoutes = require('./routes/automation');
const integrationRoutes = require('./routes/integrations');
const webhookRoutes = require('./routes/webhooks');
const uploadRoutes = require('./routes/upload');

const app = express();
const server = createServer(app);

// Socket.IO setup for real-time features
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5001'],
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
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
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

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', authMiddleware, userRoutes);
app.use('/api/leads', authMiddleware, leadRoutes);
app.use('/api/properties', authMiddleware, propertyRoutes);
app.use('/api/team', authMiddleware, teamRoutes);
app.use('/api/analytics', authMiddleware, analyticsRoutes);
app.use('/api/automation', authMiddleware, automationRoutes);
app.use('/api/integrations', authMiddleware, integrationRoutes);
app.use('/api/upload', authMiddleware, uploadRoutes);
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
const HOST = process.env.HOST || 'localhost';

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
