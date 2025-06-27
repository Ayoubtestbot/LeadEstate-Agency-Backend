const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();

// Basic middleware
app.use(helmet());
app.use(cors({
  origin: [
    'http://localhost:5001',
    'http://localhost:3000',
    'https://lead-estate-agency-frontend.vercel.app',
    'https://leadestate-agency-frontend.vercel.app',
    'https://leadestate-backend-9fih.onrender.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database tables
const initDatabase = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(255),
        city VARCHAR(255),
        source VARCHAR(255),
        property_type VARCHAR(255),
        budget VARCHAR(255),
        notes TEXT,
        status VARCHAR(255) DEFAULT 'new',
        assigned_to VARCHAR(255),
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

    // Drop and recreate properties table with correct schema
    console.log('🔧 Recreating properties table with simplified schema...');
    await pool.query(`DROP TABLE IF EXISTS properties`);
    await pool.query(`
      CREATE TABLE properties (
        id VARCHAR(255) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        type VARCHAR(255),
        price DECIMAL,
        address VARCHAR(255),
        city VARCHAR(255),
        surface DECIMAL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

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
    const formattedLeads = result.rows.map(lead => ({
      id: lead.id,
      name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
      email: lead.email,
      phone: lead.phone,
      source: lead.source,
      budget: lead.budget,
      notes: lead.notes,
      status: lead.status,
      assignedTo: lead.assigned_to,
      createdAt: lead.created_at,
      updatedAt: lead.updated_at,
      created_at: lead.created_at, // Keep both for compatibility
      updated_at: lead.updated_at
    }));

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
      agency_id: 'default-agency', // Default agency ID
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    console.log('💾 Saving lead to database:', newLead);

    const result = await pool.query(`
      INSERT INTO leads (id, first_name, last_name, email, phone, whatsapp, source, budget, notes, status, agency_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      newLead.id, newLead.first_name, newLead.last_name, newLead.email, newLead.phone,
      newLead.whatsapp, newLead.source, newLead.budget, newLead.notes,
      newLead.status, newLead.agency_id, newLead.created_at, newLead.updated_at
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
      createdAt: result.rows[0].created_at,
      updatedAt: result.rows[0].updated_at,
      created_at: result.rows[0].created_at, // Keep both for compatibility
      updated_at: result.rows[0].updated_at
    };

    res.status(201).json({
      success: true,
      data: responseData,
      message: 'Lead created successfully'
    });
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    console.log('💾 Saving property to database:', newProperty);

    const result = await pool.query(`
      INSERT INTO properties (id, title, type, price, address, city, surface, description, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      newProperty.id, newProperty.title, newProperty.type, newProperty.price,
      newProperty.address, newProperty.city, newProperty.surface, newProperty.description,
      newProperty.created_at, newProperty.updated_at
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
    res.status(500).json({
      success: false,
      message: 'Failed to create property',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Database error'
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
        updated_at = $9
      WHERE id = $1
      RETURNING *
    `, [
      id, updateData.title, updateData.type, updateData.price ? parseFloat(updateData.price) : null,
      updateData.address, updateData.city, updateData.surface ? parseFloat(updateData.surface) : null,
      updateData.description, new Date().toISOString()
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

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🚀 LeadEstate API Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'production'}`);
  console.log(`💾 Storage: PostgreSQL Database`);
  console.log(`🌐 CORS enabled for production domains`);
  console.log(`📡 API Status: http://localhost:${PORT}/api/status`);
});
