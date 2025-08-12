const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
require('dotenv').config();

const app = express();

// Basic middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['*'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'x-agency-id',
    'X-Agency-Id',
    'Accept',
    'Origin',
    'Cache-Control',
    'X-Requested-With'
  ]
}));

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: '1.0.0'
  });
});

// Basic API endpoint
app.get('/api/status', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'LeadEstate API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    database: {
      configured: process.env.DATABASE_URL ? true : false,
      urlFormat: process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 30) + '...' : 'not set'
    },
    integrations: {
      brevo: process.env.BREVO_API_KEY ? 'configured' : 'not configured',
      twilio: process.env.TWILIO_ACCOUNT_SID ? 'configured' : 'not configured'
    }
  });
});

// Test database connection endpoint
app.get('/api/test-db', async (req, res) => {
  try {
    const { connectDatabase } = require('./database/connection');
    await connectDatabase();

    res.status(200).json({
      success: true,
      message: 'Database connection successful',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Database connection failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Force reset database (more aggressive)
app.post('/api/force-reset', async (req, res) => {
  try {
    const { getSequelize } = require('./database/connection');

    const sequelize = getSequelize();
    if (!sequelize) {
      return res.status(500).json({
        success: false,
        message: 'Database not connected'
      });
    }

    console.log('🔄 Force resetting database...');

    // Drop all tables manually
    await sequelize.query('DROP TABLE IF EXISTS leads CASCADE');
    await sequelize.query('DROP TABLE IF EXISTS users CASCADE');
    await sequelize.query('DROP TABLE IF EXISTS properties CASCADE');
    await sequelize.query('DROP TABLE IF EXISTS tasks CASCADE');
    await sequelize.query('DROP TABLE IF EXISTS team_members CASCADE');
    console.log('✅ All tables dropped');

    // Reinitialize models and sync
    const { initializeModels } = require('./models');
    const models = initializeModels();

    if (models) {
      await sequelize.sync({ force: true });
      console.log('✅ Tables recreated');

      // Create fresh demo user
      const demoUser = await models.User.create({
        email: 'admin@demo.com',
        password: 'password',
        first_name: 'Demo',
        last_name: 'Admin',
        role: 'manager',
        agency_id: process.env.AGENCY_ID || 'agency-1',
        status: 'active'
      });
      console.log('✅ Fresh demo user created');
    }

    res.json({
      success: true,
      message: 'Database force reset completed',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Force reset error:', error);
    res.status(500).json({
      success: false,
      message: 'Force reset failed',
      error: error.message
    });
  }
});

// Reset database with fresh data
app.post('/api/reset-database', async (req, res) => {
  try {
    const { getSequelize } = require('./database/connection');
    const { getModels, initializeModels } = require('./models');

    // Get existing models or initialize them
    let models = getModels();
    if (!models) {
      console.log('Models not found, initializing...');
      models = initializeModels();
    }

    if (!models) {
      return res.status(500).json({
        success: false,
        message: 'Failed to initialize models'
      });
    }

    // Get database connection
    const sequelize = getSequelize();
    if (!sequelize) {
      return res.status(500).json({
        success: false,
        message: 'Database not connected'
      });
    }

    console.log('🔄 Resetting database with fresh data...');

    // Drop and recreate all tables
    await sequelize.sync({ force: true });
    console.log('✅ Database tables reset');

    // Create fresh demo user
    const demoUser = await models.User.create({
      email: 'admin@demo.com',
      password: 'password',
      first_name: 'Demo',
      last_name: 'Admin',
      role: 'manager',
      agency_id: process.env.AGENCY_ID || 'agency-1',
      status: 'active'
    });
    console.log('✅ Demo user created');

    res.json({
      success: true,
      message: 'Database reset successfully with fresh data',
      data: {
        tablesCreated: Object.keys(sequelize.models),
        demoUser: {
          email: 'admin@demo.com',
          password: 'password',
          role: 'manager'
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Database reset error:', error);
    res.status(500).json({
      success: false,
      message: 'Database reset failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Sync database tables endpoint
app.post('/api/sync-db', async (req, res) => {
  try {
    const { getSequelize } = require('./database/connection');
    const { getModels, initializeModels } = require('./models');

    // Get existing models or initialize them
    let models = getModels();
    if (!models) {
      console.log('Models not found, initializing...');
      models = initializeModels();
    }

    if (!models) {
      return res.status(500).json({
        success: false,
        message: 'Failed to initialize models'
      });
    }

    // Get database connection
    const sequelize = getSequelize();
    if (!sequelize) {
      return res.status(500).json({
        success: false,
        message: 'Database not connected'
      });
    }

    console.log('🔄 Syncing database tables...');
    console.log('Available models:', Object.keys(sequelize.models));

    // Sync database with force option for development
    await sequelize.sync({ alter: true, force: false });
    console.log('✅ Database tables synchronized');

    // List created tables
    const [results] = await sequelize.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    );

    res.json({
      success: true,
      message: 'Database tables synchronized successfully',
      tables: results.map(row => row.table_name),
      models: Object.keys(sequelize.models),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Database sync error:', error);
    res.status(500).json({
      success: false,
      message: 'Database sync failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Check if demo user exists
app.get('/api/check-demo-user', async (req, res) => {
  try {
    const { getModels, initializeModels } = require('./models');

    let models = getModels();
    if (!models) {
      models = initializeModels();
    }

    if (!models || !models.User) {
      return res.status(500).json({
        success: false,
        message: 'User model not available'
      });
    }

    // Check if demo user exists
    const demoUser = await models.User.findOne({
      where: { email: 'admin@demo.com' }
    });

    if (demoUser) {
      res.json({
        success: true,
        message: 'Demo user exists',
        user: {
          id: demoUser.id,
          email: demoUser.email,
          first_name: demoUser.first_name,
          last_name: demoUser.last_name,
          role: demoUser.role,
          agency_id: demoUser.agency_id,
          status: demoUser.status,
          created_at: demoUser.created_at
        }
      });
    } else {
      res.json({
        success: false,
        message: 'Demo user does not exist'
      });
    }

  } catch (error) {
    console.error('Check demo user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check demo user',
      error: error.message
    });
  }
});

// Check actual data count in database
app.get('/api/data-count', async (req, res) => {
  try {
    const { getModels, initializeModels } = require('./models');

    let models = getModels();
    if (!models) {
      models = initializeModels();
    }

    if (!models) {
      return res.status(500).json({
        success: false,
        message: 'Models not available'
      });
    }

    // Count all data
    const leadCount = models.Lead ? await models.Lead.count() : 0;
    const userCount = models.User ? await models.User.count() : 0;

    // Get all leads for debugging
    const allLeads = models.Lead ? await models.Lead.findAll({
      attributes: ['id', 'first_name', 'last_name', 'email', 'created_at'],
      limit: 10
    }) : [];

    res.json({
      success: true,
      counts: {
        leads: leadCount,
        users: userCount
      },
      sampleLeads: allLeads,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Data count error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to count data',
      error: error.message
    });
  }
});

// Check environment variables
app.get('/api/env-check', (req, res) => {
  res.json({
    success: true,
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'NOT SET',
      AGENCY_ID: process.env.AGENCY_ID || 'NOT SET',
      JWT_SECRET: process.env.JWT_SECRET ? 'SET (length: ' + process.env.JWT_SECRET.length + ')' : 'NOT SET',
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ? 'SET' : 'NOT SET',
      CORS_ORIGIN: process.env.CORS_ORIGIN || 'NOT SET',
      BREVO_API_KEY: process.env.BREVO_API_KEY ? 'SET' : 'NOT SET',
      TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID ? 'SET' : 'NOT SET'
    },
    timestamp: new Date().toISOString()
  });
});

// Check models status endpoint
app.get('/api/models-status', async (req, res) => {
  try {
    const { getSequelize } = require('./database/connection');
    const { getModels } = require('./models');

    const sequelize = getSequelize();
    const models = getModels();

    res.json({
      success: true,
      database: {
        connected: !!sequelize,
        models: sequelize ? Object.keys(sequelize.models) : []
      },
      modelsInitialized: !!models,
      availableModels: models ? Object.keys(models) : [],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to check models status',
      error: error.message
    });
  }
});

// Debug agency ID mismatch
app.get('/api/debug-agency', async (req, res) => {
  try {
    const { getModels, initializeModels } = require('./models');

    let models = getModels();
    if (!models) {
      models = initializeModels();
    }

    if (!models || !models.User) {
      return res.status(500).json({
        success: false,
        message: 'User model not available'
      });
    }

    // Check what agency_id the auth route expects
    const authAgencyId = process.env.AGENCY_ID || 'default';

    // Find demo user with any agency_id
    const demoUser = await models.User.findOne({
      where: { email: 'admin@demo.com' }
    });

    // Find demo user with auth agency_id
    const demoUserWithAuthAgency = await models.User.findOne({
      where: {
        email: 'admin@demo.com',
        agency_id: authAgencyId,
        status: 'active'
      }
    });

    res.json({
      success: true,
      message: 'Agency ID debug info',
      authRoute: {
        expectedAgencyId: authAgencyId,
        envAgencyId: process.env.AGENCY_ID,
        fallbackAgencyId: 'default'
      },
      demoUser: demoUser ? {
        email: demoUser.email,
        agency_id: demoUser.agency_id,
        status: demoUser.status
      } : null,
      authMatch: {
        foundWithAuthAgency: !!demoUserWithAuthAgency,
        canLogin: !!demoUserWithAuthAgency
      }
    });

  } catch (error) {
    console.error('Debug agency error:', error);
    res.status(500).json({
      success: false,
      message: 'Agency debug failed',
      error: error.message
    });
  }
});

// Test password validation
app.post('/api/test-password', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { getModels, initializeModels } = require('./models');

    let models = getModels();
    if (!models) {
      models = initializeModels();
    }

    if (!models || !models.User) {
      return res.status(500).json({
        success: false,
        message: 'User model not available'
      });
    }

    // Find user
    const user = await models.User.findOne({
      where: { email: email || 'admin@demo.com' }
    });

    if (!user) {
      return res.json({
        success: false,
        message: 'User not found',
        email: email || 'admin@demo.com'
      });
    }

    // Test password validation
    const isValid = await user.validatePassword(password || 'password');

    res.json({
      success: true,
      message: 'Password validation test',
      user: {
        email: user.email,
        hasPassword: !!user.password,
        passwordLength: user.password ? user.password.length : 0
      },
      passwordTest: {
        provided: password || 'password',
        isValid: isValid
      }
    });

  } catch (error) {
    console.error('Test password error:', error);
    res.status(500).json({
      success: false,
      message: 'Password test failed',
      error: error.message
    });
  }
});

// Test login endpoint (for debugging)
app.post('/api/test-login', async (req, res) => {
  try {
    console.log('Test login request received');
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    console.log('Body type:', typeof req.body);
    console.log('Body JSON:', JSON.stringify(req.body));

    res.json({
      success: true,
      message: 'Test login endpoint working',
      receivedData: {
        body: req.body,
        headers: req.headers,
        contentType: req.headers['content-type']
      }
    });
  } catch (error) {
    console.error('Test login error:', error);
    res.status(500).json({
      success: false,
      message: 'Test login failed',
      error: error.message
    });
  }
});

// Create demo user endpoint
app.post('/api/create-demo-user', async (req, res) => {
  try {
    const { getModels, initializeModels } = require('./models');

    // Get existing models or initialize them
    let models = getModels();
    if (!models) {
      console.log('Models not found, initializing...');
      models = initializeModels();
    }

    if (!models || !models.User) {
      return res.status(500).json({
        success: false,
        message: 'User model not available'
      });
    }

    // Check if demo user already exists
    const existingUser = await models.User.findOne({
      where: { email: 'admin@demo.com' }
    });

    if (existingUser) {
      return res.json({
        success: true,
        message: 'Demo user already exists',
        credentials: {
          email: 'admin@demo.com',
          password: 'password'
        }
      });
    }

    // Create demo user
    const demoUser = await models.User.create({
      email: 'admin@demo.com',
      password: 'password',
      first_name: 'Demo',
      last_name: 'Admin',
      role: 'manager',
      agency_id: process.env.AGENCY_ID || 'agency-1',
      status: 'active'
    });

    res.json({
      success: true,
      message: 'Demo user created successfully',
      credentials: {
        email: 'admin@demo.com',
        password: 'password'
      },
      user: demoUser.toJSON()
    });

  } catch (error) {
    console.error('Create demo user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create demo user',
      error: error.message
    });
  }
});

// Endpoint to populate test data for a specific agency
app.post('/api/populate-test-data', async (req, res) => {
  try {
    const { agency_id, user_id } = req.body;

    if (!agency_id || !user_id) {
      return res.status(400).json({
        success: false,
        message: 'agency_id and user_id are required'
      });
    }

    console.log(`🔄 Populating test data for agency: ${agency_id}, user: ${user_id}`);

    // Create test leads
    const testLeads = [];
    for (let i = 1; i <= 15; i++) {
      const lead = await models.Lead.create({
        first_name: `Client ${i}`,
        last_name: 'Prospect',
        email: `client${i}@example.com`,
        phone: `+155512345${i.toString().padStart(2, '0')}`,
        city: 'Paris',
        status: i <= 3 ? 'closed_won' : (i <= 8 ? 'qualified' : 'new'),
        source: ['website', 'referral', 'google', 'facebook'][i % 4],
        budget_min: 300000 + (i * 50000),
        budget_max: 500000 + (i * 100000),
        property_type: ['apartment', 'house', 'condo', 'villa'][i % 4],
        bedrooms: (i % 4) + 1,
        bathrooms: (i % 3) + 1,
        notes: `Test lead ${i} - interested in ${['apartment', 'house', 'condo', 'villa'][i % 4]}`,
        priority: i <= 5 ? 'high' : (i <= 10 ? 'medium' : 'low'),
        score: 50 + (i * 3),
        agency_id: agency_id,
        assigned_to: user_id
      });
      testLeads.push(lead);
    }

    // Create test properties
    const testProperties = [];
    for (let i = 1; i <= 15; i++) {
      const property = await models.Property.create({
        title: `Property ${i} - ${['House', 'Condo', 'Villa', 'Apartment'][i % 4]}`,
        description: `Beautiful ${['house', 'condo', 'villa', 'apartment'][i % 4]} in prime location`,
        price: 400000 + (i * 100000),
        property_type: ['house', 'condo', 'villa', 'apartment'][i % 4],
        bedrooms: (i % 4) + 1,
        bathrooms: (i % 3) + 1,
        square_feet: 1000 + (i * 200),
        address: `${i} Test Street`,
        city: 'Paris',
        state: 'Île-de-France',
        zip_code: `7500${i}`,
        status: i <= 10 ? 'active' : 'sold',
        agency_id: agency_id,
        listed_by: user_id
      });
      testProperties.push(property);
    }

    // Create test team members
    const testTeamMembers = [];
    for (let i = 1001; i <= 1109; i++) {
      const member = await models.User.create({
        email: `agent${i}@leadestate.com`,
        password: 'agent123',
        first_name: `Agent ${i}`,
        last_name: ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones'][i % 5],
        role: i <= 1005 ? 'super_agent' : 'agent',
        phone: `+1555${i}`,
        agency_id: agency_id,
        status: 'active',
        email_verified: true
      });
      testTeamMembers.push(member);
    }

    res.json({
      success: true,
      message: `Test data populated successfully for agency ${agency_id}`,
      data: {
        leads: testLeads.length,
        properties: testProperties.length,
        teamMembers: testTeamMembers.length
      }
    });

  } catch (error) {
    console.error('Populate test data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to populate test data',
      error: error.message
    });
  }
});

// Basic auth routes
app.use('/api/auth', require('./routes/auth'));

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString()
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 6001;

// Simple server startup without database dependency
async function startServer() {
  try {
    // Start server first
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 LeadEstate Backend running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV}`);
      console.log(`🔗 Health Check: http://localhost:${PORT}/health`);
      console.log(`🔗 API Status: http://localhost:${PORT}/api/status`);
      console.log(`🔗 Test DB: http://localhost:${PORT}/api/test-db`);
    });

    // Try to connect to database after server starts
    setTimeout(async () => {
      try {
        const { connectDatabase } = require('./database/connection');
        await connectDatabase();
        console.log('✅ Database connected successfully');

        // Initialize models after database connection
        const { initializeModels } = require('./models');
        const models = initializeModels();
        if (models) {
          console.log('✅ Models initialized successfully');

          // Sync database to create tables
          const { getSequelize } = require('./database/connection');
          const sequelize = getSequelize();
          if (sequelize) {
            console.log('🔄 Syncing database tables...');
            await sequelize.sync({ alter: true });
            console.log('✅ Database tables synchronized');
          }
        }
      } catch (error) {
        console.log('⚠️ Database connection failed:', error.message);
        console.log('Server running without database connection');
      }
    }, 1000);

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start the server
if (require.main === module) {
  startServer();
}

module.exports = app;
