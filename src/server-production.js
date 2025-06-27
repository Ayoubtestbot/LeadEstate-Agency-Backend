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

// Persistent in-memory data storage with file backup
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/storage.json');

// Ensure data directory exists
const dataDir = path.dirname(DATA_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Load data from file or initialize empty
let persistentData = {
  leads: [],
  properties: [],
  teamMembers: [],
  users: []
};

// Load existing data
try {
  if (fs.existsSync(DATA_FILE)) {
    const fileData = fs.readFileSync(DATA_FILE, 'utf8');
    persistentData = JSON.parse(fileData);
    console.log('✅ Loaded existing data from storage file');
  }
} catch (error) {
  console.warn('⚠️ Could not load existing data, starting fresh:', error.message);
}

// Save data to file
const saveData = () => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(persistentData, null, 2));
    console.log('💾 Data saved to persistent storage');
  } catch (error) {
    console.error('❌ Failed to save data:', error.message);
  }
};

// Auto-save every 30 seconds
setInterval(saveData, 30000);

// Save on process exit
process.on('SIGINT', () => {
  console.log('\n🔄 Saving data before exit...');
  saveData();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🔄 Saving data before termination...');
  saveData();
  process.exit(0);
});

// Helper function to generate IDs
const generateId = () => Date.now().toString() + Math.random().toString(36).substr(2, 9);

// Status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    message: 'LeadEstate API is running (Production Mode)',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    storage: 'persistent-file-based',
    data: {
      leads: persistentData.leads.length,
      properties: persistentData.properties.length,
      teamMembers: persistentData.teamMembers.length,
      users: persistentData.users.length
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
    data: persistentData.leads,
    count: persistentData.leads.length
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
  
  persistentData.leads.push(newLead);
  saveData();
  
  res.status(201).json({
    success: true,
    data: newLead,
    message: 'Lead created successfully'
  });
});

app.put('/api/leads/:id', (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  
  const leadIndex = persistentData.leads.findIndex(lead => lead.id === id);
  if (leadIndex === -1) {
    return res.status(404).json({
      success: false,
      message: 'Lead not found'
    });
  }
  
  persistentData.leads[leadIndex] = {
    ...persistentData.leads[leadIndex],
    ...updateData,
    updatedAt: new Date().toISOString()
  };
  
  saveData();
  
  res.json({
    success: true,
    data: persistentData.leads[leadIndex],
    message: 'Lead updated successfully'
  });
});

app.delete('/api/leads/:id', (req, res) => {
  const { id } = req.params;
  const leadIndex = persistentData.leads.findIndex(lead => lead.id === id);
  
  if (leadIndex === -1) {
    return res.status(404).json({
      success: false,
      message: 'Lead not found'
    });
  }
  
  persistentData.leads.splice(leadIndex, 1);
  saveData();
  
  res.json({
    success: true,
    message: 'Lead deleted successfully'
  });
});

// Properties endpoints
app.get('/api/properties', (req, res) => {
  res.json({
    success: true,
    data: persistentData.properties,
    count: persistentData.properties.length
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
  
  persistentData.properties.push(newProperty);
  saveData();
  
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
    data: persistentData.teamMembers,
    count: persistentData.teamMembers.length
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
  
  persistentData.teamMembers.push(newMember);
  saveData();
  
  res.status(201).json({
    success: true,
    data: newMember,
    message: 'Team member added successfully'
  });
});

app.put('/api/team/:id', (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  
  const memberIndex = persistentData.teamMembers.findIndex(member => member.id === id);
  if (memberIndex === -1) {
    return res.status(404).json({
      success: false,
      message: 'Team member not found'
    });
  }
  
  persistentData.teamMembers[memberIndex] = {
    ...persistentData.teamMembers[memberIndex],
    ...updateData,
    updatedAt: new Date().toISOString()
  };
  
  saveData();
  
  res.json({
    success: true,
    data: persistentData.teamMembers[memberIndex],
    message: 'Team member updated successfully'
  });
});

app.delete('/api/team/:id', (req, res) => {
  const { id } = req.params;
  const memberIndex = persistentData.teamMembers.findIndex(member => member.id === id);
  
  if (memberIndex === -1) {
    return res.status(404).json({
      success: false,
      message: 'Team member not found'
    });
  }
  
  persistentData.teamMembers.splice(memberIndex, 1);
  saveData();
  
  res.json({
    success: true,
    message: 'Team member deleted successfully'
  });
});

// Dashboard stats endpoint
app.get('/api/dashboard/stats', (req, res) => {
  const stats = {
    totalLeads: persistentData.leads.length,
    availableProperties: persistentData.properties.length,
    conversionRate: persistentData.leads.length > 0 ? 
      ((persistentData.leads.filter(l => l.status === 'closed_won').length / persistentData.leads.length) * 100).toFixed(1) : 0,
    closedWonLeads: persistentData.leads.filter(l => l.status === 'closed_won').length
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
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'production'}`);
  console.log(`💾 Storage: Persistent File-Based`);
  console.log(`🌐 CORS enabled for production domains`);
  console.log(`📡 API Status: http://localhost:${PORT}/api/status`);
  console.log(`💾 Data file: ${DATA_FILE}`);
});
