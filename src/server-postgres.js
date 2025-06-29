const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const twilio = require('twilio');
require('dotenv').config();

const app = express();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/') // Make sure this directory exists
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, 'property-' + uniqueSuffix + path.extname(file.originalname))
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    // Check file type
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Basic middleware
app.use(helmet());
// More permissive CORS for development and testing
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Allow all localhost origins
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }

    // Allow all Vercel domains
    if (origin.includes('.vercel.app')) {
      return callback(null, true);
    }

    // Allow specific domains
    const allowedOrigins = [
      'https://lead-estate-agency-frontend.vercel.app',
      'https://leadestate-agency-frontend.vercel.app',
      'https://leadestate-owner-dashboard.vercel.app',
      'https://admin.leadestate.com',
      'https://leadestate-backend-9fih.onrender.com'
    ];

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // For development, allow all origins
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }

    return callback(null, true); // Allow all for now during testing
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'x-owner-api-key'
  ]
}));

app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded images statically
app.use('/uploads', express.static('uploads'));

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Twilio client initialization
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  console.log('✅ Twilio client initialized');
} else {
  console.log('⚠️ Twilio credentials not found - WhatsApp messages will be logged only');
}

// Initialize database tables
const initDatabase = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id VARCHAR(255) PRIMARY KEY,
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(255),
        whatsapp VARCHAR(255),
        source VARCHAR(255),
        budget DECIMAL,
        notes TEXT,
        status VARCHAR(255) DEFAULT 'new',
        assigned_to VARCHAR(255),
        language VARCHAR(10) DEFAULT 'fr',
        agency_id VARCHAR(255) DEFAULT 'default-agency',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS properties (
        id VARCHAR(255) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        type VARCHAR(255),
        price DECIMAL,
        location VARCHAR(255),
        bedrooms INTEGER,
        bathrooms INTEGER,
        area DECIMAL,
        description TEXT,
        status VARCHAR(255) DEFAULT 'available',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS team_members (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(255),
        role VARCHAR(255),
        department VARCHAR(255),
        status VARCHAR(255) DEFAULT 'active',
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add missing columns if they don't exist
    await pool.query(`
      ALTER TABLE leads
      ADD COLUMN IF NOT EXISTS assigned_to VARCHAR(255)
    `);

    await pool.query(`
      ALTER TABLE leads
      ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'fr'
    `);

    await pool.query(`
      ALTER TABLE leads
      ADD COLUMN IF NOT EXISTS interested_properties TEXT DEFAULT '[]'
    `);

    // Add missing columns to properties table (SAFE - preserves data)
    console.log('🔧 Updating properties table schema safely...');
    try {
      await pool.query(`
        ALTER TABLE properties
        ADD COLUMN IF NOT EXISTS address VARCHAR(255) DEFAULT ''
      `);

      await pool.query(`
        ALTER TABLE properties
        ADD COLUMN IF NOT EXISTS city VARCHAR(255) DEFAULT ''
      `);

      await pool.query(`
        ALTER TABLE properties
        ADD COLUMN IF NOT EXISTS surface DECIMAL DEFAULT 0
      `);

      await pool.query(`
        ALTER TABLE properties
        ADD COLUMN IF NOT EXISTS description TEXT DEFAULT ''
      `);

      await pool.query(`
        ALTER TABLE properties
        ADD COLUMN IF NOT EXISTS image_url VARCHAR(500) DEFAULT ''
      `);

      console.log('✅ Properties table schema updated safely (data preserved)');
    } catch (error) {
      console.log('⚠️ Properties table schema update failed:', error.message);
    }

    console.log('✅ Database tables initialized and migrated successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
};

// Initialize database on startup
initDatabase();

// Helper function to generate UUIDs
const generateId = () => {
  // Generate a simple UUID v4 format
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// WhatsApp welcome message function with Twilio
async function sendWelcomeWhatsAppMessage(lead) {
  try {
    // Get agent information
    const agentResult = await pool.query('SELECT * FROM team_members WHERE name = $1', [lead.assignedTo]);
    const agent = agentResult.rows[0];

    if (!agent) {
      console.log('⚠️ Agent not found for WhatsApp message');
      return { success: false, message: 'Agent not found' };
    }

    // Determine language (default to French if not specified)
    const userLanguage = lead.language || 'fr';
    console.log('🌐 WhatsApp message language:', userLanguage);

    // Format phone number for WhatsApp (international format)
    let phoneNumber = lead.phone.replace(/\D/g, '');

    // Handle different country codes properly
    if (phoneNumber.startsWith('0')) {
      // French number starting with 0 - add French country code
      phoneNumber = '33' + phoneNumber.substring(1);
    } else if (phoneNumber.startsWith('212')) {
      // Morocco number - keep as is
      phoneNumber = phoneNumber;
    } else if (phoneNumber.startsWith('33')) {
      // French number with country code - keep as is
      phoneNumber = phoneNumber;
    } else if (!phoneNumber.startsWith('33') && !phoneNumber.startsWith('212') && phoneNumber.length === 10) {
      // Assume French number if 10 digits and no country code
      phoneNumber = '33' + phoneNumber;
    }

    // Ensure it starts with + for Twilio
    if (!phoneNumber.startsWith('+')) {
      phoneNumber = '+' + phoneNumber;
    }

    // Create welcome message based on language
    let message;

    if (userLanguage === 'en') {
      // English message
      message = `🏠 *Welcome to LeadEstate!*

Hello ${lead.name}!

Thank you for your interest in our real estate services. I'm ${agent.name}, your dedicated advisor.

👤 *Your advisor:* ${agent.name}
📱 *My number:* ${agent.phone || '+33 1 23 45 67 89'}
📧 *My email:* ${agent.email || 'contact@leadestate.com'}

I'm here to help you with your real estate project. Don't hesitate to contact me for any questions!

Best regards,
${agent.name}
*LeadEstate - Your Real Estate Partner* 🏡`;
    } else {
      // French message (default)
      message = `🏠 *Bienvenue chez LeadEstate !*

Bonjour ${lead.name} !

Merci de votre intérêt pour nos services immobiliers. Je suis ${agent.name}, votre conseiller dédié.

👤 *Votre conseiller :* ${agent.name}
📱 *Mon numéro :* ${agent.phone || '+33 1 23 45 67 89'}
📧 *Mon email :* ${agent.email || 'contact@leadestate.com'}

Je suis là pour vous accompagner dans votre projet immobilier. N'hésitez pas à me contacter pour toute question !

À très bientôt,
${agent.name}
*LeadEstate - Votre partenaire immobilier* 🏡`;
    }

    console.log('📱 Preparing WhatsApp message for:', lead.name);
    console.log('📞 Phone:', phoneNumber);
    console.log('👤 Agent:', agent.name);

    // Try to send via Twilio if configured
    if (twilioClient && process.env.TWILIO_WHATSAPP_FROM) {
      try {
        const twilioMessage = await twilioClient.messages.create({
          from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
          to: `whatsapp:${phoneNumber}`,
          body: message
        });

        console.log('✅ WhatsApp message sent successfully via Twilio!');
        console.log('📧 Message SID:', twilioMessage.sid);
        console.log('📊 Status:', twilioMessage.status);

        return {
          success: true,
          method: 'twilio',
          messageSid: twilioMessage.sid,
          status: twilioMessage.status,
          agent: agent.name,
          leadName: lead.name,
          phoneNumber: phoneNumber
        };

      } catch (twilioError) {
        console.error('❌ Twilio WhatsApp send failed:', twilioError.message);

        // Fallback to URL method
        const whatsappUrl = `https://wa.me/${phoneNumber.replace('+', '')}?text=${encodeURIComponent(message)}`;

        return {
          success: true,
          method: 'fallback_url',
          whatsappUrl: whatsappUrl,
          agent: agent.name,
          leadName: lead.name,
          phoneNumber: phoneNumber,
          error: twilioError.message
        };
      }
    } else {
      // No Twilio configured - provide URL for manual sending
      const whatsappUrl = `https://wa.me/${phoneNumber.replace('+', '')}?text=${encodeURIComponent(message)}`;

      console.log('📱 Twilio not configured - WhatsApp URL prepared');
      console.log('🔗 WhatsApp URL:', whatsappUrl);

      return {
        success: true,
        method: 'url_only',
        whatsappUrl: whatsappUrl,
        agent: agent.name,
        leadName: lead.name,
        phoneNumber: phoneNumber
      };
    }

  } catch (error) {
    console.error('❌ Error in WhatsApp welcome message:', error);
    throw error;
  }
}

// Status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    message: 'LeadEstate API is running (PostgreSQL Mode)',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    storage: 'postgresql-database'
  });
});

// Database test endpoint
app.get('/api/test-db', async (req, res) => {
  try {
    console.log('🧪 Testing database connection...');

    // Test basic connection
    const timeResult = await pool.query('SELECT NOW() as current_time');
    console.log('✅ Database connection successful');

    // Test if leads table exists
    const tableCheck = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'leads'
    `);
    console.log('📋 Leads table check:', tableCheck.rows);

    // Test table structure
    const columnCheck = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'leads'
    `);
    console.log('🏗️ Leads table structure:', columnCheck.rows);

    res.json({
      success: true,
      message: 'Database test completed successfully',
      database_time: timeResult.rows[0].current_time,
      leads_table_exists: tableCheck.rows.length > 0,
      table_columns: columnCheck.rows
    });
  } catch (error) {
    console.error('❌ Database test failed:', error);
    res.status(500).json({
      success: false,
      message: 'Database test failed',
      error: error.message,
      stack: error.stack
    });
  }
});

// Test insert endpoint (GET version for easy testing)
app.get('/api/test-insert', async (req, res) => {
  try {
    console.log('🧪 Testing lead insert...');

    // Test data
    const testLead = {
      id: generateId(),
      first_name: 'Test',
      last_name: 'User',
      email: 'test@example.com',
      phone: '1234567890',
      whatsapp: '1234567890',
      source: 'website',
      budget: 100000,
      notes: 'Test notes',
      status: 'new',
      agency_id: 'test-agency',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    console.log('💾 Test lead data:', testLead);

    const result = await pool.query(`
      INSERT INTO leads (id, first_name, last_name, email, phone, whatsapp, source, budget, notes, status, agency_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      testLead.id, testLead.first_name, testLead.last_name, testLead.email, testLead.phone,
      testLead.whatsapp, testLead.source, testLead.budget, testLead.notes,
      testLead.status, testLead.agency_id, testLead.created_at, testLead.updated_at
    ]);

    console.log('✅ Test insert successful:', result.rows[0]);

    res.json({
      success: true,
      message: 'Test insert successful',
      inserted_data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Test insert failed:', error);
    res.status(500).json({
      success: false,
      message: 'Test insert failed',
      error: error.message,
      stack: error.stack,
      detail: error.detail || 'No additional details'
    });
  }
});

// Auth endpoints
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  if (email && password) {
    const user = {
      id: generateId(),
      name: 'Demo User',
      email: email,
      role: 'manager'
    };
    
    const token = 'demo-token-' + generateId();
    
    res.json({
      success: true,
      user: user,
      token: token,
      message: 'Login successful'
    });
  } else {
    res.status(400).json({
      success: false,
      message: 'Email and password required'
    });
  }
});

// Leads endpoints
app.get('/api/leads', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM leads ORDER BY created_at DESC');

    // Format data for frontend compatibility
    const formattedLeads = result.rows.map(lead => {
      let interestedProperties = [];
      try {
        interestedProperties = JSON.parse(lead.interested_properties || '[]');
      } catch (error) {
        interestedProperties = [];
      }

      return {
        id: lead.id,
        name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
        email: lead.email,
        phone: lead.phone,
        source: lead.source,
        budget: lead.budget,
        notes: lead.notes,
        status: lead.status,
        assignedTo: lead.assigned_to,
        interestedProperties: interestedProperties, // Include interested properties
        createdAt: lead.created_at,
        updatedAt: lead.updated_at,
        created_at: lead.created_at, // Keep both for compatibility
        updated_at: lead.updated_at
      };
    });

    console.log(`📊 Fetched ${formattedLeads.length} leads from database`);

    res.json({
      success: true,
      data: formattedLeads,
      count: formattedLeads.length
    });
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch leads'
    });
  }
});

app.post('/api/leads', async (req, res) => {
  try {
    console.log('📝 Received lead data:', req.body);

    const leadData = req.body;
    console.log('👤 Assigned to field:', leadData.assignedTo);

    // Split name into first_name and last_name
    const nameParts = (leadData.name || '').split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const newLead = {
      id: generateId(),
      first_name: firstName,
      last_name: lastName,
      email: leadData.email || '',
      phone: leadData.phone || '',
      whatsapp: leadData.phone || '', // Use phone as whatsapp for now
      source: leadData.source || 'website',
      budget: leadData.budget ? parseFloat(leadData.budget) : null,
      notes: leadData.notes || '',
      status: leadData.status || 'new',
      assigned_to: leadData.assignedTo || null, // Include assigned agent
      language: leadData.language || 'fr', // Include language preference
      agency_id: 'default-agency', // Default agency ID
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    console.log('💾 Saving lead to database:', newLead);

    const result = await pool.query(`
      INSERT INTO leads (id, first_name, last_name, email, phone, whatsapp, source, budget, notes, status, assigned_to, language, agency_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `, [
      newLead.id, newLead.first_name, newLead.last_name, newLead.email, newLead.phone,
      newLead.whatsapp, newLead.source, newLead.budget, newLead.notes,
      newLead.status, newLead.assigned_to, newLead.language, newLead.agency_id, newLead.created_at, newLead.updated_at
    ]);

    console.log('✅ Lead saved successfully:', result.rows[0]);

    // Return data in format frontend expects
    const responseData = {
      id: result.rows[0].id,
      name: `${result.rows[0].first_name} ${result.rows[0].last_name}`.trim(),
      email: result.rows[0].email,
      phone: result.rows[0].phone,
      source: result.rows[0].source,
      budget: result.rows[0].budget,
      notes: result.rows[0].notes,
      status: result.rows[0].status,
      assignedTo: result.rows[0].assigned_to,
      language: result.rows[0].language, // Include language in response
      createdAt: result.rows[0].created_at,
      updatedAt: result.rows[0].updated_at,
      created_at: result.rows[0].created_at, // Keep both for compatibility
      updated_at: result.rows[0].updated_at
    };

    // Send welcome WhatsApp message if phone number is provided and lead is assigned
    let whatsappResult = null;
    if (result.rows[0].phone && result.rows[0].assigned_to) {
      try {
        whatsappResult = await sendWelcomeWhatsAppMessage(responseData);
        console.log('📱 WhatsApp welcome result:', whatsappResult);
      } catch (whatsappError) {
        console.log('⚠️ WhatsApp message failed (non-critical):', whatsappError.message);
        whatsappResult = { success: false, error: whatsappError.message };
      }
    }

    // Include WhatsApp status in response
    const response = {
      success: true,
      data: responseData,
      message: 'Lead created successfully'
    };

    if (whatsappResult) {
      response.whatsapp = whatsappResult;
      if (whatsappResult.success && whatsappResult.method === 'twilio') {
        response.message += ' - WhatsApp welcome message sent automatically!';
      } else if (whatsappResult.success && whatsappResult.method === 'url_only') {
        response.message += ' - WhatsApp welcome message prepared (Twilio not configured)';
      }
    }

    res.status(201).json(response);
  } catch (error) {
    console.error('❌ Error creating lead:', error);
    console.error('❌ Error details:', error.message);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to create lead',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Database error'
    });
  }
});

app.put('/api/leads/:id', async (req, res) => {
  try {
    console.log('📝 Updating lead:', req.params.id, 'with data:', req.body);

    const { id } = req.params;
    const updateData = req.body;

    // Split name into first_name and last_name if provided
    let firstName = null;
    let lastName = null;
    if (updateData.name) {
      const nameParts = updateData.name.split(' ');
      firstName = nameParts[0] || '';
      lastName = nameParts.slice(1).join(' ') || '';
    }

    const result = await pool.query(`
      UPDATE leads SET
        first_name = COALESCE($2, first_name),
        last_name = COALESCE($3, last_name),
        email = COALESCE($4, email),
        phone = COALESCE($5, phone),
        whatsapp = COALESCE($6, whatsapp),
        source = COALESCE($7, source),
        budget = COALESCE($8, budget),
        notes = COALESCE($9, notes),
        status = COALESCE($10, status),
        assigned_to = COALESCE($11, assigned_to),
        updated_at = $12
      WHERE id = $1
      RETURNING *
    `, [
      id, firstName, lastName, updateData.email, updateData.phone,
      updateData.phone, updateData.source, updateData.budget ? parseFloat(updateData.budget) : null,
      updateData.notes, updateData.status, updateData.assignedTo, new Date().toISOString()
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    console.log('✅ Lead updated successfully:', result.rows[0]);

    // Format response for frontend compatibility
    const updatedLead = {
      id: result.rows[0].id,
      name: `${result.rows[0].first_name || ''} ${result.rows[0].last_name || ''}`.trim(),
      email: result.rows[0].email,
      phone: result.rows[0].phone,
      source: result.rows[0].source,
      budget: result.rows[0].budget,
      notes: result.rows[0].notes,
      status: result.rows[0].status,
      assignedTo: result.rows[0].assigned_to,
      createdAt: result.rows[0].created_at,
      updatedAt: result.rows[0].updated_at,
      created_at: result.rows[0].created_at, // Keep both for compatibility
      updated_at: result.rows[0].updated_at
    };

    res.json({
      success: true,
      data: updatedLead,
      message: 'Lead updated successfully'
    });
  } catch (error) {
    console.error('Error updating lead:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update lead'
    });
  }
});

app.delete('/api/leads/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM leads WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Lead deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting lead:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete lead'
    });
  }
});

// Property linking endpoints
app.post('/api/leads/:leadId/link-property/:propertyId', async (req, res) => {
  try {
    const { leadId, propertyId } = req.params;

    console.log('🔗 Linking property:', leadId, 'to', propertyId);

    // Get current lead
    const leadResult = await pool.query('SELECT * FROM leads WHERE id = $1', [leadId]);
    if (leadResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    const lead = leadResult.rows[0];
    let interestedProperties = [];

    try {
      interestedProperties = JSON.parse(lead.interested_properties || '[]');
    } catch (error) {
      interestedProperties = [];
    }

    // Add property if not already linked
    if (!interestedProperties.includes(propertyId)) {
      interestedProperties.push(propertyId);
    }

    // Update lead with new interested properties
    const result = await pool.query(
      'UPDATE leads SET interested_properties = $1, updated_at = $2 WHERE id = $3 RETURNING *',
      [JSON.stringify(interestedProperties), new Date().toISOString(), leadId]
    );

    console.log('✅ Property linked to lead successfully');

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Property linked successfully'
    });

  } catch (error) {
    console.error('❌ Error linking property to lead:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to link property to lead',
      error: error.message
    });
  }
});

app.delete('/api/leads/:leadId/unlink-property/:propertyId', async (req, res) => {
  try {
    const { leadId, propertyId } = req.params;

    console.log('🔗 Unlinking property:', propertyId, 'from', leadId);

    // Get current lead
    const leadResult = await pool.query('SELECT * FROM leads WHERE id = $1', [leadId]);
    if (leadResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    const lead = leadResult.rows[0];
    let interestedProperties = [];

    try {
      interestedProperties = JSON.parse(lead.interested_properties || '[]');
    } catch (error) {
      interestedProperties = [];
    }

    // Remove property from interested properties
    interestedProperties = interestedProperties.filter(id => id !== propertyId);

    // Update lead
    const result = await pool.query(
      'UPDATE leads SET interested_properties = $1, updated_at = $2 WHERE id = $3 RETURNING *',
      [JSON.stringify(interestedProperties), new Date().toISOString(), leadId]
    );

    console.log('✅ Property unlinked from lead successfully');

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Property unlinked successfully'
    });

  } catch (error) {
    console.error('❌ Error unlinking property from lead:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unlink property from lead',
      error: error.message
    });
  }
});

// Analytics endpoints
app.get('/api/analytics/leads-by-source', async (req, res) => {
  try {
    console.log('📊 Fetching leads by source...');

    const result = await pool.query(`
      SELECT
        LOWER(TRIM(source)) as source,
        COUNT(*) as count
      FROM leads
      WHERE source IS NOT NULL AND source != ''
      GROUP BY LOWER(TRIM(source))
      ORDER BY count DESC
    `);

    // Format data with proper types and clean names
    const formattedData = result.rows.map(row => ({
      name: row.source.charAt(0).toUpperCase() + row.source.slice(1).replace('_', ' '),
      source: row.source,
      count: parseInt(row.count)
    }));

    console.log('✅ Leads by source data:', formattedData);

    res.json({
      success: true,
      data: formattedData
    });
  } catch (error) {
    console.error('❌ Error fetching leads by source:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch leads by source analytics'
    });
  }
});

app.get('/api/analytics/leads-not-contacted', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM leads
      WHERE status = 'new'
    `);

    const totalResult = await pool.query('SELECT COUNT(*) as total FROM leads');
    const notContacted = parseInt(result.rows[0].count);
    const total = parseInt(totalResult.rows[0].total);
    const percentage = total > 0 ? ((notContacted / total) * 100).toFixed(1) : 0;

    res.json({
      success: true,
      data: {
        count: notContacted,
        total: total,
        percentage: parseFloat(percentage)
      }
    });
  } catch (error) {
    console.error('Error fetching not contacted leads:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch not contacted leads analytics'
    });
  }
});

app.get('/api/analytics/contacted-leads', async (req, res) => {
  try {
    const { period = 'week' } = req.query;

    let dateFilter = '';
    switch (period) {
      case 'day':
        dateFilter = "AND created_at >= NOW() - INTERVAL '1 day'";
        break;
      case 'week':
        dateFilter = "AND created_at >= NOW() - INTERVAL '1 week'";
        break;
      case 'month':
        dateFilter = "AND created_at >= NOW() - INTERVAL '1 month'";
        break;
      default:
        dateFilter = "AND created_at >= NOW() - INTERVAL '1 week'";
    }

    const contactedResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM leads
      WHERE status != 'new' ${dateFilter}
    `);

    const totalResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM leads
      WHERE 1=1 ${dateFilter}
    `);

    const contacted = parseInt(contactedResult.rows[0].count);
    const total = parseInt(totalResult.rows[0].total);
    const percentage = total > 0 ? ((contacted / total) * 100).toFixed(1) : 0;

    res.json({
      success: true,
      data: {
        contacted: contacted,
        total: total,
        percentage: parseFloat(percentage),
        period: period
      }
    });
  } catch (error) {
    console.error('Error fetching contacted leads:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contacted leads analytics'
    });
  }
});

app.get('/api/analytics/conversion-rate-by-source', async (req, res) => {
  try {
    console.log('📊 Fetching conversion rate by source...');

    const result = await pool.query(`
      SELECT
        source,
        COUNT(*) as total_leads,
        COUNT(CASE WHEN status = 'closed-won' THEN 1 END) as converted_leads,
        CASE
          WHEN COUNT(*) > 0 THEN
            ROUND((COUNT(CASE WHEN status = 'closed-won' THEN 1 END)::numeric / COUNT(*)::numeric) * 100, 2)
          ELSE 0
        END as conversion_rate
      FROM leads
      GROUP BY source
      ORDER BY conversion_rate DESC
    `);

    console.log('✅ Conversion rate data:', result.rows);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('❌ Error fetching conversion rate by source:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch conversion rate analytics',
      error: error.message
    });
  }
});

app.get('/api/analytics/avg-contact-time-by-agent', async (req, res) => {
  try {
    console.log('📊 Fetching average contact time by agent...');

    const result = await pool.query(`
      SELECT
        assigned_to as agent,
        COUNT(*) as total_leads,
        AVG(
          CASE
            WHEN status != 'new' AND updated_at > created_at THEN
              EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600
            ELSE NULL
          END
        ) as avg_hours_to_contact
      FROM leads
      WHERE assigned_to IS NOT NULL AND assigned_to != ''
      GROUP BY assigned_to
      ORDER BY avg_hours_to_contact ASC NULLS LAST
    `);

    console.log('✅ Agent contact time data:', result.rows);

    const formattedData = result.rows.map(row => ({
      agent: row.agent,
      total_leads: parseInt(row.total_leads),
      avg_hours_to_contact: row.avg_hours_to_contact ? parseFloat(row.avg_hours_to_contact).toFixed(1) : '0.0'
    }));

    res.json({
      success: true,
      data: formattedData
    });
  } catch (error) {
    console.error('❌ Error fetching average contact time by agent:', error);
    console.error('Error details:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch average contact time analytics',
      error: error.message
    });
  }
});

// Additional Analytics Endpoints
app.get('/api/analytics/leads-by-status', async (req, res) => {
  try {
    console.log('📊 Fetching leads by status...');

    const result = await pool.query(`
      SELECT
        status,
        COUNT(*) as count,
        ROUND((COUNT(*) * 100.0 / (SELECT COUNT(*) FROM leads)), 2) as percentage
      FROM leads
      GROUP BY status
      ORDER BY count DESC
    `);

    const formattedData = result.rows.map(row => ({
      name: row.status.charAt(0).toUpperCase() + row.status.slice(1).replace('-', ' '),
      status: row.status,
      count: parseInt(row.count),
      percentage: parseFloat(row.percentage)
    }));

    console.log('✅ Leads by status data:', formattedData);

    res.json({
      success: true,
      data: formattedData
    });
  } catch (error) {
    console.error('❌ Error fetching leads by status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch leads by status analytics'
    });
  }
});

app.get('/api/analytics/leads-by-agent', async (req, res) => {
  try {
    console.log('📊 Fetching leads by agent...');

    const result = await pool.query(`
      SELECT
        assigned_to as agent,
        COUNT(*) as total_leads,
        COUNT(CASE WHEN status = 'closed-won' THEN 1 END) as closed_won,
        COUNT(CASE WHEN status = 'new' THEN 1 END) as new_leads,
        COUNT(CASE WHEN status IN ('qualified', 'contacted') THEN 1 END) as active_leads
      FROM leads
      WHERE assigned_to IS NOT NULL AND assigned_to != ''
      GROUP BY assigned_to
      ORDER BY total_leads DESC
    `);

    const formattedData = result.rows.map(row => ({
      agent: row.agent,
      total_leads: parseInt(row.total_leads),
      closed_won: parseInt(row.closed_won),
      new_leads: parseInt(row.new_leads),
      active_leads: parseInt(row.active_leads),
      conversion_rate: row.total_leads > 0 ? ((row.closed_won / row.total_leads) * 100).toFixed(1) : '0.0'
    }));

    console.log('✅ Leads by agent data:', formattedData);

    res.json({
      success: true,
      data: formattedData
    });
  } catch (error) {
    console.error('❌ Error fetching leads by agent:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch leads by agent analytics'
    });
  }
});

app.get('/api/analytics/leads-timeline', async (req, res) => {
  try {
    console.log('📊 Fetching leads timeline...');

    const { period = 'week' } = req.query;
    let dateFormat, dateInterval;

    switch (period) {
      case 'day':
        dateFormat = 'YYYY-MM-DD HH24:00';
        dateInterval = '1 hour';
        break;
      case 'week':
        dateFormat = 'YYYY-MM-DD';
        dateInterval = '1 day';
        break;
      case 'month':
        dateFormat = 'YYYY-MM-DD';
        dateInterval = '1 day';
        break;
      default:
        dateFormat = 'YYYY-MM-DD';
        dateInterval = '1 day';
    }

    const result = await pool.query(`
      SELECT
        TO_CHAR(created_at, $1) as date,
        COUNT(*) as count,
        COUNT(CASE WHEN status = 'closed-won' THEN 1 END) as conversions
      FROM leads
      WHERE created_at >= NOW() - INTERVAL '1 ${period}'
      GROUP BY TO_CHAR(created_at, $1)
      ORDER BY date
    `, [dateFormat]);

    const formattedData = result.rows.map(row => ({
      date: row.date,
      leads: parseInt(row.count),
      conversions: parseInt(row.conversions)
    }));

    console.log('✅ Leads timeline data:', formattedData);

    res.json({
      success: true,
      data: formattedData,
      period: period
    });
  } catch (error) {
    console.error('❌ Error fetching leads timeline:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch leads timeline analytics'
    });
  }
});

app.get('/api/analytics/budget-analysis', async (req, res) => {
  try {
    console.log('📊 Fetching budget analysis...');

    const result = await pool.query(`
      SELECT
        CASE
          WHEN budget::numeric < 300000 THEN 'Under 300K'
          WHEN budget::numeric < 500000 THEN '300K - 500K'
          WHEN budget::numeric < 750000 THEN '500K - 750K'
          WHEN budget::numeric < 1000000 THEN '750K - 1M'
          ELSE 'Over 1M'
        END as budget_range,
        COUNT(*) as count,
        AVG(budget::numeric) as avg_budget,
        COUNT(CASE WHEN status = 'closed-won' THEN 1 END) as conversions
      FROM leads
      WHERE budget IS NOT NULL AND budget != '' AND budget ~ '^[0-9]+$'
      GROUP BY budget_range
      ORDER BY AVG(budget::numeric)
    `);

    const formattedData = result.rows.map(row => ({
      range: row.budget_range,
      count: parseInt(row.count),
      avg_budget: Math.round(parseFloat(row.avg_budget)),
      conversions: parseInt(row.conversions),
      conversion_rate: row.count > 0 ? ((row.conversions / row.count) * 100).toFixed(1) : '0.0'
    }));

    console.log('✅ Budget analysis data:', formattedData);

    res.json({
      success: true,
      data: formattedData
    });
  } catch (error) {
    console.error('❌ Error fetching budget analysis:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch budget analysis'
    });
  }
});

// Properties endpoints
app.get('/api/properties', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM properties ORDER BY created_at DESC');
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching properties:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch properties'
    });
  }
});

// POST /api/properties/upload - Upload property image
app.post('/api/properties/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file uploaded'
      });
    }

    const imageUrl = `/uploads/${req.file.filename}`;

    res.status(200).json({
      success: true,
      data: {
        imageUrl: imageUrl,
        filename: req.file.filename
      },
      message: 'Image uploaded successfully'
    });
  } catch (error) {
    console.error('❌ Error uploading image:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload image',
      error: error.message
    });
  }
});

app.post('/api/properties', async (req, res) => {
  try {
    console.log('📝 Creating property with data:', req.body);

    const propertyData = req.body;
    const newProperty = {
      id: generateId(),
      title: propertyData.title,
      type: propertyData.type,
      price: propertyData.price ? parseFloat(propertyData.price) : null,
      address: propertyData.address,
      city: propertyData.city,
      surface: propertyData.surface ? parseFloat(propertyData.surface) : null,
      description: propertyData.description,
      image_url: propertyData.image_url || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    console.log('💾 Saving property to database:', newProperty);

    const result = await pool.query(`
      INSERT INTO properties (id, title, type, price, address, city, surface, description, image_url, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      newProperty.id, newProperty.title, newProperty.type, newProperty.price,
      newProperty.address, newProperty.city, newProperty.surface, newProperty.description,
      newProperty.image_url, newProperty.created_at, newProperty.updated_at
    ]);

    console.log('✅ Property saved successfully:', result.rows[0]);

    // Format response for frontend compatibility
    const responseData = {
      ...result.rows[0],
      createdAt: result.rows[0].created_at,
      updatedAt: result.rows[0].updated_at
    };

    res.status(201).json({
      success: true,
      data: responseData,
      message: 'Property created successfully'
    });
  } catch (error) {
    console.error('❌ Error creating property:', error);
    console.error('❌ Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: 'Failed to create property',
      error: error.message,
      details: {
        code: error.code,
        detail: error.detail
      }
    });
  }
});

app.put('/api/properties/:id', async (req, res) => {
  try {
    console.log('📝 Updating property:', req.params.id, 'with data:', req.body);

    const { id } = req.params;
    const updateData = req.body;

    const result = await pool.query(`
      UPDATE properties SET
        title = COALESCE($2, title),
        type = COALESCE($3, type),
        price = COALESCE($4, price),
        address = COALESCE($5, address),
        city = COALESCE($6, city),
        surface = COALESCE($7, surface),
        description = COALESCE($8, description),
        image_url = COALESCE($9, image_url),
        updated_at = $10
      WHERE id = $1
      RETURNING *
    `, [
      id, updateData.title, updateData.type, updateData.price ? parseFloat(updateData.price) : null,
      updateData.address, updateData.city, updateData.surface ? parseFloat(updateData.surface) : null,
      updateData.description, updateData.image_url, new Date().toISOString()
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    console.log('✅ Property updated successfully:', result.rows[0]);

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Property updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating property:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update property',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Database error'
    });
  }
});

// Team endpoints
app.get('/api/team', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM team_members ORDER BY created_at DESC');

    // Format data for frontend compatibility
    const formattedTeamMembers = result.rows.map(member => ({
      ...member,
      createdAt: member.created_at,
      updatedAt: member.updated_at,
      joinedAt: member.joined_at,
      joinDate: member.joined_at // Frontend expects this field name
    }));

    res.json({
      success: true,
      data: formattedTeamMembers,
      count: formattedTeamMembers.length
    });
  } catch (error) {
    console.error('Error fetching team members:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch team members'
    });
  }
});

app.post('/api/team', async (req, res) => {
  try {
    const memberData = req.body;
    const newMember = {
      id: generateId(),
      ...memberData,
      status: 'active',
      joined_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    await pool.query(`
      INSERT INTO team_members (id, name, email, phone, role, department, status, joined_at, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      newMember.id, newMember.name, newMember.email, newMember.phone,
      newMember.role, newMember.department, newMember.status,
      newMember.joined_at, newMember.created_at, newMember.updated_at
    ]);
    
    // Format response for frontend compatibility
    const responseData = {
      ...newMember,
      joinDate: newMember.joined_at,
      createdAt: newMember.created_at,
      updatedAt: newMember.updated_at
    };

    res.status(201).json({
      success: true,
      data: responseData,
      message: 'Team member added successfully'
    });
  } catch (error) {
    console.error('Error creating team member:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create team member'
    });
  }
});

app.put('/api/team/:id', async (req, res) => {
  try {
    console.log('📝 Updating team member:', req.params.id, 'with data:', req.body);

    const { id } = req.params;
    const updateData = req.body;

    const result = await pool.query(`
      UPDATE team_members SET
        name = COALESCE($2, name),
        email = COALESCE($3, email),
        phone = COALESCE($4, phone),
        role = COALESCE($5, role),
        department = COALESCE($6, department),
        status = COALESCE($7, status),
        updated_at = $8
      WHERE id = $1
      RETURNING *
    `, [
      id, updateData.name, updateData.email, updateData.phone,
      updateData.role, updateData.department, updateData.status,
      new Date().toISOString()
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Team member not found'
      });
    }

    console.log('✅ Team member updated successfully:', result.rows[0]);

    // Format response for frontend compatibility
    const responseData = {
      ...result.rows[0],
      joinDate: result.rows[0].joined_at,
      createdAt: result.rows[0].created_at,
      updatedAt: result.rows[0].updated_at
    };

    res.json({
      success: true,
      data: responseData,
      message: 'Team member updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating team member:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update team member',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Database error'
    });
  }
});

// Dashboard stats endpoint
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const leadsResult = await pool.query('SELECT COUNT(*) as total, status FROM leads GROUP BY status');
    const propertiesResult = await pool.query('SELECT COUNT(*) as count FROM properties');
    
    const totalLeads = leadsResult.rows.reduce((sum, row) => sum + parseInt(row.total), 0);
    const closedWonLeads = leadsResult.rows.find(row => row.status === 'closed_won')?.total || 0;
    const availableProperties = propertiesResult.rows[0]?.count || 0;
    const conversionRate = totalLeads > 0 ? ((closedWonLeads / totalLeads) * 100).toFixed(1) : 0;
    
    const stats = {
      totalLeads: totalLeads,
      availableProperties: parseInt(availableProperties),
      conversionRate: parseFloat(conversionRate),
      closedWonLeads: parseInt(closedWonLeads)
    };
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard stats'
    });
  }
});

// Invitation routes
const invitationRoutes = require('./routes/invitations');
app.use('/api/invitations', invitationRoutes);

// Account setup routes
const accountSetupRoutes = require('./routes/account-setup');
app.use('/api/account-setup', accountSetupRoutes);

// Admin routes
const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes);

// User management routes
const userManagementRoutes = require('./routes/user-management');
app.use('/api/user-management', userManagementRoutes);

// Agency management routes (limited to single agency operations)
const agencyManagementRoutes = require('./routes/agency-management');
app.use('/api/agency-management', agencyManagementRoutes);

// Audit routes
const auditRoutes = require('./routes/audit');
app.use('/api/audit', auditRoutes);

// Advanced analytics routes
const advancedAnalyticsRoutes = require('./routes/advanced-analytics');
app.use('/api/advanced-analytics', advancedAnalyticsRoutes);

// Owner dashboard integration routes
const ownerIntegrationRoutes = require('./routes/owner-integration');
app.use('/api/owner-integration', ownerIntegrationRoutes);

// Initialize services
const reminderService = require('./services/reminderService');
const auditService = require('./services/auditService');
reminderService.startReminderScheduler();

// Error handling
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.path}`,
    timestamp: new Date().toISOString()
  });
});

app.use((error, req, res, next) => {
  console.error('API Error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// WhatsApp notification endpoint
app.post('/api/whatsapp/welcome/:leadId', async (req, res) => {
  try {
    const { leadId } = req.params;

    // Get lead information
    const leadResult = await pool.query('SELECT * FROM leads WHERE id = $1', [leadId]);
    if (leadResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    const lead = leadResult.rows[0];
    const leadData = {
      id: lead.id,
      name: `${lead.first_name} ${lead.last_name}`.trim(),
      phone: lead.phone,
      assignedTo: lead.assigned_to
    };

    if (!leadData.phone) {
      return res.status(400).json({
        success: false,
        message: 'Lead has no phone number'
      });
    }

    if (!leadData.assignedTo) {
      return res.status(400).json({
        success: false,
        message: 'Lead is not assigned to any agent'
      });
    }

    const result = await sendWelcomeWhatsAppMessage(leadData);

    res.json({
      success: true,
      data: result,
      message: 'WhatsApp welcome message prepared successfully'
    });

  } catch (error) {
    console.error('❌ Error in WhatsApp welcome endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to prepare WhatsApp message',
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🚀 LeadEstate API Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'production'}`);
  console.log(`💾 Storage: PostgreSQL Database`);
  console.log(`🌐 CORS enabled for production domains`);
  console.log(`📡 API Status: http://localhost:${PORT}/api/status`);
  console.log(`🔗 Property linking endpoints: ENABLED`);
});
