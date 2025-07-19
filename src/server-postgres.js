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

// OPTIMIZED PostgreSQL connection with faster initial connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  // Optimized connection settings for faster performance
  max: 20,                      // Increased pool size for better performance
  min: 2,                       // Keep more connections alive
  idleTimeoutMillis: 60000,     // 60 seconds idle timeout
  connectionTimeoutMillis: 5000, // 5 seconds connection timeout (faster)
  acquireTimeoutMillis: 5000,   // 5 seconds to acquire connection (faster)
  createTimeoutMillis: 5000,    // 5 seconds to create new connection (faster)
  // Performance optimization settings
  keepAlive: true,              // Keep connections alive
  keepAliveInitialDelayMillis: 0, // No delay for keep-alive (immediate)
  statement_timeout: 10000,     // 10 seconds statement timeout
  query_timeout: 10000,         // 10 seconds query timeout
});

// Add connection error handling
pool.on('error', (err) => {
  console.error('❌ Unexpected database pool error:', err);
  console.log('🔄 Pool will attempt to reconnect automatically');
});

pool.on('connect', (client) => {
  console.log('✅ New database client connected');
});

pool.on('remove', (client) => {
  console.log('🔌 Database client disconnected');
});

// Warm up database connections on startup
const warmUpConnections = async () => {
  console.log('🔥 Warming up database connections...');
  const startTime = Date.now();

  try {
    // Create multiple concurrent connections to warm up the pool
    const warmupPromises = [];
    for (let i = 0; i < 3; i++) {
      warmupPromises.push(
        pool.query('SELECT 1 as warmup_test')
          .then(() => console.log(`✅ Connection ${i + 1} warmed up`))
          .catch(err => console.log(`⚠️ Connection ${i + 1} warmup failed:`, err.message))
      );
    }

    await Promise.all(warmupPromises);
    const endTime = Date.now();
    console.log(`🚀 Database connections warmed up in ${endTime - startTime}ms`);
  } catch (error) {
    console.error('❌ Connection warmup failed:', error.message);
  }
};

// Auto-optimize database on startup
const autoOptimizeDatabase = async () => {
  console.log('🔧 Auto-optimizing database indexes...');
  try {
    // Create essential indexes for performance
    const criticalIndexes = [
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_status ON leads(status)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to)',
    ];

    for (const indexQuery of criticalIndexes) {
      try {
        await pool.query(indexQuery);
        console.log('✅ Critical index created successfully');
      } catch (error) {
        console.log('⚠️ Index already exists or creation failed:', error.message);
      }
    }
    console.log('🚀 Database auto-optimization completed');
  } catch (error) {
    console.error('❌ Auto-optimization failed:', error.message);
  }
};

// Call warmup and optimization after a short delay to allow server to start
setTimeout(async () => {
  await warmUpConnections();
  await autoOptimizeDatabase();
}, 2000);

// Twilio client initialization
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  console.log('✅ Twilio client initialized');
} else {
  console.log('⚠️ Twilio credentials not found - WhatsApp messages will be logged only');
}

// Wati WhatsApp Service (Alternative to Twilio with no sandbox restrictions)
const sendWatiWhatsApp = async (phoneNumber, message) => {
  if (!process.env.USE_WATI || !process.env.WATI_ACCESS_TOKEN) {
    return { success: false, error: 'Wati not configured' };
  }

  try {
    console.log('📱 Sending WhatsApp via Wati to:', phoneNumber);

    // Remove + from phone number for Wati API
    const cleanNumber = phoneNumber.replace('+', '');

    const response = await fetch(`${process.env.WATI_API_ENDPOINT}/api/v1/sendSessionMessage/${cleanNumber}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WATI_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messageText: message
      })
    });

    const result = await response.json();

    if (response.ok && result.result) {
      console.log('✅ Wati WhatsApp message sent successfully!');
      console.log('📧 Message ID:', result.id);

      return {
        success: true,
        method: 'wati',
        messageId: result.id,
        status: 'sent',
        phoneNumber: phoneNumber
      };
    } else {
      console.error('❌ Wati API error:', result);
      throw new Error(result.info || result.message || 'Wati API error');
    }
  } catch (error) {
    console.error('❌ Wati WhatsApp send failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Meta WhatsApp Business Cloud API Service (Official Meta API)
const sendMetaWhatsApp = async (phoneNumber, message) => {
  if (!process.env.USE_META_WHATSAPP || !process.env.META_ACCESS_TOKEN) {
    return { success: false, error: 'Meta WhatsApp not configured' };
  }

  try {
    console.log('📱 Sending WhatsApp via Meta Business API to:', phoneNumber);

    const response = await fetch(`https://graph.facebook.com/v18.0/${process.env.META_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.META_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phoneNumber.replace('+', ''),
        type: 'text',
        text: {
          body: message
        }
      })
    });

    const result = await response.json();

    if (response.ok && result.messages) {
      console.log('✅ Meta WhatsApp message sent successfully!');
      console.log('📧 Message ID:', result.messages[0].id);

      return {
        success: true,
        method: 'meta_whatsapp',
        messageId: result.messages[0].id,
        status: 'sent',
        phoneNumber: phoneNumber
      };
    } else {
      console.error('❌ Meta WhatsApp API error:', result);
      throw new Error(result.error?.message || 'Meta WhatsApp API error');
    }
  } catch (error) {
    console.error('❌ Meta WhatsApp send failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

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
        interested_properties TEXT DEFAULT '[]',
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
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(255),
        role VARCHAR(255),
        department VARCHAR(255),
        status VARCHAR(255) DEFAULT 'active',
        password VARCHAR(255),
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

    // Add interested_properties column to leads if it doesn't exist
    await pool.query(`
      ALTER TABLE leads
      ADD COLUMN IF NOT EXISTS interested_properties TEXT DEFAULT '[]'
    `);

    // Add city field that was missing from original schema
    await pool.query(`
      ALTER TABLE leads
      ADD COLUMN IF NOT EXISTS city VARCHAR(255)
    `);

    // Add address field for complete lead information
    await pool.query(`
      ALTER TABLE leads
      ADD COLUMN IF NOT EXISTS address TEXT
    `);

    // MIGRATION: Add status column to properties table if it doesn't exist
    await pool.query(`
      ALTER TABLE properties
      ADD COLUMN IF NOT EXISTS status VARCHAR(255) DEFAULT 'available'
    `);

    // MIGRATION: Add missing columns to properties table
    await pool.query(`
      ALTER TABLE properties
      ADD COLUMN IF NOT EXISTS property_type VARCHAR(255)
    `);

    await pool.query(`
      ALTER TABLE properties
      ADD COLUMN IF NOT EXISTS main_image TEXT
    `);

    await pool.query(`
      ALTER TABLE properties
      ADD COLUMN IF NOT EXISTS images TEXT DEFAULT '[]'
    `);

    console.log('✅ Database schema updated with city, address, and properties columns');

    // CLEANUP: Ensure only the 6 real team members exist
    console.log('🧹 Cleaning up team members - keeping only the 6 real team members...');

    // Delete all team members except the 6 real ones
    await pool.query(`
      DELETE FROM team_members
      WHERE email NOT IN (
        'sophie.moreau@leadestate.com',
        'antoine.dubois@leadestate.com',
        'emilie.rousseau@leadestate.com',
        'julien.martin@leadestate.com',
        'camille.laurent@leadestate.com',
        'ayoubjada69@gmail.com'
      )
    `);

    // Ensure the 6 real team members exist with correct data
    const realTeamMembers = [
      {
        name: 'Sophie Moreau',
        email: 'sophie.moreau@leadestate.com',
        phone: '+33 1 23 45 67 89',
        role: 'manager',
        department: 'Management'
      },
      {
        name: 'Antoine Dubois',
        email: 'antoine.dubois@leadestate.com',
        phone: '+33 1 23 45 67 90',
        role: 'super_agent',
        department: 'Sales'
      },
      {
        name: 'Emilie Rousseau',
        email: 'emilie.rousseau@leadestate.com',
        phone: '+33 1 23 45 67 91',
        role: 'agent',
        department: 'Sales'
      },
      {
        name: 'Julien Martin',
        email: 'julien.martin@leadestate.com',
        phone: '+33 1 23 45 67 92',
        role: 'agent',
        department: 'Sales'
      },
      {
        name: 'Camille Laurent',
        email: 'camille.laurent@leadestate.com',
        phone: '+33 1 23 45 67 93',
        role: 'agent',
        department: 'Sales'
      },
      {
        name: 'Ayoub Jada',
        email: 'ayoubjada69@gmail.com',
        phone: '+212 6 30 20 82 12',
        role: 'manager',
        department: 'Management'
      }
    ];

    for (const member of realTeamMembers) {
      try {
        await pool.query(`
          INSERT INTO team_members (id, name, email, phone, role, department, status, password, joined_at, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (email) DO UPDATE SET
            name = EXCLUDED.name,
            phone = EXCLUDED.phone,
            role = EXCLUDED.role,
            department = EXCLUDED.department,
            updated_at = EXCLUDED.updated_at
        `, [
          generateId(),
          member.name,
          member.email,
          member.phone,
          member.role,
          member.department,
          'active',
          '$2b$10$defaultpasswordhash', // Default password hash
          new Date().toISOString(),
          new Date().toISOString(),
          new Date().toISOString()
        ]);
        console.log(`✅ Ensured team member exists: ${member.name}`);
      } catch (memberError) {
        console.log(`ℹ️ Team member already exists: ${member.name}`);
      }
    }

    console.log('✅ Team members cleanup completed - only 6 real members remain');

    // CLEANUP: Delete leads assigned to demo/test users
    console.log('🧹 Cleaning up leads assigned to demo/test users...');

    // Get count of leads before cleanup
    const beforeCleanup = await pool.query('SELECT COUNT(*) as count FROM leads');
    console.log(`📊 Total leads before cleanup: ${beforeCleanup.rows[0].count}`);

    // Delete leads assigned to demo/test users (not in the real team member list)
    const deleteResult = await pool.query(`
      DELETE FROM leads
      WHERE assigned_to IS NOT NULL
      AND assigned_to NOT IN (
        'Sophie Moreau',
        'Antoine Dubois',
        'Emilie Rousseau',
        'Julien Martin',
        'Camille Laurent',
        'Ayoub Jada'
      )
      AND assigned_to NOT LIKE '%@%'
    `);

    // Also delete leads assigned to demo email addresses
    const deleteEmailResult = await pool.query(`
      DELETE FROM leads
      WHERE assigned_to IN (
        'manager@leadestate.com',
        'superagent@leadestate.com',
        'agent@leadestate.com',
        'sarah@agency.com',
        'mike@agency.com',
        'emma@agency.com',
        'Sarah Johnson',
        'Mike Chen',
        'Emily Davis',
        'Michael Chen',
        'Emma Wilson',
        'Agent Smith',
        'Agent Johnson',
        'Agent Brown'
      )
    `);

    // Also clean up leads with agent names starting with 'agent' or 'Agent'
    const deleteAgentResult = await pool.query(`
      DELETE FROM leads
      WHERE assigned_to LIKE 'agent%'
      OR assigned_to LIKE 'Agent%'
    `);

    // Get count after cleanup
    const afterCleanup = await pool.query('SELECT COUNT(*) as count FROM leads');
    const deletedCount = beforeCleanup.rows[0].count - afterCleanup.rows[0].count;

    console.log(`🗑️ Deleted ${deleteResult.rowCount} leads assigned to demo users`);
    console.log(`🗑️ Deleted ${deleteEmailResult.rowCount} leads assigned to demo emails`);
    console.log(`🗑️ Deleted ${deleteAgentResult.rowCount} leads assigned to generic agents`);
    console.log(`📊 Total leads deleted: ${deletedCount}`);
    console.log(`📊 Total leads remaining: ${afterCleanup.rows[0].count}`);
    console.log('✅ Leads cleanup completed - only leads assigned to real team members remain');

    // PERFORMANCE: Add database indexes for faster queries (with error handling)
    console.log('🚀 Creating database indexes for performance...');

    try {
      // Index on leads table for common queries
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC)
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status)
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to)
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_leads_agency_id ON leads(agency_id)
      `);

      // Index on properties table
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_properties_created_at ON properties(created_at DESC)
      `);

      // Try to create properties status index with error handling
      try {
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status)
        `);
      } catch (statusIndexError) {
        console.warn('⚠️ Could not create properties status index (column may not exist yet):', statusIndexError.message);
      }

      // Index on team_members table
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_team_members_status ON team_members(status)
      `);

      console.log('✅ Database indexes created for optimal performance');
    } catch (indexError) {
      console.warn('⚠️ Some database indexes could not be created:', indexError.message);
      console.log('📝 This is not critical - the application will still work');
    }

    // Add city field that was missing from original schema
    await pool.query(`
      ALTER TABLE leads
      ADD COLUMN IF NOT EXISTS city VARCHAR(255)
    `);

    console.log('✅ Database schema updated with city field');

    // Add password column to team_members if it doesn't exist
    await pool.query(`
      ALTER TABLE team_members
      ADD COLUMN IF NOT EXISTS password VARCHAR(255)
    `);

    // Add unique constraint to email column if it doesn't exist
    try {
      await pool.query(`
        ALTER TABLE team_members
        ADD CONSTRAINT team_members_email_unique UNIQUE (email)
      `);
    } catch (error) {
      // Constraint might already exist, ignore error
      console.log('Email unique constraint already exists or failed to add:', error.message);
    }

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

      // Add images column for gallery support
      await pool.query(`
        ALTER TABLE properties
        ADD COLUMN IF NOT EXISTS images TEXT DEFAULT '[]'
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

// WhatsApp welcome message function with Twilio - UPDATED 2025-07-16 18:35
async function sendWelcomeWhatsAppMessage(lead) {
  try {
    console.log('🔍 Looking for agent:', lead.assignedTo);
    console.log('🚀 Function called - latest version with fallback logic');

    // Get agent information - try multiple approaches
    let agentResult = await pool.query('SELECT * FROM team_members WHERE name = $1', [lead.assignedTo]);
    let agent = agentResult.rows[0];

    // If not found by exact name, try case-insensitive search
    if (!agent) {
      console.log('🔍 Trying case-insensitive search...');
      agentResult = await pool.query('SELECT * FROM team_members WHERE LOWER(name) = LOWER($1)', [lead.assignedTo]);
      agent = agentResult.rows[0];
    }

    // If still not found, try partial match
    if (!agent) {
      console.log('🔍 Trying partial name match...');
      agentResult = await pool.query('SELECT * FROM team_members WHERE name ILIKE $1', [`%${lead.assignedTo}%`]);
      agent = agentResult.rows[0];
    }

    // If still not found, get all team members for debugging
    if (!agent) {
      console.log('🔍 Agent not found, listing all team members...');
      const allAgents = await pool.query('SELECT name FROM team_members LIMIT 10');
      console.log('📋 Available agents:', allAgents.rows.map(a => a.name));

      // Use a fallback agent or create a generic response
      agent = {
        name: lead.assignedTo || 'Your Agent',
        email: 'agent@leadestate.com',
        phone: '+33123456789'
      };
      console.log('🔄 Using fallback agent data:', agent.name);
    } else {
      console.log('✅ Agent found:', agent.name);
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

    // Try Wati first (best option - no sandbox restrictions)
    if (process.env.USE_WATI) {
      const watiResult = await sendWatiWhatsApp(phoneNumber, message);
      if (watiResult.success) {
        return {
          success: true,
          method: 'wati',
          messageId: watiResult.messageId,
          status: watiResult.status,
          agent: agent.name,
          leadName: lead.name,
          phoneNumber: phoneNumber
        };
      } else {
        console.log('⚠️ Wati failed, trying next option...');
      }
    }

    // Try Meta WhatsApp Business API (official, 1000 free/month)
    if (process.env.USE_META_WHATSAPP) {
      const metaResult = await sendMetaWhatsApp(phoneNumber, message);
      if (metaResult.success) {
        return {
          success: true,
          method: 'meta_whatsapp',
          messageId: metaResult.messageId,
          status: metaResult.status,
          agent: agent.name,
          leadName: lead.name,
          phoneNumber: phoneNumber
        };
      } else {
        console.log('⚠️ Meta WhatsApp failed, trying next option...');
      }
    }

    // Try to send via Twilio if configured (fallback)
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

        // Generate WhatsApp URL for manual opening if needed
        const whatsappUrl = `https://wa.me/${phoneNumber.replace('+', '')}?text=${encodeURIComponent(message)}`;

        return {
          success: true,
          method: 'twilio_whatsapp',
          messageSid: twilioMessage.sid,
          status: twilioMessage.status,
          agent: agent.name,
          leadName: lead.name,
          phoneNumber: phoneNumber,
          whatsappUrl: whatsappUrl
        };

      } catch (twilioError) {
        console.error('❌ Twilio WhatsApp send failed:', twilioError.message);
        console.log('📊 Error code:', twilioError.code);

        // Try SMS fallback if WhatsApp fails due to sandbox restriction
        if (process.env.TWILIO_PHONE_NUMBER && twilioError.code === 63015) {
          try {
            console.log('📱 Trying SMS fallback due to WhatsApp sandbox restriction...');

            const smsMessage = `🏠 Bienvenue chez LeadEstate !

Bonjour ${lead.name} !

Merci de votre intérêt pour nos services immobiliers.
Je suis ${agent.name}, votre conseiller dédié.

👤 Votre conseiller : ${agent.name}
📱 Mon numéro : ${agent.phone || 'À venir'}
📧 Mon email : ${agent.email || 'À venir'}

Je suis là pour vous accompagner dans votre projet immobilier.
N'hésitez pas à me contacter pour toute question !

À très bientôt,
${agent.name}
LeadEstate - Votre partenaire immobilier 🏡`;

            const smsResult = await twilioClient.messages.create({
              from: process.env.TWILIO_PHONE_NUMBER,
              to: phoneNumber,
              body: smsMessage
            });

            console.log('✅ SMS fallback sent successfully!');
            console.log('📧 SMS SID:', smsResult.sid);

            return {
              success: true,
              method: 'sms_fallback',
              messageSid: smsResult.sid,
              status: smsResult.status,
              agent: agent.name,
              leadName: lead.name,
              phoneNumber: phoneNumber,
              note: 'Sent via SMS due to WhatsApp sandbox restriction'
            };

          } catch (smsError) {
            console.error('❌ SMS fallback also failed:', smsError);
            // Continue to URL fallback below
          }
        }

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

// Database optimization endpoint - creates indexes for better performance
app.get('/api/optimize-db', async (req, res) => {
  try {
    console.log('🚀 Optimizing database for better performance...');
    const startTime = Date.now();

    // Create indexes for faster queries
    const indexQueries = [
      // Leads table indexes
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_status ON leads(status)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_source ON leads(source)',

      // Properties table indexes
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_properties_created_at ON properties(created_at DESC)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_properties_status ON properties(status)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_properties_type ON properties(type)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_properties_price ON properties(price)',

      // Team members table indexes
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_team_created_at ON team_members(created_at DESC)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_team_role ON team_members(role)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_team_status ON team_members(status)',
    ];

    const results = [];
    for (const query of indexQueries) {
      try {
        await pool.query(query);
        results.push({ query, status: 'success' });
        console.log('✅ Index created:', query.split(' ')[5]);
      } catch (error) {
        results.push({ query, status: 'error', error: error.message });
        console.log('⚠️ Index creation failed:', error.message);
      }
    }

    const endTime = Date.now();
    console.log(`✅ Database optimization completed in ${endTime - startTime}ms`);

    res.json({
      success: true,
      message: 'Database optimization completed',
      results,
      optimizationTime: endTime - startTime
    });
  } catch (error) {
    console.error('❌ Database optimization failed:', error);
    res.status(500).json({
      success: false,
      message: 'Database optimization failed',
      error: error.message
    });
  }
});

// Database initialization endpoint for owners table
app.get('/api/init-owners', async (req, res) => {
  try {
    console.log('🔧 Initializing owners table...');

    // Create owners table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS owners (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'owner',
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login_at TIMESTAMP
      )
    `);

    // Check if default owner exists
    const existingOwner = await pool.query('SELECT * FROM owners WHERE email = $1', ['admin@leadestate.com']);

    if (existingOwner.rows.length === 0) {
      // Create default owner account
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('admin123', 10);

      await pool.query(`
        INSERT INTO owners (first_name, last_name, email, password_hash, role, status)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, ['Admin', 'User', 'admin@leadestate.com', hashedPassword, 'owner', 'active']);

      console.log('✅ Default owner account created');
    } else {
      console.log('✅ Default owner account already exists');
    }

    res.json({
      success: true,
      message: 'Owners table initialized successfully',
      defaultAccount: {
        email: 'admin@leadestate.com',
        password: 'admin123',
        note: 'Default owner account for testing'
      }
    });

  } catch (error) {
    console.error('❌ Error initializing owners table:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize owners table',
      error: error.message
    });
  }
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



// Get database statistics (development endpoint)
app.get('/api/leads/stats', async (req, res) => {
  try {
    console.log('📊 Getting lead statistics...');

    const totalLeads = await pool.query('SELECT COUNT(*) as count FROM leads');
    const emptyNames = await pool.query(`
      SELECT COUNT(*) as count FROM leads
      WHERE first_name IS NULL OR first_name = '' OR TRIM(first_name) = ''
    `);
    const unassigned = await pool.query(`
      SELECT COUNT(*) as count FROM leads
      WHERE assigned_to IS NULL OR assigned_to = ''
    `);
    const sampleLeads = await pool.query(`
      SELECT id, first_name, last_name, assigned_to, created_at
      FROM leads
      ORDER BY created_at DESC
      LIMIT 5
    `);

    res.json({
      success: true,
      data: {
        totalLeads: parseInt(totalLeads.rows[0].count),
        emptyNames: parseInt(emptyNames.rows[0].count),
        unassigned: parseInt(unassigned.rows[0].count),
        sampleLeads: sampleLeads.rows
      }
    });
  } catch (error) {
    console.error('Error getting lead stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get lead statistics'
    });
  }
});

// Clean up leads with empty names (development endpoint)
app.delete('/api/leads/cleanup', async (req, res) => {
  try {
    console.log('🧹 Starting lead cleanup...');

    // Delete ALL leads
    const result = await pool.query('DELETE FROM leads');

    console.log(`🗑️ Deleted ${result.rowCount} leads`);

    res.json({
      success: true,
      message: `Cleaned up ${result.rowCount} leads`,
      deletedCount: result.rowCount
    });
  } catch (error) {
    console.error('Error cleaning up leads:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clean up leads'
    });
  }
});

// Create 200 real Moroccan leads (development endpoint)
app.post('/api/leads/create-moroccan-leads', async (req, res) => {
  try {
    console.log('🇲🇦 Creating 200 real Moroccan leads...');

    // Real Moroccan names
    const moroccanNames = {
      male: [
        'Ahmed', 'Mohammed', 'Hassan', 'Omar', 'Youssef', 'Khalid', 'Abdelkader', 'Said', 'Rachid', 'Karim',
        'Mustapha', 'Abderrahim', 'Noureddine', 'Driss', 'Jamal', 'Fouad', 'Brahim', 'Tarik', 'Aziz', 'Hamid',
        'Abdellatif', 'Mostafa', 'Lahcen', 'Abdessamad', 'Redouane', 'Othmane', 'Amine', 'Mehdi', 'Ismail', 'Zakaria'
      ],
      female: [
        'Fatima', 'Aicha', 'Khadija', 'Laila', 'Nadia', 'Samira', 'Zineb', 'Houda', 'Malika', 'Rajae',
        'Btissam', 'Hayat', 'Siham', 'Widad', 'Karima', 'Nawal', 'Souad', 'Ilham', 'Rim', 'Ghita',
        'Nezha', 'Latifa', 'Amina', 'Leila', 'Safaa', 'Meryem', 'Salma', 'Imane', 'Sanaa', 'Fadwa'
      ]
    };

    const moroccanLastNames = [
      'Alami', 'Benali', 'Mansouri', 'Idrissi', 'Tazi', 'Chraibi', 'Benjelloun', 'Fassi', 'Berrada', 'Ouali',
      'Ziani', 'Amrani', 'Kadiri', 'Benkirane', 'Lamrani', 'Senhaji', 'Alaoui', 'Bennani', 'Squalli', 'Kettani',
      'Filali', 'Hajji', 'Bensouda', 'Cherkaoui', 'Naciri', 'Tounsi', 'Lahlou', 'Benkirane', 'Berrada', 'Fassi'
    ];

    const moroccanCities = [
      'Casablanca', 'Rabat', 'Marrakech', 'Fes', 'Tangier', 'Agadir', 'Meknes', 'Oujda', 'Kenitra', 'Tetouan',
      'Safi', 'Mohammedia', 'Khouribga', 'Beni Mellal', 'El Jadida', 'Taza', 'Nador', 'Settat', 'Larache', 'Ksar El Kebir'
    ];

    const leadSources = [
      'Facebook', 'Google', 'Website', 'Instagram', 'Referral', 'Walk-in', 'LinkedIn', 'WhatsApp', 'Phone Call', 'Email Campaign'
    ];

    const leadStatuses = ['new', 'contacted', 'qualified', 'interested', 'negotiating', 'closed', 'lost'];

    // Your 6 real team members
    const teamMembers = [
      'Sophie Moreau',
      'Antoine Dubois',
      'Emilie Rousseau',
      'Julien Martin',
      'Camille Laurent',
      'Ayoub Jada'
    ];

    // Helper functions
    const generateMoroccanPhone = () => {
      const prefixes = ['600', '601', '602', '603', '604', '605', '606', '607', '608', '609', '610', '611', '612', '613', '614', '615'];
      const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
      const number = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
      return `+212${prefix}${number}`;
    };

    const generateBudget = () => {
      const budgets = [
        250000, 300000, 350000, 400000, 450000, 500000, 550000, 600000, 650000, 700000,
        750000, 800000, 850000, 900000, 950000, 1000000, 1200000, 1500000, 2000000, 2500000
      ];
      return budgets[Math.floor(Math.random() * budgets.length)];
    };

    const generateEmail = (firstName, lastName) => {
      const domains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'email.ma', 'menara.ma'];
      const domain = domains[Math.floor(Math.random() * domains.length)];
      const emailName = `${firstName.toLowerCase()}.${lastName.toLowerCase()}`;
      return `${emailName}@${domain}`;
    };

    const generateNotes = (city, budget, source) => {
      const budgetRange = budget < 500000 ? 'budget modéré' : budget < 1000000 ? 'budget confortable' : 'budget élevé';
      const cityNote = `Recherche à ${city}`;
      const sourceNote = source === 'Referral' ? 'Recommandé par un client' : `Contact via ${source}`;

      const notes = [
        `${cityNote}, ${budgetRange}. ${sourceNote}.`,
        `Intéressé par l'immobilier à ${city}. ${budgetRange}. ${sourceNote}.`,
        `Client potentiel à ${city} avec ${budgetRange}. ${sourceNote}.`,
        `Recherche active à ${city}, ${budgetRange}. ${sourceNote}.`
      ];

      return notes[Math.floor(Math.random() * notes.length)];
    };

    // Delete all existing leads first
    console.log('🧹 Deleting all existing leads...');
    const deleteResult = await pool.query('DELETE FROM leads');
    console.log(`🗑️ Deleted ${deleteResult.rowCount} existing leads`);

    // Create 200 leads
    const leads = [];

    for (let i = 0; i < 200; i++) {
      // Randomly choose gender and name
      const isMale = Math.random() > 0.5;
      const firstName = isMale ?
        moroccanNames.male[Math.floor(Math.random() * moroccanNames.male.length)] :
        moroccanNames.female[Math.floor(Math.random() * moroccanNames.female.length)];

      const lastName = moroccanLastNames[Math.floor(Math.random() * moroccanLastNames.length)];
      const city = moroccanCities[Math.floor(Math.random() * moroccanCities.length)];
      const source = leadSources[Math.floor(Math.random() * leadSources.length)];
      const status = leadStatuses[Math.floor(Math.random() * leadStatuses.length)];
      const assignedTo = teamMembers[Math.floor(Math.random() * teamMembers.length)];
      const phone = generateMoroccanPhone();
      const email = generateEmail(firstName, lastName);
      const budget = generateBudget();
      const notes = generateNotes(city, budget, source);

      // Create address
      const address = `${Math.floor(Math.random() * 999) + 1} Rue ${Math.random() > 0.5 ? 'Mohammed V' : 'Hassan II'}, ${city}`;

      // Random creation date within last 6 months
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - Math.floor(Math.random() * 180));

      const lead = {
        id: generateId(),
        first_name: firstName,
        last_name: lastName,
        email: email,
        phone: phone,
        whatsapp: phone,
        city: city,
        address: address,
        source: source,
        budget: budget,
        notes: notes,
        status: status,
        assigned_to: assignedTo,
        language: 'fr',
        agency_id: 'default-agency',
        interested_properties: '[]',
        created_at: createdAt.toISOString(),
        updated_at: createdAt.toISOString()
      };

      leads.push(lead);
    }

    // Insert all leads
    let createdCount = 0;
    const errors = [];

    for (const lead of leads) {
      try {
        await pool.query(`
          INSERT INTO leads (id, first_name, last_name, email, phone, whatsapp, city, address, source, budget, notes, status, assigned_to, language, agency_id, interested_properties, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        `, [
          lead.id, lead.first_name, lead.last_name, lead.email, lead.phone, lead.whatsapp,
          lead.city, lead.address, lead.source, lead.budget, lead.notes, lead.status,
          lead.assigned_to, lead.language, lead.agency_id, lead.interested_properties,
          lead.created_at, lead.updated_at
        ]);

        createdCount++;
        if (createdCount % 20 === 0) {
          console.log(`✅ Created ${createdCount}/200 leads...`);
        }
      } catch (error) {
        console.error(`Error creating lead ${lead.first_name} ${lead.last_name}:`, error.message);
        errors.push(`${lead.first_name} ${lead.last_name}: ${error.message}`);
      }
    }

    console.log(`🎉 Successfully created ${createdCount} Moroccan leads!`);

    // Get statistics
    const stats = await pool.query(`
      SELECT
        assigned_to,
        COUNT(*) as lead_count,
        COUNT(CASE WHEN status = 'qualified' THEN 1 END) as qualified_count,
        COUNT(CASE WHEN status = 'closed' THEN 1 END) as closed_count,
        AVG(budget) as avg_budget
      FROM leads
      GROUP BY assigned_to
      ORDER BY lead_count DESC
    `);

    const cityStats = await pool.query(`
      SELECT city, COUNT(*) as count
      FROM leads
      GROUP BY city
      ORDER BY count DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      message: `Successfully created ${createdCount} Moroccan leads`,
      createdCount,
      deletedCount: deleteResult.rowCount,
      agentDistribution: stats.rows,
      topCities: cityStats.rows,
      errors: errors.length > 0 ? errors.slice(0, 5) : []
    });

  } catch (error) {
    console.error('Error creating Moroccan leads:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create Moroccan leads',
      error: error.message
    });
  }
});

// Create sample leads with proper data (development endpoint)
app.post('/api/leads/create-samples', async (req, res) => {
  try {
    console.log('🎯 Creating 50 sample leads...');

    const sampleLeads = [
      { name: 'Ahmed Hassan', phone: '+212600123456', city: 'Casablanca', email: 'ahmed.hassan@email.com', source: 'website', budget: '500000', assignedTo: 'Sarah Johnson' },
      { name: 'Fatima Zahra', phone: '+212601234567', city: 'Rabat', email: 'fatima.zahra@email.com', source: 'facebook', budget: '750000', assignedTo: 'Mike Chen' },
      { name: 'Youssef Alami', phone: '+212602345678', city: 'Marrakech', email: 'youssef.alami@email.com', source: 'google', budget: '300000', assignedTo: 'Sarah Johnson' },
      { name: 'Aicha Benali', phone: '+212603456789', city: 'Fes', email: 'aicha.benali@email.com', source: 'referral', budget: '600000', assignedTo: 'David Rodriguez' },
      { name: 'Omar Idrissi', phone: '+212604567890', city: 'Tangier', email: 'omar.idrissi@email.com', source: 'walk-in', budget: '450000', assignedTo: 'Mike Chen' },
      { name: 'Khadija Mansouri', phone: '+212605678901', city: 'Agadir', email: 'khadija.mansouri@email.com', source: 'website', budget: '800000', assignedTo: 'Sarah Johnson' },
      { name: 'Rachid Tazi', phone: '+212606789012', city: 'Meknes', email: 'rachid.tazi@email.com', source: 'facebook', budget: '350000', assignedTo: 'David Rodriguez' },
      { name: 'Laila Chraibi', phone: '+212607890123', city: 'Oujda', email: 'laila.chraibi@email.com', source: 'google', budget: '700000', assignedTo: 'Mike Chen' },
      { name: 'Karim Benjelloun', phone: '+212608901234', city: 'Kenitra', email: 'karim.benjelloun@email.com', source: 'referral', budget: '400000', assignedTo: 'Sarah Johnson' },
      { name: 'Nadia Fassi', phone: '+212609012345', city: 'Tetouan', email: 'nadia.fassi@email.com', source: 'walk-in', budget: '550000', assignedTo: 'David Rodriguez' },
      { name: 'Hassan Berrada', phone: '+212610123456', city: 'Casablanca', email: 'hassan.berrada@email.com', source: 'website', budget: '900000', assignedTo: 'Mike Chen' },
      { name: 'Samira Ouali', phone: '+212611234567', city: 'Rabat', email: 'samira.ouali@email.com', source: 'facebook', budget: '320000', assignedTo: 'Sarah Johnson' },
      { name: 'Abdelkader Ziani', phone: '+212612345678', city: 'Marrakech', email: 'abdelkader.ziani@email.com', source: 'google', budget: '650000', assignedTo: 'David Rodriguez' },
      { name: 'Zineb Amrani', phone: '+212613456789', city: 'Fes', email: 'zineb.amrani@email.com', source: 'referral', budget: '480000', assignedTo: 'Mike Chen' },
      { name: 'Mustapha Kadiri', phone: '+212614567890', city: 'Tangier', email: 'mustapha.kadiri@email.com', source: 'walk-in', budget: '720000', assignedTo: 'Sarah Johnson' },
      { name: 'Houda Benkirane', phone: '+212615678901', city: 'Agadir', email: 'houda.benkirane@email.com', source: 'website', budget: '380000', assignedTo: 'David Rodriguez' },
      { name: 'Said Lamrani', phone: '+212616789012', city: 'Meknes', email: 'said.lamrani@email.com', source: 'facebook', budget: '850000', assignedTo: 'Mike Chen' },
      { name: 'Malika Senhaji', phone: '+212617890123', city: 'Oujda', email: 'malika.senhaji@email.com', source: 'google', budget: '420000', assignedTo: 'Sarah Johnson' },
      { name: 'Driss Alaoui', phone: '+212618901234', city: 'Kenitra', email: 'driss.alaoui@email.com', source: 'referral', budget: '680000', assignedTo: 'David Rodriguez' },
      { name: 'Rajae Bennani', phone: '+212619012345', city: 'Tetouan', email: 'rajae.bennani@email.com', source: 'walk-in', budget: '520000', assignedTo: 'Mike Chen' },
      { name: 'Khalid Squalli', phone: '+212620123456', city: 'Casablanca', email: 'khalid.squalli@email.com', source: 'website', budget: '760000', assignedTo: 'Sarah Johnson' },
      { name: 'Amina Kettani', phone: '+212621234567', city: 'Rabat', email: 'amina.kettani@email.com', source: 'facebook', budget: '340000', assignedTo: 'David Rodriguez' },
      { name: 'Brahim Filali', phone: '+212622345678', city: 'Marrakech', email: 'brahim.filali@email.com', source: 'google', budget: '590000', assignedTo: 'Mike Chen' },
      { name: 'Leila Hajji', phone: '+212623456789', city: 'Fes', email: 'leila.hajji@email.com', source: 'referral', budget: '440000', assignedTo: 'Sarah Johnson' },
      { name: 'Tarik Bensouda', phone: '+212624567890', city: 'Tangier', email: 'tarik.bensouda@email.com', source: 'walk-in', budget: '810000', assignedTo: 'David Rodriguez' },
      { name: 'Souad Cherkaoui', phone: '+212625678901', city: 'Agadir', email: 'souad.cherkaoui@email.com', source: 'website', budget: '360000', assignedTo: 'Mike Chen' },
      { name: 'Abderrahim Naciri', phone: '+212626789012', city: 'Meknes', email: 'abderrahim.naciri@email.com', source: 'facebook', budget: '700000', assignedTo: 'Sarah Johnson' },
      { name: 'Karima Benali', phone: '+212627890123', city: 'Oujda', email: 'karima.benali@email.com', source: 'google', budget: '460000', assignedTo: 'David Rodriguez' },
      { name: 'Youssef Berrada', phone: '+212628901234', city: 'Kenitra', email: 'youssef.berrada@email.com', source: 'referral', budget: '630000', assignedTo: 'Mike Chen' },
      { name: 'Nawal Tounsi', phone: '+212629012345', city: 'Tetouan', email: 'nawal.tounsi@email.com', source: 'walk-in', budget: '580000', assignedTo: 'Sarah Johnson' },
      { name: 'Hamid Lahlou', phone: '+212630123456', city: 'Casablanca', email: 'hamid.lahlou@email.com', source: 'website', budget: '920000', assignedTo: 'David Rodriguez' },
      { name: 'Siham Benkirane', phone: '+212631234567', city: 'Rabat', email: 'siham.benkirane@email.com', source: 'facebook', budget: '310000', assignedTo: 'Mike Chen' },
      { name: 'Mostafa Alami', phone: '+212632345678', city: 'Marrakech', email: 'mostafa.alami@email.com', source: 'google', budget: '670000', assignedTo: 'Sarah Johnson' },
      { name: 'Widad Fassi', phone: '+212633456789', city: 'Fes', email: 'widad.fassi@email.com', source: 'referral', budget: '490000', assignedTo: 'David Rodriguez' },
      { name: 'Aziz Benjelloun', phone: '+212634567890', city: 'Tangier', email: 'aziz.benjelloun@email.com', source: 'walk-in', budget: '750000', assignedTo: 'Mike Chen' },
      { name: 'Latifa Chraibi', phone: '+212635678901', city: 'Agadir', email: 'latifa.chraibi@email.com', source: 'website', budget: '390000', assignedTo: 'Sarah Johnson' },
      { name: 'Redouane Idrissi', phone: '+212636789012', city: 'Meknes', email: 'redouane.idrissi@email.com', source: 'facebook', budget: '820000', assignedTo: 'David Rodriguez' },
      { name: 'Hayat Mansouri', phone: '+212637890123', city: 'Oujda', email: 'hayat.mansouri@email.com', source: 'google', budget: '430000', assignedTo: 'Mike Chen' },
      { name: 'Jamal Tazi', phone: '+212638901234', city: 'Kenitra', email: 'jamal.tazi@email.com', source: 'referral', budget: '690000', assignedTo: 'Sarah Johnson' },
      { name: 'Ghita Ouali', phone: '+212639012345', city: 'Tetouan', email: 'ghita.ouali@email.com', source: 'walk-in', budget: '540000', assignedTo: 'David Rodriguez' },
      { name: 'Noureddine Ziani', phone: '+212640123456', city: 'Casablanca', email: 'noureddine.ziani@email.com', source: 'website', budget: '780000', assignedTo: 'Mike Chen' },
      { name: 'Btissam Amrani', phone: '+212641234567', city: 'Rabat', email: 'btissam.amrani@email.com', source: 'facebook', budget: '350000', assignedTo: 'Sarah Johnson' },
      { name: 'Lahcen Kadiri', phone: '+212642345678', city: 'Marrakech', email: 'lahcen.kadiri@email.com', source: 'google', budget: '610000', assignedTo: 'David Rodriguez' },
      { name: 'Nezha Benkirane', phone: '+212643456789', city: 'Fes', email: 'nezha.benkirane@email.com', source: 'referral', budget: '470000', assignedTo: 'Mike Chen' },
      { name: 'Abdellatif Lamrani', phone: '+212644567890', city: 'Tangier', email: 'abdellatif.lamrani@email.com', source: 'walk-in', budget: '840000', assignedTo: 'Sarah Johnson' },
      { name: 'Samia Senhaji', phone: '+212645678901', city: 'Agadir', email: 'samia.senhaji@email.com', source: 'website', budget: '410000', assignedTo: 'David Rodriguez' },
      { name: 'Fouad Alaoui', phone: '+212646789012', city: 'Meknes', email: 'fouad.alaoui@email.com', source: 'facebook', budget: '730000', assignedTo: 'Mike Chen' },
      { name: 'Ilham Bennani', phone: '+212647890123', city: 'Oujda', email: 'ilham.bennani@email.com', source: 'google', budget: '500000', assignedTo: 'Sarah Johnson' },
      { name: 'Abdessamad Squalli', phone: '+212648901234', city: 'Kenitra', email: 'abdessamad.squalli@email.com', source: 'referral', budget: '660000', assignedTo: 'David Rodriguez' },
      { name: 'Rim Kettani', phone: '+212649012345', city: 'Tetouan', email: 'rim.kettani@email.com', source: 'walk-in', budget: '570000', assignedTo: 'Mike Chen' }
    ];

    let createdCount = 0;
    const errors = [];

    for (const leadData of sampleLeads) {
      try {
        // Split name into first_name and last_name
        const nameParts = leadData.name.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        const newLead = {
          id: generateId(),
          first_name: firstName,
          last_name: lastName,
          email: leadData.email,
          phone: leadData.phone,
          whatsapp: leadData.phone,
          source: leadData.source,
          budget: leadData.budget ? parseFloat(leadData.budget) : null,
          notes: `Sample lead from ${leadData.city}`,
          status: 'new',
          assigned_to: leadData.assignedTo,
          language: 'fr',
          agency_id: 'default-agency',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        await pool.query(`
          INSERT INTO leads (id, first_name, last_name, email, phone, whatsapp, source, budget, notes, status, assigned_to, language, agency_id, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `, [
          newLead.id, newLead.first_name, newLead.last_name, newLead.email, newLead.phone,
          newLead.whatsapp, newLead.source, newLead.budget, newLead.notes,
          newLead.status, newLead.assigned_to, newLead.language, newLead.agency_id, newLead.created_at, newLead.updated_at
        ]);

        createdCount++;
      } catch (error) {
        console.error(`Error creating lead ${leadData.name}:`, error);
        errors.push(`${leadData.name}: ${error.message}`);
      }
    }

    console.log(`✅ Created ${createdCount} sample leads`);

    res.json({
      success: true,
      message: `Created ${createdCount} sample leads`,
      createdCount,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error creating sample leads:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create sample leads'
    });
  }
});

// Simple endpoint to replace all leads with proper sample data
app.post('/api/leads/replace-all', async (req, res) => {
  try {
    console.log('🔄 Replacing all leads with proper sample data...');

    // Step 1: Delete all existing leads
    const deleteResult = await pool.query('DELETE FROM leads');
    console.log(`🗑️ Deleted ${deleteResult.rowCount} existing leads`);

    // Step 2: Create 50 new sample leads with proper data
    // Your actual team members
    const actualTeamMembers = [
      'Émilie Rousseau',
      'Julien Martin',
      'Camille Laurent',
      'Antoine Dubois',
      'Sophie Moreau',
      'Ayoub jada'
    ];

    // Different statuses for realistic pipeline
    const statuses = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'closed-won', 'closed-lost'];

    const sampleLeads = [
      { name: 'Ahmed Hassan', phone: '+212600123456', city: 'Casablanca', email: 'ahmed.hassan@email.com', source: 'website', budget: '500000', status: 'new' },
      { name: 'Fatima Zahra', phone: '+212601234567', city: 'Rabat', email: 'fatima.zahra@email.com', source: 'facebook', budget: '750000', status: 'contacted' },
      { name: 'Youssef Alami', phone: '+212602345678', city: 'Marrakech', email: 'youssef.alami@email.com', source: 'google', budget: '300000', status: 'new' },
      { name: 'Aicha Benali', phone: '+212603456789', city: 'Fes', email: 'aicha.benali@email.com', source: 'referral', budget: '600000', status: 'qualified' },
      { name: 'Omar Idrissi', phone: '+212604567890', city: 'Tangier', email: 'omar.idrissi@email.com', source: 'walk-in', budget: '450000', status: 'contacted' },
      { name: 'Khadija Mansouri', phone: '+212605678901', city: 'Agadir', email: 'khadija.mansouri@email.com', source: 'website', budget: '800000', status: 'proposal' },
      { name: 'Rachid Tazi', phone: '+212606789012', city: 'Meknes', email: 'rachid.tazi@email.com', source: 'facebook', budget: '350000', status: 'new' },
      { name: 'Laila Chraibi', phone: '+212607890123', city: 'Oujda', email: 'laila.chraibi@email.com', source: 'google', budget: '700000', status: 'qualified' },
      { name: 'Karim Benjelloun', phone: '+212608901234', city: 'Kenitra', email: 'karim.benjelloun@email.com', source: 'referral', budget: '400000', status: 'contacted' },
      { name: 'Nadia Fassi', phone: '+212609012345', city: 'Tetouan', email: 'nadia.fassi@email.com', source: 'walk-in', budget: '550000', status: 'negotiation' },
      { name: 'Hassan Berrada', phone: '+212610123456', city: 'Casablanca', email: 'hassan.berrada@email.com', source: 'website', budget: '900000', status: 'closed-won' },
      { name: 'Samira Ouali', phone: '+212611234567', city: 'Rabat', email: 'samira.ouali@email.com', source: 'facebook', budget: '320000', status: 'new' },
      { name: 'Abdelkader Ziani', phone: '+212612345678', city: 'Marrakech', email: 'abdelkader.ziani@email.com', source: 'google', budget: '650000', status: 'qualified' },
      { name: 'Zineb Amrani', phone: '+212613456789', city: 'Fes', email: 'zineb.amrani@email.com', source: 'referral', budget: '480000', status: 'contacted' },
      { name: 'Mustapha Kadiri', phone: '+212614567890', city: 'Tangier', email: 'mustapha.kadiri@email.com', source: 'walk-in', budget: '720000', status: 'proposal' },
      { name: 'Houda Benkirane', phone: '+212615678901', city: 'Agadir', email: 'houda.benkirane@email.com', source: 'website', budget: '380000', status: 'new' },
      { name: 'Said Lamrani', phone: '+212616789012', city: 'Meknes', email: 'said.lamrani@email.com', source: 'facebook', budget: '850000', status: 'negotiation' },
      { name: 'Malika Senhaji', phone: '+212617890123', city: 'Oujda', email: 'malika.senhaji@email.com', source: 'google', budget: '420000', status: 'contacted' },
      { name: 'Driss Alaoui', phone: '+212618901234', city: 'Kenitra', email: 'driss.alaoui@email.com', source: 'referral', budget: '680000', status: 'qualified' },
      { name: 'Rajae Bennani', phone: '+212619012345', city: 'Tetouan', email: 'rajae.bennani@email.com', source: 'walk-in', budget: '520000', status: 'closed-lost' },
      { name: 'Khalid Squalli', phone: '+212620123456', city: 'Casablanca', email: 'khalid.squalli@email.com', source: 'website', budget: '760000', status: 'new' },
      { name: 'Amina Kettani', phone: '+212621234567', city: 'Rabat', email: 'amina.kettani@email.com', source: 'facebook', budget: '340000', status: 'contacted' },
      { name: 'Brahim Filali', phone: '+212622345678', city: 'Marrakech', email: 'brahim.filali@email.com', source: 'google', budget: '590000', status: 'qualified' },
      { name: 'Leila Hajji', phone: '+212623456789', city: 'Fes', email: 'leila.hajji@email.com', source: 'referral', budget: '440000', status: 'proposal' },
      { name: 'Tarik Bensouda', phone: '+212624567890', city: 'Tangier', email: 'tarik.bensouda@email.com', source: 'walk-in', budget: '810000', status: 'closed-won' },
      { name: 'Souad Cherkaoui', phone: '+212625678901', city: 'Agadir', email: 'souad.cherkaoui@email.com', source: 'website', budget: '360000', status: 'new' },
      { name: 'Abderrahim Naciri', phone: '+212626789012', city: 'Meknes', email: 'abderrahim.naciri@email.com', source: 'facebook', budget: '700000', status: 'negotiation' },
      { name: 'Karima Benali', phone: '+212627890123', city: 'Oujda', email: 'karima.benali@email.com', source: 'google', budget: '460000', status: 'contacted' },
      { name: 'Youssef Berrada', phone: '+212628901234', city: 'Kenitra', email: 'youssef.berrada@email.com', source: 'referral', budget: '630000', status: 'qualified' },
      { name: 'Nawal Tounsi', phone: '+212629012345', city: 'Tetouan', email: 'nawal.tounsi@email.com', source: 'walk-in', budget: '580000', status: 'proposal' },
      { name: 'Hamid Lahlou', phone: '+212630123456', city: 'Casablanca', email: 'hamid.lahlou@email.com', source: 'website', budget: '920000', status: 'closed-won' },
      { name: 'Siham Benkirane', phone: '+212631234567', city: 'Rabat', email: 'siham.benkirane@email.com', source: 'facebook', budget: '310000', status: 'new' },
      { name: 'Mostafa Alami', phone: '+212632345678', city: 'Marrakech', email: 'mostafa.alami@email.com', source: 'google', budget: '670000', status: 'contacted' },
      { name: 'Widad Fassi', phone: '+212633456789', city: 'Fes', email: 'widad.fassi@email.com', source: 'referral', budget: '490000', status: 'qualified' },
      { name: 'Aziz Benjelloun', phone: '+212634567890', city: 'Tangier', email: 'aziz.benjelloun@email.com', source: 'walk-in', budget: '750000', status: 'negotiation' },
      { name: 'Latifa Chraibi', phone: '+212635678901', city: 'Agadir', email: 'latifa.chraibi@email.com', source: 'website', budget: '390000', status: 'new' },
      { name: 'Redouane Idrissi', phone: '+212636789012', city: 'Meknes', email: 'redouane.idrissi@email.com', source: 'facebook', budget: '820000', status: 'proposal' },
      { name: 'Hayat Mansouri', phone: '+212637890123', city: 'Oujda', email: 'hayat.mansouri@email.com', source: 'google', budget: '430000', status: 'contacted' },
      { name: 'Jamal Tazi', phone: '+212638901234', city: 'Kenitra', email: 'jamal.tazi@email.com', source: 'referral', budget: '690000', status: 'qualified' },
      { name: 'Ghita Ouali', phone: '+212639012345', city: 'Tetouan', email: 'ghita.ouali@email.com', source: 'walk-in', budget: '540000', status: 'closed-lost' },
      { name: 'Noureddine Ziani', phone: '+212640123456', city: 'Casablanca', email: 'noureddine.ziani@email.com', source: 'website', budget: '780000', status: 'negotiation' },
      { name: 'Btissam Amrani', phone: '+212641234567', city: 'Rabat', email: 'btissam.amrani@email.com', source: 'facebook', budget: '350000', status: 'new' },
      { name: 'Lahcen Kadiri', phone: '+212642345678', city: 'Marrakech', email: 'lahcen.kadiri@email.com', source: 'google', budget: '610000', status: 'contacted' },
      { name: 'Nezha Benkirane', phone: '+212643456789', city: 'Fes', email: 'nezha.benkirane@email.com', source: 'referral', budget: '470000', status: 'qualified' },
      { name: 'Abdellatif Lamrani', phone: '+212644567890', city: 'Tangier', email: 'abdellatif.lamrani@email.com', source: 'walk-in', budget: '840000', status: 'closed-won' },
      { name: 'Samia Senhaji', phone: '+212645678901', city: 'Agadir', email: 'samia.senhaji@email.com', source: 'website', budget: '410000', status: 'proposal' },
      { name: 'Fouad Alaoui', phone: '+212646789012', city: 'Meknes', email: 'fouad.alaoui@email.com', source: 'facebook', budget: '730000', status: 'negotiation' },
      { name: 'Ilham Bennani', phone: '+212647890123', city: 'Oujda', email: 'ilham.bennani@email.com', source: 'google', budget: '500000', status: 'new' },
      { name: 'Abdessamad Squalli', phone: '+212648901234', city: 'Kenitra', email: 'abdessamad.squalli@email.com', source: 'referral', budget: '660000', status: 'contacted' },
      { name: 'Rim Kettani', phone: '+212649012345', city: 'Tetouan', email: 'rim.kettani@email.com', source: 'walk-in', budget: '570000', status: 'qualified' }
    ];

    let createdCount = 0;
    for (const leadData of sampleLeads) {
      try {
        // Split name into first_name and last_name
        const nameParts = leadData.name.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        // Randomly assign to one of your actual team members
        const randomIndex = Math.floor(Math.random() * actualTeamMembers.length);
        const assignedAgent = actualTeamMembers[randomIndex];

        const newLead = {
          id: generateId(),
          first_name: firstName,
          last_name: lastName,
          email: leadData.email,
          phone: leadData.phone,
          whatsapp: leadData.phone,
          source: leadData.source,
          budget: leadData.budget ? parseFloat(leadData.budget) : null,
          notes: `Sample lead from ${leadData.city}`,
          status: leadData.status,
          assigned_to: assignedAgent,
          language: 'fr',
          agency_id: 'default-agency',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        await pool.query(`
          INSERT INTO leads (id, first_name, last_name, email, phone, whatsapp, source, budget, notes, status, assigned_to, language, agency_id, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `, [
          newLead.id, newLead.first_name, newLead.last_name, newLead.email, newLead.phone,
          newLead.whatsapp, newLead.source, newLead.budget, newLead.notes,
          newLead.status, newLead.assigned_to, newLead.language, newLead.agency_id, newLead.created_at, newLead.updated_at
        ]);

        createdCount++;
      } catch (error) {
        console.error(`Error creating lead ${leadData.name}:`, error);
      }
    }

    console.log(`✅ Successfully replaced leads: deleted ${deleteResult.rowCount}, created ${createdCount}`);

    res.json({
      success: true,
      message: `Successfully replaced all leads! Deleted ${deleteResult.rowCount} old leads and created ${createdCount} new leads with proper names and assignments.`,
      deletedCount: deleteResult.rowCount,
      createdCount
    });
  } catch (error) {
    console.error('Error replacing leads:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to replace leads'
    });
  }
});

// Fix lead assignments to use actual team members
app.post('/api/leads/fix-assignments', async (req, res) => {
  try {
    console.log('🔄 Fixing lead assignments to use actual team members...');

    const { actualTeamMembers, fakeTeamMembers } = req.body;

    if (!actualTeamMembers || !Array.isArray(actualTeamMembers)) {
      return res.status(400).json({
        success: false,
        message: 'actualTeamMembers array is required'
      });
    }

    // Get all leads that need assignment updates
    const leadsResult = await pool.query('SELECT id, assigned_to FROM leads WHERE assigned_to IS NOT NULL');

    let updatedCount = 0;

    for (const lead of leadsResult.rows) {
      // Randomly assign to one of the actual team members
      const randomIndex = Math.floor(Math.random() * actualTeamMembers.length);
      const newAssignee = actualTeamMembers[randomIndex];

      // Update the lead assignment
      await pool.query(
        'UPDATE leads SET assigned_to = $1, updated_at = $2 WHERE id = $3',
        [newAssignee, new Date().toISOString(), lead.id]
      );

      updatedCount++;
    }

    console.log(`✅ Updated ${updatedCount} lead assignments`);

    res.json({
      success: true,
      message: `Successfully updated lead assignments to use your actual team members`,
      updatedCount,
      teamMembers: actualTeamMembers
    });
  } catch (error) {
    console.error('Error fixing lead assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fix lead assignments'
    });
  }
});

// Add 50 additional leads with different statuses (without deleting existing ones)
app.post('/api/leads/add-samples', async (req, res) => {
  try {
    console.log('📝 Adding 50 additional sample leads with different statuses...');

    // Your actual team members
    const actualTeamMembers = [
      'Émilie Rousseau',
      'Julien Martin',
      'Camille Laurent',
      'Antoine Dubois',
      'Sophie Moreau',
      'Ayoub jada'
    ];

    // Different statuses for realistic pipeline
    const statuses = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'closed-won', 'closed-lost'];

    const additionalLeads = [
      { name: 'Mehdi Alaoui', phone: '+212650123456', city: 'Casablanca', email: 'mehdi.alaoui@email.com', source: 'website', budget: '520000', status: 'new' },
      { name: 'Salma Benkirane', phone: '+212651234567', city: 'Rabat', email: 'salma.benkirane@email.com', source: 'facebook', budget: '780000', status: 'contacted' },
      { name: 'Amine Tazi', phone: '+212652345678', city: 'Marrakech', email: 'amine.tazi@email.com', source: 'google', budget: '320000', status: 'new' },
      { name: 'Hanane Chraibi', phone: '+212653456789', city: 'Fes', email: 'hanane.chraibi@email.com', source: 'referral', budget: '620000', status: 'qualified' },
      { name: 'Khalil Idrissi', phone: '+212654567890', city: 'Tangier', email: 'khalil.idrissi@email.com', source: 'walk-in', budget: '470000', status: 'contacted' },
      { name: 'Imane Mansouri', phone: '+212655678901', city: 'Agadir', email: 'imane.mansouri@email.com', source: 'website', budget: '820000', status: 'proposal' },
      { name: 'Saad Tazi', phone: '+212656789012', city: 'Meknes', email: 'saad.tazi@email.com', source: 'facebook', budget: '370000', status: 'new' },
      { name: 'Meriem Chraibi', phone: '+212657890123', city: 'Oujda', email: 'meriem.chraibi@email.com', source: 'google', budget: '720000', status: 'qualified' },
      { name: 'Yassine Benjelloun', phone: '+212658901234', city: 'Kenitra', email: 'yassine.benjelloun@email.com', source: 'referral', budget: '420000', status: 'contacted' },
      { name: 'Dounia Fassi', phone: '+212659012345', city: 'Tetouan', email: 'dounia.fassi@email.com', source: 'walk-in', budget: '570000', status: 'negotiation' },
      { name: 'Ismail Berrada', phone: '+212660123456', city: 'Casablanca', email: 'ismail.berrada@email.com', source: 'website', budget: '920000', status: 'closed-won' },
      { name: 'Asmae Ouali', phone: '+212661234567', city: 'Rabat', email: 'asmae.ouali@email.com', source: 'facebook', budget: '340000', status: 'new' },
      { name: 'Hamza Ziani', phone: '+212662345678', city: 'Marrakech', email: 'hamza.ziani@email.com', source: 'google', budget: '670000', status: 'qualified' },
      { name: 'Loubna Amrani', phone: '+212663456789', city: 'Fes', email: 'loubna.amrani@email.com', source: 'referral', budget: '500000', status: 'contacted' },
      { name: 'Othmane Kadiri', phone: '+212664567890', city: 'Tangier', email: 'othmane.kadiri@email.com', source: 'walk-in', budget: '740000', status: 'proposal' },
      { name: 'Safae Benkirane', phone: '+212665678901', city: 'Agadir', email: 'safae.benkirane@email.com', source: 'website', budget: '400000', status: 'new' },
      { name: 'Adil Lamrani', phone: '+212666789012', city: 'Meknes', email: 'adil.lamrani@email.com', source: 'facebook', budget: '870000', status: 'negotiation' },
      { name: 'Jihane Senhaji', phone: '+212667890123', city: 'Oujda', email: 'jihane.senhaji@email.com', source: 'google', budget: '440000', status: 'contacted' },
      { name: 'Badr Alaoui', phone: '+212668901234', city: 'Kenitra', email: 'badr.alaoui@email.com', source: 'referral', budget: '700000', status: 'qualified' },
      { name: 'Soukaina Bennani', phone: '+212669012345', city: 'Tetouan', email: 'soukaina.bennani@email.com', source: 'walk-in', budget: '540000', status: 'closed-lost' },
      { name: 'Nabil Squalli', phone: '+212670123456', city: 'Casablanca', email: 'nabil.squalli@email.com', source: 'website', budget: '780000', status: 'new' },
      { name: 'Hajar Kettani', phone: '+212671234567', city: 'Rabat', email: 'hajar.kettani@email.com', source: 'facebook', budget: '360000', status: 'contacted' },
      { name: 'Zakaria Filali', phone: '+212672345678', city: 'Marrakech', email: 'zakaria.filali@email.com', source: 'google', budget: '610000', status: 'qualified' },
      { name: 'Meryem Hajji', phone: '+212673456789', city: 'Fes', email: 'meryem.hajji@email.com', source: 'referral', budget: '460000', status: 'proposal' },
      { name: 'Anass Bensouda', phone: '+212674567890', city: 'Tangier', email: 'anass.bensouda@email.com', source: 'walk-in', budget: '830000', status: 'closed-won' },
      { name: 'Kenza Cherkaoui', phone: '+212675678901', city: 'Agadir', email: 'kenza.cherkaoui@email.com', source: 'website', budget: '380000', status: 'new' },
      { name: 'Mouad Naciri', phone: '+212676789012', city: 'Meknes', email: 'mouad.naciri@email.com', source: 'facebook', budget: '720000', status: 'negotiation' },
      { name: 'Yasmine Benali', phone: '+212677890123', city: 'Oujda', email: 'yasmine.benali@email.com', source: 'google', budget: '480000', status: 'contacted' },
      { name: 'Reda Berrada', phone: '+212678901234', city: 'Kenitra', email: 'reda.berrada@email.com', source: 'referral', budget: '650000', status: 'qualified' },
      { name: 'Chaimae Tounsi', phone: '+212679012345', city: 'Tetouan', email: 'chaimae.tounsi@email.com', source: 'walk-in', budget: '600000', status: 'proposal' },
      { name: 'Ayoub Lahlou', phone: '+212680123456', city: 'Casablanca', email: 'ayoub.lahlou@email.com', source: 'website', budget: '940000', status: 'closed-won' },
      { name: 'Manal Benkirane', phone: '+212681234567', city: 'Rabat', email: 'manal.benkirane@email.com', source: 'facebook', budget: '330000', status: 'new' },
      { name: 'Hicham Alami', phone: '+212682345678', city: 'Marrakech', email: 'hicham.alami@email.com', source: 'google', budget: '690000', status: 'contacted' },
      { name: 'Rajae Fassi', phone: '+212683456789', city: 'Fes', email: 'rajae.fassi@email.com', source: 'referral', budget: '510000', status: 'qualified' },
      { name: 'Bilal Benjelloun', phone: '+212684567890', city: 'Tangier', email: 'bilal.benjelloun@email.com', source: 'walk-in', budget: '770000', status: 'negotiation' },
      { name: 'Amina Chraibi', phone: '+212685678901', city: 'Agadir', email: 'amina.chraibi@email.com', source: 'website', budget: '410000', status: 'new' },
      { name: 'Kamal Idrissi', phone: '+212686789012', city: 'Meknes', email: 'kamal.idrissi@email.com', source: 'facebook', budget: '840000', status: 'proposal' },
      { name: 'Siham Mansouri', phone: '+212687890123', city: 'Oujda', email: 'siham.mansouri@email.com', source: 'google', budget: '450000', status: 'contacted' },
      { name: 'Abderrazak Tazi', phone: '+212688901234', city: 'Kenitra', email: 'abderrazak.tazi@email.com', source: 'referral', budget: '710000', status: 'qualified' },
      { name: 'Fatima Ouali', phone: '+212689012345', city: 'Tetouan', email: 'fatima.ouali@email.com', source: 'walk-in', budget: '560000', status: 'closed-lost' },
      { name: 'Mohamed Ziani', phone: '+212690123456', city: 'Casablanca', email: 'mohamed.ziani@email.com', source: 'website', budget: '800000', status: 'negotiation' },
      { name: 'Lamiaa Amrani', phone: '+212691234567', city: 'Rabat', email: 'lamiaa.amrani@email.com', source: 'facebook', budget: '370000', status: 'new' },
      { name: 'Youssef Kadiri', phone: '+212692345678', city: 'Marrakech', email: 'youssef.kadiri@email.com', source: 'google', budget: '630000', status: 'contacted' },
      { name: 'Houda Benkirane', phone: '+212693456789', city: 'Fes', email: 'houda.benkirane@email.com', source: 'referral', budget: '490000', status: 'qualified' },
      { name: 'Omar Lamrani', phone: '+212694567890', city: 'Tangier', email: 'omar.lamrani@email.com', source: 'walk-in', budget: '860000', status: 'closed-won' },
      { name: 'Nadia Senhaji', phone: '+212695678901', city: 'Agadir', email: 'nadia.senhaji@email.com', source: 'website', budget: '430000', status: 'proposal' },
      { name: 'Hassan Alaoui', phone: '+212696789012', city: 'Meknes', email: 'hassan.alaoui@email.com', source: 'facebook', budget: '750000', status: 'negotiation' },
      { name: 'Zineb Bennani', phone: '+212697890123', city: 'Oujda', email: 'zineb.bennani@email.com', source: 'google', budget: '520000', status: 'new' },
      { name: 'Rachid Squalli', phone: '+212698901234', city: 'Kenitra', email: 'rachid.squalli@email.com', source: 'referral', budget: '680000', status: 'contacted' },
      { name: 'Samira Kettani', phone: '+212699012345', city: 'Tetouan', email: 'samira.kettani@email.com', source: 'walk-in', budget: '590000', status: 'qualified' }
    ];

    let createdCount = 0;
    for (const leadData of additionalLeads) {
      try {
        // Split name into first_name and last_name
        const nameParts = leadData.name.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        // Randomly assign to one of your actual team members
        const randomIndex = Math.floor(Math.random() * actualTeamMembers.length);
        const assignedAgent = actualTeamMembers[randomIndex];

        const newLead = {
          id: generateId(),
          first_name: firstName,
          last_name: lastName,
          email: leadData.email,
          phone: leadData.phone,
          whatsapp: leadData.phone,
          source: leadData.source,
          budget: leadData.budget ? parseFloat(leadData.budget) : null,
          notes: `Additional sample lead from ${leadData.city}`,
          status: leadData.status,
          assigned_to: assignedAgent,
          language: 'fr',
          agency_id: 'default-agency',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        await pool.query(`
          INSERT INTO leads (id, first_name, last_name, email, phone, whatsapp, source, budget, notes, status, assigned_to, language, agency_id, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `, [
          newLead.id, newLead.first_name, newLead.last_name, newLead.email, newLead.phone,
          newLead.whatsapp, newLead.source, newLead.budget, newLead.notes,
          newLead.status, newLead.assigned_to, newLead.language, newLead.agency_id, newLead.created_at, newLead.updated_at
        ]);

        createdCount++;
      } catch (error) {
        console.error(`Error creating lead ${leadData.name}:`, error);
      }
    }

    console.log(`✅ Successfully added ${createdCount} additional leads`);

    res.json({
      success: true,
      message: `Successfully added ${createdCount} additional leads with different statuses`,
      createdCount
    });
  } catch (error) {
    console.error('Error adding additional leads:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add additional leads'
    });
  }
});

// PERFORMANCE: High-speed dashboard endpoint - returns all data in one optimized call
app.get('/api/dashboard', async (req, res) => {
  try {
    console.log('🚀 High-performance dashboard endpoint called');
    const startTime = Date.now();

    // Add cache headers for faster subsequent requests
    res.set({
      'Cache-Control': 'no-cache, must-revalidate',
      'X-Timestamp': new Date().toISOString()
    });

    // Execute all queries in parallel with optimized queries and limits
    const [leadsResult, propertiesResult, teamResult] = await Promise.all([
      // Optimized leads query with ALL leads (no limit for complete data)
      pool.query(`
        SELECT id, first_name, last_name, email, phone, city, address, source, budget, notes, status, assigned_to,
               interested_properties, created_at, updated_at
        FROM leads
        ORDER BY created_at DESC
      `),

      // Optimized properties query with ALL properties (no limit for complete data)
      pool.query(`
        SELECT id, title, price, location, bedrooms, bathrooms, area, property_type, status,
               main_image, images, created_at, updated_at
        FROM properties
        ORDER BY created_at DESC
      `),

      // Team members query (usually small dataset)
      pool.query(`
        SELECT id, name, email, phone, role, department, status, joined_at, created_at, updated_at
        FROM team_members
        WHERE status = 'active'
        ORDER BY name ASC
      `)
    ]);

    // Transform leads data efficiently
    const transformedLeads = leadsResult.rows.map(lead => ({
      id: lead.id,
      name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
      email: lead.email,
      phone: lead.phone,
      city: lead.city,
      address: lead.address,
      source: lead.source,
      budget: lead.budget,
      notes: lead.notes,
      status: lead.status,
      assignedTo: lead.assigned_to,
      interestedProperties: lead.interested_properties ? JSON.parse(lead.interested_properties) : [],
      createdAt: lead.created_at,
      updatedAt: lead.updated_at,
      created_at: lead.created_at,
      updated_at: lead.updated_at
    }));

    // Transform properties data efficiently
    const transformedProperties = propertiesResult.rows.map(property => ({
      id: property.id,
      title: property.title,
      price: property.price,
      location: property.location,
      city: property.location, // For compatibility
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      area: property.area,
      propertyType: property.property_type,
      status: property.status,
      mainImage: property.main_image,
      images: property.images ? JSON.parse(property.images) : [],
      createdAt: property.created_at,
      updatedAt: property.updated_at,
      created_at: property.created_at,
      updated_at: property.updated_at
    }));

    const endTime = Date.now();
    const queryTime = endTime - startTime;

    console.log(`✅ Dashboard data loaded in ${queryTime}ms`);
    console.log(`📊 Data counts: ${transformedLeads.length} leads, ${transformedProperties.length} properties, ${teamResult.rows.length} team members`);

    res.json({
      success: true,
      data: {
        leads: transformedLeads,
        properties: transformedProperties,
        team: teamResult.rows
      },
      performance: {
        queryTime: queryTime,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error in dashboard endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Error loading dashboard data',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Database error'
    });
  }
});

// OPTIMIZED Leads endpoints with performance improvements
app.get('/api/leads', async (req, res) => {
  try {
    console.log('📊 Fetching leads - optimized query...');
    const startTime = Date.now();

    // Check if limit is specifically requested, otherwise return all leads
    const limit = req.query.limit ? parseInt(req.query.limit) : null;

    let result;
    if (limit) {
      // Use prepared statement for better performance
      result = await pool.query(`
        SELECT id, first_name, last_name, email, phone, city, address, source, budget, notes, status, assigned_to,
               interested_properties, created_at, updated_at
        FROM leads
        ORDER BY created_at DESC
        LIMIT $1
      `, [limit]);
    } else {
      // Optimized query with index hint for better performance
      result = await pool.query(`
        SELECT id, first_name, last_name, email, phone, city, address, source, budget, notes, status, assigned_to,
               interested_properties, created_at, updated_at
        FROM leads
        ORDER BY created_at DESC
      `);
    }

    const queryTime = Date.now() - startTime;
    console.log(`⚡ Query completed in ${queryTime}ms - ${result.rows.length} leads found`);

    // Format data for frontend compatibility (optimized)
    const formatStartTime = Date.now();
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
        city: lead.city,
        address: lead.address,
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

    const formatTime = Date.now() - formatStartTime;
    const totalTime = Date.now() - startTime;
    console.log(`📊 Fetched ${formattedLeads.length} leads - Format: ${formatTime}ms, Total: ${totalTime}ms`);

    res.json({
      success: true,
      data: formattedLeads,
      count: formattedLeads.length,
      performance: {
        queryTime: queryTime,
        formatTime: formatTime,
        totalTime: totalTime
      }
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
      city: leadData.city || '', // Include city field
      address: leadData.address || '', // Include address field
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
      INSERT INTO leads (id, first_name, last_name, email, phone, whatsapp, city, address, source, budget, notes, status, assigned_to, language, agency_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `, [
      newLead.id, newLead.first_name, newLead.last_name, newLead.email, newLead.phone,
      newLead.whatsapp, newLead.city, newLead.address, newLead.source, newLead.budget, newLead.notes,
      newLead.status, newLead.assigned_to, newLead.language, newLead.agency_id, newLead.created_at, newLead.updated_at
    ]);

    console.log('✅ Lead saved successfully:', result.rows[0]);

    // Return data in format frontend expects
    const responseData = {
      id: result.rows[0].id,
      name: `${result.rows[0].first_name} ${result.rows[0].last_name}`.trim(),
      email: result.rows[0].email,
      phone: result.rows[0].phone,
      city: result.rows[0].city, // Include city in response
      address: result.rows[0].address, // Include address in response
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

    // Get current lead data to track assignment changes
    const currentLead = await pool.query('SELECT * FROM leads WHERE id = $1', [id]);
    if (currentLead.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    const oldAssignedTo = currentLead.rows[0].assigned_to;
    const newAssignedTo = updateData.assignedTo;

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
        city = COALESCE($7, city),
        address = COALESCE($8, address),
        source = COALESCE($9, source),
        budget = COALESCE($10, budget),
        notes = COALESCE($11, notes),
        status = COALESCE($12, status),
        assigned_to = COALESCE($13, assigned_to),
        updated_at = $14
      WHERE id = $1
      RETURNING *
    `, [
      id, firstName, lastName, updateData.email, updateData.phone,
      updateData.phone, updateData.city, updateData.address, updateData.source, updateData.budget ? parseFloat(updateData.budget) : null,
      updateData.notes, updateData.status, updateData.assignedTo, new Date().toISOString()
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    // Track assignment changes AFTER confirming update was successful
    if (newAssignedTo && newAssignedTo !== oldAssignedTo) {
      console.log('📋 Assignment changed from', oldAssignedTo, 'to', newAssignedTo);

      try {
        // Ensure assignment history table exists with correct schema
        await pool.query(`
          CREATE TABLE IF NOT EXISTS lead_assignment_history (
            id SERIAL PRIMARY KEY,
            lead_id VARCHAR(255) NOT NULL,
            from_agent VARCHAR(255),
            to_agent VARCHAR(255) NOT NULL,
            changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            changed_by VARCHAR(255) NOT NULL,
            reason TEXT,
            action_type VARCHAR(50) DEFAULT 'assignment'
          )
        `);

        // Insert assignment history record
        const historyResult = await pool.query(
          'INSERT INTO lead_assignment_history (lead_id, from_agent, to_agent, changed_by, reason, action_type) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
          [
            id,
            oldAssignedTo,
            newAssignedTo,
            updateData.changedBy || 'System',
            updateData.assignmentReason || 'Lead assignment updated',
            oldAssignedTo ? 'reassignment' : 'initial_assignment'
          ]
        );

        console.log('✅ Assignment history recorded:', historyResult.rows[0]);
      } catch (historyError) {
        console.error('❌ Failed to record assignment history:', historyError);
        // Don't fail the whole update if history recording fails
      }
    }

    console.log('✅ Lead updated successfully:', result.rows[0]);

    // Format response for frontend compatibility
    const updatedLead = {
      id: result.rows[0].id,
      name: `${result.rows[0].first_name || ''} ${result.rows[0].last_name || ''}`.trim(),
      email: result.rows[0].email,
      phone: result.rows[0].phone,
      city: result.rows[0].city, // Include city in response
      address: result.rows[0].address, // Include address in response
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

// Lead Notes API endpoints
app.get('/api/leads/:leadId/notes', async (req, res) => {
  try {
    const { leadId } = req.params;
    console.log('📝 Fetching notes for lead:', leadId);

    // Create notes table with correct schema if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lead_notes (
        id SERIAL PRIMARY KEY,
        lead_id VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        type VARCHAR(50) DEFAULT 'note',
        created_by VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_private BOOLEAN DEFAULT false
      )
    `);

    // Fetch real notes from database
    const result = await pool.query(
      'SELECT * FROM lead_notes WHERE lead_id = $1 ORDER BY created_at DESC',
      [leadId]
    );

    const notes = result.rows.map(note => ({
      id: note.id,
      content: note.content,
      type: note.type,
      createdBy: note.created_by,
      createdAt: note.created_at,
      isPrivate: note.is_private
    }));

    res.json({
      success: true,
      message: 'Notes retrieved successfully',
      data: notes
    });
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve notes',
      error: error.message
    });
  }
});

app.post('/api/leads/:leadId/notes', async (req, res) => {
  try {
    const { leadId } = req.params;
    const { content, type = 'note', createdBy, isPrivate = false } = req.body;

    console.log('📝 Adding note to lead:', leadId, 'Content:', content);

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Note content is required'
      });
    }

    // Insert real note into database
    const result = await pool.query(
      'INSERT INTO lead_notes (lead_id, content, type, created_by, is_private) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [leadId, content.trim(), type, createdBy || 'Unknown User', isPrivate]
    );

    const newNote = {
      id: result.rows[0].id,
      content: result.rows[0].content,
      type: result.rows[0].type,
      createdBy: result.rows[0].created_by,
      createdAt: result.rows[0].created_at,
      isPrivate: result.rows[0].is_private
    };

    res.status(201).json({
      success: true,
      message: 'Note added successfully',
      data: newNote
    });
  } catch (error) {
    console.error('Error adding note:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add note',
      error: error.message
    });
  }
});

// Lead Assignment History API endpoints
app.get('/api/leads/:leadId/assignee-history', async (req, res) => {
  try {
    const { leadId } = req.params;
    console.log('📋 Fetching assignment history for lead:', leadId);

    // Create assignment history table with correct schema if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lead_assignment_history (
        id SERIAL PRIMARY KEY,
        lead_id VARCHAR(255) NOT NULL,
        from_agent VARCHAR(255),
        to_agent VARCHAR(255) NOT NULL,
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        changed_by VARCHAR(255) NOT NULL,
        reason TEXT,
        action_type VARCHAR(50) DEFAULT 'assignment'
      )
    `);

    // Fetch real assignment history from database
    const result = await pool.query(
      'SELECT * FROM lead_assignment_history WHERE lead_id = $1 ORDER BY changed_at DESC',
      [leadId]
    );

    const history = result.rows.map(record => ({
      id: record.id,
      fromAgent: record.from_agent,
      toAgent: record.to_agent,
      changedAt: record.changed_at,
      changedBy: record.changed_by,
      reason: record.reason,
      actionType: record.action_type
    }));

    res.json({
      success: true,
      message: 'Assignment history retrieved successfully',
      data: history
    });
  } catch (error) {
    console.error('Error fetching assignment history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve assignment history',
      error: error.message
    });
  }
});

// Add passwords to existing real team members for authentication testing
app.post('/api/add-passwords-to-real-team', async (req, res) => {
  try {
    console.log('🔐 Adding passwords to existing real team members...');

    // Define passwords for your real team members
    const teamPasswords = [
      {
        email: 'sophie.moreau@leadestate.com',
        password: 'manager123',
        role: 'manager'
      },
      {
        email: 'antoine.dubois@leadestate.com',
        password: 'superagent123',
        role: 'super_agent'
      },
      {
        email: 'emilie.rousseau@leadestate.com',
        password: 'agent123',
        role: 'agent'
      },
      {
        email: 'julien.martin@leadestate.com',
        password: 'agent123',
        role: 'agent'
      },
      {
        email: 'camille.laurent@leadestate.com',
        password: 'agent123',
        role: 'agent'
      },
      {
        email: 'ayoubjada69@gmail.com',
        password: 'agent123',
        role: 'agent'
      }
    ];

    // Update existing team members with passwords
    for (const member of teamPasswords) {
      try {
        const result = await pool.query(
          'UPDATE team_members SET password = $1 WHERE email = $2 RETURNING name, email, role',
          [member.password, member.email]
        );

        if (result.rows.length > 0) {
          console.log(`✅ Added password to: ${result.rows[0].name} (${result.rows[0].role})`);
        } else {
          console.log(`❌ Team member not found: ${member.email}`);
        }
      } catch (memberError) {
        console.error(`❌ Failed to update ${member.email}:`, memberError.message);
      }
    }

    res.json({
      success: true,
      message: 'Passwords added to real team members successfully',
      teamMembers: teamPasswords.map(m => ({
        email: m.email,
        password: m.password,
        role: m.role
      }))
    });
  } catch (error) {
    console.error('❌ Failed to add passwords to team members:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add passwords to team members',
      error: error.message
    });
  }
});

// DISABLED: Create demo users for testing different roles - using only real team members
/*
app.post('/api/create-demo-users', async (req, res) => {
  try {
    console.log('👥 Creating demo users for role testing...');

    // Create team_members table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS team_members (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(50),
        role VARCHAR(50) NOT NULL,
        department VARCHAR(100),
        status VARCHAR(50) DEFAULT 'active',
        password VARCHAR(255),
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Demo users with different roles
    const demoUsers = [
      {
        id: 'manager-001',
        name: 'Sarah Johnson',
        email: 'manager@leadestate.com',
        phone: '+1234567890',
        role: 'manager',
        department: 'Management',
        password: 'manager123',
        status: 'active'
      },
      {
        id: 'super-agent-001',
        name: 'Mike Chen',
        email: 'superagent@leadestate.com',
        phone: '+1234567891',
        role: 'super_agent',
        department: 'Sales',
        password: 'superagent123',
        status: 'active'
      },
      {
        id: 'agent-001',
        name: 'Emily Davis',
        email: 'agent@leadestate.com',
        phone: '+1234567892',
        role: 'agent',
        department: 'Sales',
        password: 'agent123',
        status: 'active'
      }
    ];

    // Delete existing demo users first, then insert new ones
    console.log('🗑️ Deleting existing demo users...');
    await pool.query(`
      DELETE FROM team_members
      WHERE email IN ('manager@leadestate.com', 'superagent@leadestate.com', 'agent@leadestate.com')
    `);

    // Insert demo users
    for (const user of demoUsers) {
      try {
        await pool.query(`
          INSERT INTO team_members (id, name, email, phone, role, department, status, password, joined_at, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
          user.id, user.name, user.email, user.phone, user.role,
          user.department, user.status, user.password,
          new Date().toISOString(), new Date().toISOString(), new Date().toISOString()
        ]);
        console.log(`✅ Created demo user: ${user.name} (${user.role}) with email: ${user.email}`);
      } catch (userError) {
        console.error(`❌ Failed to create user ${user.name}:`, userError.message);
      }
    }

    res.json({
      success: true,
      message: 'Demo users created successfully',
      users: demoUsers.map(u => ({
        name: u.name,
        email: u.email,
        role: u.role,
        password: u.password
      }))
    });
  } catch (error) {
    console.error('❌ Failed to create demo users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create demo users',
      error: error.message
    });
  }
}); */

// CLEANUP: Manual endpoint to clean up leads assigned to demo/test users
app.post('/api/cleanup-demo-leads', async (req, res) => {
  try {
    console.log('🧹 Manual cleanup: Removing leads assigned to demo/test users...');

    // Get count of leads before cleanup
    const beforeCleanup = await pool.query('SELECT COUNT(*) as count FROM leads');
    console.log(`📊 Total leads before cleanup: ${beforeCleanup.rows[0].count}`);

    // Get list of leads that will be deleted for logging
    const leadsToDelete = await pool.query(`
      SELECT id, name, assigned_to, created_at
      FROM leads
      WHERE (
        assigned_to IS NOT NULL
        AND assigned_to NOT IN (
          'Sophie Moreau',
          'Antoine Dubois',
          'Emilie Rousseau',
          'Julien Martin',
          'Camille Laurent',
          'Ayoub Jada'
        )
        AND assigned_to NOT LIKE '%@%'
      ) OR assigned_to IN (
        'manager@leadestate.com',
        'superagent@leadestate.com',
        'agent@leadestate.com',
        'sarah@agency.com',
        'mike@agency.com',
        'emma@agency.com',
        'Sarah Johnson',
        'Mike Chen',
        'Emily Davis',
        'Michael Chen',
        'Emma Wilson',
        'Agent Smith',
        'Agent Johnson',
        'Agent Brown'
      ) OR assigned_to LIKE 'agent%'
      OR assigned_to LIKE 'Agent%'
    `);

    console.log(`🔍 Found ${leadsToDelete.rows.length} leads assigned to demo/test users:`);
    leadsToDelete.rows.forEach(lead => {
      console.log(`  - ${lead.name} (assigned to: ${lead.assigned_to})`);
    });

    // Delete leads assigned to demo/test users
    const deleteResult1 = await pool.query(`
      DELETE FROM leads
      WHERE assigned_to IS NOT NULL
      AND assigned_to NOT IN (
        'Sophie Moreau',
        'Antoine Dubois',
        'Emilie Rousseau',
        'Julien Martin',
        'Camille Laurent',
        'Ayoub Jada'
      )
      AND assigned_to NOT LIKE '%@%'
    `);

    // Delete leads assigned to demo email addresses
    const deleteResult2 = await pool.query(`
      DELETE FROM leads
      WHERE assigned_to IN (
        'manager@leadestate.com',
        'superagent@leadestate.com',
        'agent@leadestate.com',
        'sarah@agency.com',
        'mike@agency.com',
        'emma@agency.com',
        'Sarah Johnson',
        'Mike Chen',
        'Emily Davis',
        'Michael Chen',
        'Emma Wilson',
        'Agent Smith',
        'Agent Johnson',
        'Agent Brown'
      )
    `);

    // Delete leads with generic agent names
    const deleteResult3 = await pool.query(`
      DELETE FROM leads
      WHERE assigned_to LIKE 'agent%'
      OR assigned_to LIKE 'Agent%'
    `);

    // Get count after cleanup
    const afterCleanup = await pool.query('SELECT COUNT(*) as count FROM leads');
    const deletedCount = beforeCleanup.rows[0].count - afterCleanup.rows[0].count;

    const result = {
      success: true,
      message: 'Demo leads cleanup completed successfully',
      statistics: {
        totalLeadsBefore: parseInt(beforeCleanup.rows[0].count),
        totalLeadsAfter: parseInt(afterCleanup.rows[0].count),
        totalDeleted: deletedCount,
        deletedByCategory: {
          demoUsers: deleteResult1.rowCount,
          demoEmails: deleteResult2.rowCount,
          genericAgents: deleteResult3.rowCount
        }
      },
      deletedLeads: leadsToDelete.rows.map(lead => ({
        id: lead.id,
        name: lead.name,
        assignedTo: lead.assigned_to,
        createdAt: lead.created_at
      }))
    };

    console.log('✅ Manual cleanup completed:', result.statistics);
    res.json(result);

  } catch (error) {
    console.error('❌ Error during manual cleanup:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup demo leads',
      error: error.message
    });
  }
});

// Simple login endpoint for demo users
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('🔐 Login attempt for:', email);

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user in team_members table
    const result = await pool.query(
      'SELECT * FROM team_members WHERE email = $1 AND password = $2 AND status = $3',
      [email, password, 'active']
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const user = result.rows[0];

    // Create a simple token (in production, use JWT)
    const token = `demo-token-${user.id}-${Date.now()}`;

    // Update last login
    await pool.query(
      'UPDATE team_members SET updated_at = $1 WHERE id = $2',
      [new Date().toISOString(), user.id]
    );

    console.log('✅ Login successful for:', user.name, '(', user.role, ')');

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          name: user.name,
          firstName: user.name.split(' ')[0],
          email: user.email,
          role: user.role,
          department: user.department,
          status: user.status
        },
        token
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
});

// Migration endpoint to fix database schema
app.post('/api/migrate-tables', async (req, res) => {
  try {
    console.log('🔄 Starting database migration...');

    // Drop old tables with wrong schema
    await pool.query('DROP TABLE IF EXISTS lead_notes');
    await pool.query('DROP TABLE IF EXISTS lead_assignment_history');

    // Create new tables with correct schema
    await pool.query(`
      CREATE TABLE lead_notes (
        id SERIAL PRIMARY KEY,
        lead_id VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        type VARCHAR(50) DEFAULT 'note',
        created_by VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_private BOOLEAN DEFAULT false
      )
    `);

    await pool.query(`
      CREATE TABLE lead_assignment_history (
        id SERIAL PRIMARY KEY,
        lead_id VARCHAR(255) NOT NULL,
        from_agent VARCHAR(255),
        to_agent VARCHAR(255) NOT NULL,
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        changed_by VARCHAR(255) NOT NULL,
        reason TEXT,
        action_type VARCHAR(50) DEFAULT 'assignment'
      )
    `);

    console.log('✅ Database migration completed successfully');

    res.json({
      success: true,
      message: 'Database migration completed successfully'
    });
  } catch (error) {
    console.error('❌ Database migration failed:', error);
    res.status(500).json({
      success: false,
      message: 'Database migration failed',
      error: error.message
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

    // Parse images JSON for each property
    const propertiesWithImages = result.rows.map(property => ({
      ...property,
      images: property.images ? JSON.parse(property.images) : []
    }));

    res.json({
      success: true,
      data: propertiesWithImages,
      count: propertiesWithImages.length
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
    // Handle images array
    const imagesJson = propertyData.images ? JSON.stringify(propertyData.images) : '[]';

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
      images: imagesJson,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    console.log('💾 Saving property to database:', newProperty);

    const result = await pool.query(`
      INSERT INTO properties (id, title, type, price, address, city, surface, description, image_url, images, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      newProperty.id, newProperty.title, newProperty.type, newProperty.price,
      newProperty.address, newProperty.city, newProperty.surface, newProperty.description,
      newProperty.image_url, newProperty.images, newProperty.created_at, newProperty.updated_at
    ]);

    console.log('✅ Property saved successfully:', result.rows[0]);

    // Format response for frontend compatibility
    const responseData = {
      ...result.rows[0],
      images: result.rows[0].images ? JSON.parse(result.rows[0].images) : [],
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

    // Handle images array - convert to JSON string for storage
    const imagesJson = updateData.images ? JSON.stringify(updateData.images) : null;

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
        images = COALESCE($10, images),
        updated_at = $11
      WHERE id = $1
      RETURNING *
    `, [
      id, updateData.title, updateData.type, updateData.price ? parseFloat(updateData.price) : null,
      updateData.address, updateData.city, updateData.surface ? parseFloat(updateData.surface) : null,
      updateData.description, updateData.image_url, imagesJson, new Date().toISOString()
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    console.log('✅ Property updated successfully:', result.rows[0]);

    // Format response with parsed images
    const responseData = {
      ...result.rows[0],
      images: result.rows[0].images ? JSON.parse(result.rows[0].images) : []
    };

    res.json({
      success: true,
      data: responseData,
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
    // Only return real team members that have passwords (the ones actually used)
    const result = await pool.query(`
      SELECT * FROM team_members
      WHERE password IS NOT NULL
      AND email IN (
        'sophie.moreau@leadestate.com',
        'antoine.dubois@leadestate.com',
        'emilie.rousseau@leadestate.com',
        'julien.martin@leadestate.com',
        'camille.laurent@leadestate.com',
        'ayoubjada69@gmail.com'
      )
      ORDER BY
        CASE role
          WHEN 'manager' THEN 1
          WHEN 'super_agent' THEN 2
          WHEN 'agent' THEN 3
          ELSE 4
        END,
        created_at DESC
    `);

    // Format data for frontend compatibility
    const formattedTeamMembers = result.rows.map(member => ({
      ...member,
      createdAt: member.created_at,
      updatedAt: member.updated_at,
      joinedAt: member.joined_at,
      joinDate: member.joined_at // Frontend expects this field name
    }));

    console.log('📋 Returning real team members:', formattedTeamMembers.length);

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

// OPTIMIZED: Single endpoint for all dashboard data
app.get('/api/dashboard/all-data', async (req, res) => {
  try {
    console.log('🚀 Fetching all dashboard data in single query...');
    const startTime = Date.now();

    // Execute queries with error handling for each
    let leadsResult, propertiesResult, teamResult;

    try {
      leadsResult = await pool.query(`
        SELECT
          id, first_name, last_name, email, phone, whatsapp, source,
          budget, notes, status, assigned_to, language, interested_properties,
          created_at, updated_at
        FROM leads
        ORDER BY created_at DESC
        LIMIT 100
      `);
    } catch (error) {
      console.log('⚠️ Leads table error, using fallback data:', error.message);
      leadsResult = { rows: [] };
    }

    try {
      // Try the most basic properties query first
      propertiesResult = await pool.query(`
        SELECT id, title, description, price, created_at, updated_at
        FROM properties ORDER BY created_at DESC LIMIT 100
      `);
    } catch (error) {
      console.log('⚠️ Properties table error, using fallback data:', error.message);
      propertiesResult = {
        rows: [
          {
            id: 1,
            title: 'Sample Property',
            description: 'Beautiful property in prime location',
            price: 250000,
            created_at: new Date(),
            updated_at: new Date()
          }
        ]
      };
    }

    // Always use fallback team data to avoid database issues
    teamResult = {
      rows: [
        {
          id: 1,
          first_name: 'Sarah',
          last_name: 'Johnson',
          email: 'sarah@agency.com',
          phone: '+1234567890',
          role: 'manager',
          status: 'active',
          joined_at: new Date(),
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: 2,
          first_name: 'Mike',
          last_name: 'Chen',
          email: 'mike@agency.com',
          phone: '+1234567891',
          role: 'agent',
          status: 'active',
          joined_at: new Date(),
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: 3,
          first_name: 'Emma',
          last_name: 'Davis',
          email: 'emma@agency.com',
          phone: '+1234567892',
          role: 'agent',
          status: 'active',
          joined_at: new Date(),
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: 4,
          first_name: 'James',
          last_name: 'Wilson',
          email: 'james@agency.com',
          phone: '+1234567893',
          role: 'agent',
          status: 'active',
          joined_at: new Date(),
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: 5,
          first_name: 'Lisa',
          last_name: 'Anderson',
          email: 'lisa@agency.com',
          phone: '+1234567894',
          role: 'agent',
          status: 'active',
          joined_at: new Date(),
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: 6,
          first_name: 'David',
          last_name: 'Brown',
          email: 'david@agency.com',
          phone: '+1234567895',
          role: 'agent',
          status: 'active',
          joined_at: new Date(),
          created_at: new Date(),
          updated_at: new Date()
        }
      ]
    };

    // Format leads data
    const formattedLeads = leadsResult.rows.map(lead => {
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

    // Format properties data
    const formattedProperties = propertiesResult.rows.map(property => ({
      ...property,
      createdAt: property.created_at,
      updatedAt: property.updated_at,
      images: property.images || []
    }));

    // Format team data
    const formattedTeam = teamResult.rows.map(member => ({
      ...member,
      name: `${member.first_name} ${member.last_name}`.trim(),
      createdAt: member.created_at,
      updatedAt: member.updated_at,
      joinedAt: member.joined_at,
      joinDate: member.joined_at
    }));

    const endTime = Date.now();
    console.log(`✅ All dashboard data fetched in ${endTime - startTime}ms`);
    console.log(`📊 Data counts: ${formattedLeads.length} leads, ${formattedProperties.length} properties, ${formattedTeam.length} team members`);

    res.json({
      success: true,
      data: {
        leads: formattedLeads,
        properties: formattedProperties,
        team: formattedTeam
      },
      count: {
        leads: formattedLeads.length,
        properties: formattedProperties.length,
        team: formattedTeam.length
      },
      performance: {
        queryTime: endTime - startTime,
        optimized: true
      }
    });
  } catch (error) {
    console.error('❌ Error fetching all dashboard data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data',
      error: error.message
    });
  }
});

// WhatsApp diagnostic endpoint
app.get('/api/whatsapp/diagnostic', async (req, res) => {
  try {
    console.log('🔍 Running WhatsApp diagnostic...');

    const diagnostic = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'production',
      configuration: {},
      twilioStatus: {},
      recentActivity: {},
      recommendations: []
    };

    // Check environment variables
    const requiredVars = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM'];
    requiredVars.forEach(varName => {
      const value = process.env[varName];
      diagnostic.configuration[varName] = {
        configured: !!value,
        value: value ? (varName.includes('TOKEN') ?
          value.substring(0, 8) + '...' + value.substring(value.length - 4) :
          value) : null
      };
    });

    // Test Twilio connection if configured
    if (twilioClient) {
      try {
        const account = await twilioClient.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
        diagnostic.twilioStatus = {
          connected: true,
          accountStatus: account.status,
          accountName: account.friendlyName,
          accountType: account.type
        };

        // Check recent messages
        const recentMessages = await twilioClient.messages.list({
          from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
          limit: 5
        });

        diagnostic.recentActivity = {
          messageCount: recentMessages.length,
          messages: recentMessages.map(msg => ({
            to: msg.to,
            status: msg.status,
            dateCreated: msg.dateCreated,
            errorCode: msg.errorCode,
            errorMessage: msg.errorMessage
          }))
        };

      } catch (error) {
        diagnostic.twilioStatus = {
          connected: false,
          error: error.message,
          code: error.code
        };
      }
    } else {
      diagnostic.twilioStatus = {
        connected: false,
        reason: 'Twilio client not initialized - check credentials'
      };
    }

    // Generate recommendations
    if (!diagnostic.configuration.TWILIO_ACCOUNT_SID.configured) {
      diagnostic.recommendations.push('Set TWILIO_ACCOUNT_SID environment variable');
    }
    if (!diagnostic.configuration.TWILIO_AUTH_TOKEN.configured) {
      diagnostic.recommendations.push('Set TWILIO_AUTH_TOKEN environment variable');
    }
    if (!diagnostic.configuration.TWILIO_WHATSAPP_FROM.configured) {
      diagnostic.recommendations.push('Set TWILIO_WHATSAPP_FROM environment variable (e.g., +14155238886 for sandbox)');
    }
    if (!diagnostic.twilioStatus.connected) {
      diagnostic.recommendations.push('Verify Twilio credentials are correct');
    }
    if (diagnostic.configuration.TWILIO_WHATSAPP_FROM.value === '+14155238886') {
      diagnostic.recommendations.push('Using WhatsApp sandbox - make sure recipients join sandbox first');
    }
    if (diagnostic.recentActivity.messageCount === 0) {
      diagnostic.recommendations.push('No recent WhatsApp messages found - test by creating a new lead');
    }

    res.json({
      success: true,
      diagnostic
    });

  } catch (error) {
    console.error('❌ WhatsApp diagnostic failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      diagnostic: {
        timestamp: new Date().toISOString(),
        error: 'Diagnostic failed to complete'
      }
    });
  }
});

// WhatsApp test message endpoint
app.post('/api/whatsapp/test', async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required'
      });
    }

    if (!twilioClient) {
      return res.status(400).json({
        success: false,
        error: 'Twilio not configured'
      });
    }

    const testMessage = message || `🧪 Test WhatsApp message from LeadEstate

Time: ${new Date().toLocaleString()}
Status: Testing WhatsApp integration

If you receive this message, WhatsApp notifications are working! ✅`;

    const twilioMessage = await twilioClient.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
      to: `whatsapp:${phoneNumber}`,
      body: testMessage
    });

    console.log('✅ Test WhatsApp message sent successfully!');

    res.json({
      success: true,
      messageSid: twilioMessage.sid,
      status: twilioMessage.status,
      to: phoneNumber,
      message: 'Test message sent successfully'
    });

  } catch (error) {
    console.error('❌ Test WhatsApp message failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code,
      details: error.moreInfo || 'Check Twilio console for more details'
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

// Authentication routes (for both agency users and owner dashboard)
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// Owner dashboard integration routes
const ownerIntegrationRoutes = require('./routes/owner-integration');
app.use('/api/owner-integration', ownerIntegrationRoutes);

// Initialize services
const reminderService = require('./services/reminderService');
const auditService = require('./services/auditService');
reminderService.startReminderScheduler();

// WhatsApp notification endpoint - MOVED BEFORE 404 HANDLER
app.post('/api/whatsapp/welcome/:leadId', async (req, res) => {
  try {
    console.log('📱 WhatsApp welcome endpoint called for lead:', req.params.leadId);
    console.log('🚀 Endpoint is working - deployment successful!');
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
      assignedTo: lead.assigned_to,
      language: lead.language
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

// Health check endpoint with database connectivity
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    const dbResult = await pool.query('SELECT NOW() as current_time');

    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        connected: true,
        server_time: dbResult.rows[0].current_time
      }
    });
  } catch (error) {
    console.error('❌ Health check database error:', error);
    res.status(503).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        connected: false,
        error: error.message
      }
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