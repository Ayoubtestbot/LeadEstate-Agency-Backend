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
    'https://leadestate-agency-frontend.vercel.app'
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

    console.log('✅ Database tables initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
};

// Initialize database on startup
initDatabase();

// Helper function to generate IDs
const generateId = () => Date.now().toString() + Math.random().toString(36).substr(2, 9);

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
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
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
    const leadData = req.body;
    const newLead = {
      id: generateId(),
      ...leadData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    await pool.query(`
      INSERT INTO leads (id, name, email, phone, city, source, property_type, budget, notes, status, assigned_to, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      newLead.id, newLead.name, newLead.email, newLead.phone, newLead.city,
      newLead.source, newLead.propertyType, newLead.budget, newLead.notes,
      newLead.status, newLead.assignedTo, newLead.created_at, newLead.updated_at
    ]);
    
    res.status(201).json({
      success: true,
      data: newLead,
      message: 'Lead created successfully'
    });
  } catch (error) {
    console.error('Error creating lead:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create lead'
    });
  }
});

app.put('/api/leads/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    await pool.query(`
      UPDATE leads SET 
        name = COALESCE($2, name),
        email = COALESCE($3, email),
        phone = COALESCE($4, phone),
        city = COALESCE($5, city),
        source = COALESCE($6, source),
        property_type = COALESCE($7, property_type),
        budget = COALESCE($8, budget),
        notes = COALESCE($9, notes),
        status = COALESCE($10, status),
        assigned_to = COALESCE($11, assigned_to),
        updated_at = $12
      WHERE id = $1
    `, [
      id, updateData.name, updateData.email, updateData.phone, updateData.city,
      updateData.source, updateData.propertyType, updateData.budget, updateData.notes,
      updateData.status, updateData.assignedTo, new Date().toISOString()
    ]);
    
    const result = await pool.query('SELECT * FROM leads WHERE id = $1', [id]);
    
    res.json({
      success: true,
      data: result.rows[0],
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
    const propertyData = req.body;
    const newProperty = {
      id: generateId(),
      ...propertyData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    await pool.query(`
      INSERT INTO properties (id, title, type, price, location, bedrooms, bathrooms, area, description, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
      newProperty.id, newProperty.title, newProperty.type, newProperty.price,
      newProperty.location, newProperty.bedrooms, newProperty.bathrooms,
      newProperty.area, newProperty.description, newProperty.status,
      newProperty.created_at, newProperty.updated_at
    ]);
    
    res.status(201).json({
      success: true,
      data: newProperty,
      message: 'Property created successfully'
    });
  } catch (error) {
    console.error('Error creating property:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create property'
    });
  }
});

// Team endpoints
app.get('/api/team', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM team_members ORDER BY created_at DESC');
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
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
    
    res.status(201).json({
      success: true,
      data: newMember,
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
