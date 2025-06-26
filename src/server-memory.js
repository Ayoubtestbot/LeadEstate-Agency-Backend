const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
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

// In-memory data storage
let leads = [];
let properties = [];
let teamMembers = [];
let users = [];

// Helper function to generate IDs
const generateId = () => Date.now().toString() + Math.random().toString(36).substr(2, 9);

// Status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    message: 'LeadEstate API is running (Memory Mode)',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    storage: 'in-memory',
    data: {
      leads: leads.length,
      properties: properties.length,
      teamMembers: teamMembers.length,
      users: users.length
    }
  });
});

// Auth endpoints
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  // Simple demo authentication
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
app.get('/api/leads', (req, res) => {
  res.json({
    success: true,
    data: leads,
    count: leads.length
  });
});

app.post('/api/leads', (req, res) => {
  const leadData = req.body;
  const newLead = {
    id: generateId(),
    ...leadData,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  leads.push(newLead);
  
  res.status(201).json({
    success: true,
    data: newLead,
    message: 'Lead created successfully'
  });
});

app.put('/api/leads/:id', (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  
  const leadIndex = leads.findIndex(lead => lead.id === id);
  if (leadIndex === -1) {
    return res.status(404).json({
      success: false,
      message: 'Lead not found'
    });
  }
  
  leads[leadIndex] = {
    ...leads[leadIndex],
    ...updateData,
    updatedAt: new Date().toISOString()
  };
  
  res.json({
    success: true,
    data: leads[leadIndex],
    message: 'Lead updated successfully'
  });
});

app.delete('/api/leads/:id', (req, res) => {
  const { id } = req.params;
  const leadIndex = leads.findIndex(lead => lead.id === id);
  
  if (leadIndex === -1) {
    return res.status(404).json({
      success: false,
      message: 'Lead not found'
    });
  }
  
  leads.splice(leadIndex, 1);
  
  res.json({
    success: true,
    message: 'Lead deleted successfully'
  });
});

// Properties endpoints
app.get('/api/properties', (req, res) => {
  res.json({
    success: true,
    data: properties,
    count: properties.length
  });
});

app.post('/api/properties', (req, res) => {
  const propertyData = req.body;
  const newProperty = {
    id: generateId(),
    ...propertyData,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  properties.push(newProperty);
  
  res.status(201).json({
    success: true,
    data: newProperty,
    message: 'Property created successfully'
  });
});

// Team endpoints
app.get('/api/team', (req, res) => {
  res.json({
    success: true,
    data: teamMembers,
    count: teamMembers.length
  });
});

app.post('/api/team', (req, res) => {
  const memberData = req.body;
  const newMember = {
    id: generateId(),
    ...memberData,
    joinedAt: new Date().toISOString(),
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  teamMembers.push(newMember);
  
  res.status(201).json({
    success: true,
    data: newMember,
    message: 'Team member added successfully'
  });
});

app.put('/api/team/:id', (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  
  const memberIndex = teamMembers.findIndex(member => member.id === id);
  if (memberIndex === -1) {
    return res.status(404).json({
      success: false,
      message: 'Team member not found'
    });
  }
  
  teamMembers[memberIndex] = {
    ...teamMembers[memberIndex],
    ...updateData,
    updatedAt: new Date().toISOString()
  };
  
  res.json({
    success: true,
    data: teamMembers[memberIndex],
    message: 'Team member updated successfully'
  });
});

app.delete('/api/team/:id', (req, res) => {
  const { id } = req.params;
  const memberIndex = teamMembers.findIndex(member => member.id === id);
  
  if (memberIndex === -1) {
    return res.status(404).json({
      success: false,
      message: 'Team member not found'
    });
  }
  
  teamMembers.splice(memberIndex, 1);
  
  res.json({
    success: true,
    message: 'Team member deleted successfully'
  });
});

// Dashboard stats endpoint
app.get('/api/dashboard/stats', (req, res) => {
  const stats = {
    totalLeads: leads.length,
    availableProperties: properties.length,
    conversionRate: leads.length > 0 ? ((leads.filter(l => l.status === 'closed_won').length / leads.length) * 100).toFixed(1) : 0,
    closedWonLeads: leads.filter(l => l.status === 'closed_won').length
  };
  
  res.json({
    success: true,
    data: stats
  });
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 LeadEstate API Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`💾 Storage: In-Memory (for development)`);
  console.log(`🌐 CORS enabled for: http://localhost:5001`);
  console.log(`📡 API Status: http://localhost:${PORT}/api/status`);
});
