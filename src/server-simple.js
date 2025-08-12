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

// Endpoint to populate test data for Sophie's agency
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

    const { pool } = require('./config/database');

    // Create test leads
    const testLeads = [];
    for (let i = 1; i <= 15; i++) {
      const leadResult = await pool.query(`
        INSERT INTO leads (first_name, last_name, email, phone, city, status, source, budget, notes, assigned_to, agency_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
        RETURNING id
      `, [
        `Client ${i}`,
        'Prospect',
        `client${i}@example.com`,
        `+155512345${i.toString().padStart(2, '0')}`,
        'Paris',
        i <= 3 ? 'closed_won' : (i <= 8 ? 'qualified' : 'new'),
        ['website', 'referral', 'google', 'facebook'][i % 4],
        `${300000 + (i * 50000)}-${500000 + (i * 100000)}`,
        `Test lead ${i} - interested in ${['apartment', 'house', 'condo', 'villa'][i % 4]}`,
        user_id,
        agency_id
      ]);
      testLeads.push(leadResult.rows[0]);
    }

    // Create test properties
    const testProperties = [];
    for (let i = 1; i <= 15; i++) {
      const propertyResult = await pool.query(`
        INSERT INTO properties (title, description, price, property_type, bedrooms, bathrooms, square_feet, address, city, state, zip_code, status, agency_id, listed_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
        RETURNING id
      `, [
        `Property ${i} - ${['House', 'Condo', 'Villa', 'Apartment'][i % 4]}`,
        `Beautiful ${['house', 'condo', 'villa', 'apartment'][i % 4]} in prime location`,
        400000 + (i * 100000),
        ['house', 'condo', 'villa', 'apartment'][i % 4],
        (i % 4) + 1,
        (i % 3) + 1,
        1000 + (i * 200),
        `${i} Test Street`,
        'Paris',
        'Île-de-France',
        `7500${i}`,
        i <= 10 ? 'active' : 'sold',
        agency_id,
        user_id
      ]);
      testProperties.push(propertyResult.rows[0]);
    }

    // Create test team members
    const testTeamMembers = [];
    for (let i = 1; i <= 10; i++) {
      const memberResult = await pool.query(`
        INSERT INTO users (email, password, first_name, last_name, role, phone, agency_id, status, email_verified, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        RETURNING id
      `, [
        `agent${i}@leadestate.com`,
        '$2b$12$dummy.hash.for.testing.purposes.only',
        `Agent ${i}`,
        ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones'][i % 5],
        i <= 3 ? 'super_agent' : 'agent',
        `+1555${1000 + i}`,
        agency_id,
        'active',
        true
      ]);
      testTeamMembers.push(memberResult.rows[0]);
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

// Comprehensive Moroccan data population endpoint
app.post('/api/populate-comprehensive-data', async (req, res) => {
  try {
    const { agency_id, user_id, team_members, leads_count = 100, properties_count = 50 } = req.body;

    if (!agency_id || !user_id) {
      return res.status(400).json({
        success: false,
        message: 'agency_id and user_id are required'
      });
    }

    console.log(`🇲🇦 Creating comprehensive Moroccan CRM data for agency: ${agency_id}`);

    const { pool } = require('./config/database');
    const bcrypt = require('bcrypt');

    // Moroccan data arrays
    const moroccanFirstNames = [
      'Ahmed', 'Mohammed', 'Hassan', 'Omar', 'Youssef', 'Khalid', 'Abdelaziz', 'Rachid', 'Said', 'Mustapha',
      'Fatima', 'Aicha', 'Khadija', 'Zineb', 'Amina', 'Laila', 'Nadia', 'Samira', 'Houda', 'Malika',
      'Abderrahim', 'Abdelkader', 'Brahim', 'Driss', 'Hamid', 'Jamal', 'Karim', 'Larbi', 'Mehdi', 'Noureddine',
      'Btissam', 'Ghizlane', 'Hafida', 'Ibtissam', 'Jamila', 'Karima', 'Latifa', 'Meryem', 'Nawal', 'Rajae'
    ];

    const moroccanLastNames = [
      'Alami', 'Benali', 'Cherkaoui', 'Drissi', 'El Fassi', 'Filali', 'Ghazi', 'Hajji', 'Idrissi', 'Jebari',
      'Kettani', 'Lahlou', 'Mabrouk', 'Naciri', 'Ouali', 'Qadiri', 'Rami', 'Sabri', 'Tazi', 'Wahbi',
      'Amrani', 'Berrada', 'Chraibi', 'Douiri', 'El Alaoui', 'Fassi Fihri', 'Guerraoui', 'Hakim', 'Iraqi', 'Jaidi'
    ];

    const moroccanCities = [
      'Casablanca', 'Rabat', 'Marrakech', 'Fès', 'Tanger', 'Agadir', 'Meknès', 'Oujda', 'Kenitra', 'Tétouan',
      'Safi', 'Mohammedia', 'Khouribga', 'Beni Mellal', 'El Jadida', 'Nador', 'Taza', 'Settat', 'Larache', 'Ksar El Kebir'
    ];

    const propertyTypes = ['apartment', 'villa', 'house', 'riad', 'penthouse'];
    const leadSources = ['website', 'facebook', 'google', 'referral', 'walk-in', 'phone', 'whatsapp'];
    const leadStatuses = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];

    function getRandomElement(array) {
      return array[Math.floor(Math.random() * array.length)];
    }

    function generateMoroccanPhone() {
      const prefixes = ['06', '07'];
      const prefix = getRandomElement(prefixes);
      const number = Math.floor(Math.random() * 90000000) + 10000000;
      return `+212${prefix}${number.toString().substring(0, 8)}`;
    }

    function generateEmail(firstName, lastName) {
      const domains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'];
      const cleanFirst = firstName.toLowerCase().replace(/[^a-z]/g, '');
      const cleanLast = lastName.toLowerCase().replace(/[^a-z]/g, '');
      return `${cleanFirst}.${cleanLast}${Math.floor(Math.random() * 999)}@${getRandomElement(domains)}`;
    }

    // Step 1: Create team members
    console.log('👥 Creating team members...');
    const createdTeamMembers = [];

    if (team_members && team_members.length > 0) {
      for (const member of team_members) {
        try {
          const hashedPassword = await bcrypt.hash(member.password, 12);
          const memberResult = await pool.query(`
            INSERT INTO users (email, password, first_name, last_name, role, phone, agency_id, status, email_verified, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
            RETURNING id, email, first_name, last_name, role
          `, [
            member.email,
            hashedPassword,
            member.first_name,
            member.last_name,
            member.role,
            member.phone,
            agency_id,
            'active',
            true
          ]);
          createdTeamMembers.push(memberResult.rows[0]);
          console.log(`✅ Created team member: ${member.first_name} ${member.last_name} (${member.role})`);
        } catch (error) {
          console.log(`⚠️ Team member ${member.email} might already exist, skipping...`);
        }
      }
    }

    // Get all team members for assignment (including existing ones)
    const allTeamResult = await pool.query(`
      SELECT id, first_name, last_name, role FROM users
      WHERE agency_id = $1 AND role IN ('manager', 'super_agent', 'agent')
    `, [agency_id]);
    const allTeamMembers = allTeamResult.rows;

    // Step 2: Create 100 Moroccan leads
    console.log(`📋 Creating ${leads_count} Moroccan leads...`);
    const createdLeads = [];

    for (let i = 1; i <= leads_count; i++) {
      const firstName = getRandomElement(moroccanFirstNames);
      const lastName = getRandomElement(moroccanLastNames);
      const city = getRandomElement(moroccanCities);
      const assignedTo = allTeamMembers.length > 0 ? getRandomElement(allTeamMembers).id : user_id;

      try {
        const leadResult = await pool.query(`
          INSERT INTO leads (first_name, last_name, email, phone, city, status, source, budget, notes, assigned_to, agency_id, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
          RETURNING id
        `, [
          firstName,
          lastName,
          generateEmail(firstName, lastName),
          generateMoroccanPhone(),
          city,
          getRandomElement(leadStatuses),
          getRandomElement(leadSources),
          `${Math.floor(Math.random() * 2000000) + 500000}-${Math.floor(Math.random() * 5000000) + 1000000}`,
          `Prospect intéressé par l'immobilier à ${city}. ${getRandomElement(['Recherche appartement', 'Recherche villa', 'Premier achat', 'Investissement locatif'])}.`,
          assignedTo,
          agency_id
        ]);
        createdLeads.push(leadResult.rows[0]);
      } catch (error) {
        console.log(`⚠️ Error creating lead ${i}:`, error.message);
      }
    }

    // Step 3: Create 50 Moroccan properties
    console.log(`🏠 Creating ${properties_count} Moroccan properties...`);
    const createdProperties = [];

    for (let i = 1; i <= properties_count; i++) {
      const city = getRandomElement(moroccanCities);
      const propertyType = getRandomElement(propertyTypes);
      const listedBy = allTeamMembers.length > 0 ? getRandomElement(allTeamMembers).id : user_id;

      try {
        const propertyResult = await pool.query(`
          INSERT INTO properties (title, description, price, property_type, bedrooms, bathrooms, square_feet, address, city, state, zip_code, status, agency_id, listed_by, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
          RETURNING id
        `, [
          `${propertyType.charAt(0).toUpperCase() + propertyType.slice(1)} moderne à ${city}`,
          `Magnifique ${propertyType} situé dans un quartier prisé de ${city}. Proche des commodités et transports.`,
          Math.floor(Math.random() * 3000000) + 800000,
          propertyType,
          Math.floor(Math.random() * 4) + 2,
          Math.floor(Math.random() * 3) + 1,
          Math.floor(Math.random() * 200) + 80,
          `${Math.floor(Math.random() * 200) + 1} Rue ${getRandomElement(['Hassan II', 'Mohammed V', 'Atlas', 'Anfa', 'Majorelle'])}`,
          city,
          city === 'Casablanca' ? 'Grand Casablanca' : city === 'Rabat' ? 'Rabat-Salé-Kénitra' : 'Maroc',
          `${Math.floor(Math.random() * 90000) + 10000}`,
          Math.random() > 0.2 ? 'active' : 'sold',
          agency_id,
          listedBy
        ]);
        createdProperties.push(propertyResult.rows[0]);
      } catch (error) {
        console.log(`⚠️ Error creating property ${i}:`, error.message);
      }
    }

    res.json({
      success: true,
      message: `Comprehensive Moroccan CRM data populated successfully for agency ${agency_id}`,
      data: {
        teamMembers: createdTeamMembers.length,
        totalTeamMembers: allTeamMembers.length,
        leads: createdLeads.length,
        properties: createdProperties.length
      }
    });

  } catch (error) {
    console.error('Populate comprehensive data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to populate comprehensive data',
      error: error.message
    });
  }
});

// Basic auth routes
app.use('/api/auth', require('./routes/auth'));

// Protected routes (require authentication)
app.use('/api/leads', require('./routes/leads'));
app.use('/api/properties', require('./routes/properties'));
app.use('/api/team', require('./routes/team'));

// Dashboard endpoint
app.get('/api/dashboard', async (req, res) => {
  try {
    // Mock dashboard data for now
    const dashboardData = {
      stats: {
        totalLeads: 15,
        totalProperties: 15,
        closedWonLeads: 3,
        conversionRate: '20.0'
      },
      recentLeads: [],
      recentProperties: [],
      teamMembers: [],
      activities: [],
      performance: {
        thisMonth: { leads: 15, properties: 15, conversions: 3 },
        lastMonth: { leads: 12, properties: 12, conversions: 2 }
      }
    };

    res.json({
      success: true,
      message: 'Dashboard data retrieved successfully',
      data: dashboardData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve dashboard data',
      error: error.message
    });
  }
});

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
