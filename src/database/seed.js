const { connectDatabase } = require('./connection');
const { User, Lead, Property, FollowUp } = require('../models');
const logger = require('../utils/logger');

async function seedDatabase() {
  try {
    logger.info('Starting database seeding...');
    
    // Connect to database
    await connectDatabase();
    
    const agencyId = process.env.AGENCY_ID || 'default';
    
    // Create demo users
    const users = await createDemoUsers(agencyId);
    logger.info(`Created ${users.length} demo users`);
    
    // Create demo leads
    const leads = await createDemoLeads(agencyId, users);
    logger.info(`Created ${leads.length} demo leads`);
    
    // Create demo properties
    const properties = await createDemoProperties(agencyId);
    logger.info(`Created ${properties.length} demo properties`);
    
    // Create demo follow-ups
    const followUps = await createDemoFollowUps(leads, users);
    logger.info(`Created ${followUps.length} demo follow-ups`);
    
    logger.info('Database seeding completed successfully');
    
  } catch (error) {
    logger.error('Seeding failed:', error);
    process.exit(1);
  }
}

async function createDemoUsers(agencyId) {
  const users = [
    {
      email: 'manager@demo.com',
      password: 'demo123',
      first_name: 'John',
      last_name: 'Manager',
      role: 'manager',
      phone: '+1234567890',
      agency_id: agencyId,
      status: 'active',
      email_verified: true
    },
    {
      email: 'super@demo.com',
      password: 'demo123',
      first_name: 'Sarah',
      last_name: 'SuperAgent',
      role: 'super_agent',
      phone: '+1234567891',
      agency_id: agencyId,
      status: 'active',
      email_verified: true
    },
    {
      email: 'agent@demo.com',
      password: 'demo123',
      first_name: 'Mike',
      last_name: 'Agent',
      role: 'agent',
      phone: '+1234567892',
      agency_id: agencyId,
      status: 'active',
      email_verified: true
    }
  ];
  
  const createdUsers = [];
  
  for (const userData of users) {
    try {
      // Check if user already exists
      const existingUser = await User.findOne({
        where: { email: userData.email, agency_id: agencyId }
      });
      
      if (!existingUser) {
        const user = await User.create(userData);
        createdUsers.push(user);
        logger.info(`Created user: ${user.email}`);
      } else {
        createdUsers.push(existingUser);
        logger.info(`User already exists: ${existingUser.email}`);
      }
    } catch (error) {
      logger.error(`Failed to create user ${userData.email}:`, error);
    }
  }
  
  return createdUsers;
}

async function createDemoLeads(agencyId, users) {
  const leads = [
    {
      first_name: 'Alice',
      last_name: 'Johnson',
      email: 'alice.johnson@email.com',
      phone: '+1555123456',
      city: 'New York',
      status: 'new',
      source: 'website',
      budget_min: 500000,
      budget_max: 750000,
      property_type: 'apartment',
      bedrooms: 2,
      bathrooms: 2,
      notes: 'Looking for a modern apartment in Manhattan',
      priority: 'high',
      score: 85,
      agency_id: agencyId
    },
    {
      first_name: 'Bob',
      last_name: 'Smith',
      email: 'bob.smith@email.com',
      phone: '+1555123457',
      city: 'Los Angeles',
      status: 'contacted',
      source: 'facebook',
      budget_min: 800000,
      budget_max: 1200000,
      property_type: 'house',
      bedrooms: 3,
      bathrooms: 3,
      notes: 'Family looking for a house with a garden',
      priority: 'medium',
      score: 70,
      assigned_to: users[1]?.id, // Assign to super agent
      agency_id: agencyId
    },
    {
      first_name: 'Carol',
      last_name: 'Davis',
      email: 'carol.davis@email.com',
      phone: '+1555123458',
      whatsapp: '+1555123458',
      city: 'Chicago',
      status: 'qualified',
      source: 'referral',
      budget_min: 300000,
      budget_max: 500000,
      property_type: 'condo',
      bedrooms: 1,
      bathrooms: 1,
      notes: 'First-time buyer, needs guidance',
      priority: 'medium',
      score: 75,
      assigned_to: users[2]?.id, // Assign to agent
      agency_id: agencyId
    },
    {
      first_name: 'David',
      last_name: 'Wilson',
      email: 'david.wilson@email.com',
      phone: '+1555123459',
      city: 'Miami',
      status: 'proposal',
      source: 'google',
      budget_min: 1000000,
      budget_max: 1500000,
      property_type: 'villa',
      bedrooms: 4,
      bathrooms: 4,
      notes: 'Looking for luxury waterfront property',
      priority: 'high',
      score: 90,
      assigned_to: users[0]?.id, // Assign to manager
      agency_id: agencyId
    },
    {
      first_name: 'Emma',
      last_name: 'Brown',
      email: 'emma.brown@email.com',
      phone: '+1555123460',
      city: 'Seattle',
      status: 'new',
      source: 'walk-in',
      budget_min: 400000,
      budget_max: 600000,
      property_type: 'townhouse',
      bedrooms: 2,
      bathrooms: 2,
      notes: 'Young professional, flexible on location',
      priority: 'low',
      score: 60,
      agency_id: agencyId
    }
  ];
  
  const createdLeads = [];
  
  for (const leadData of leads) {
    try {
      // Check if lead already exists
      const existingLead = await Lead.findOne({
        where: { email: leadData.email, agency_id: agencyId }
      });
      
      if (!existingLead) {
        const lead = await Lead.create(leadData);
        createdLeads.push(lead);
        logger.info(`Created lead: ${lead.getFullName()}`);
      } else {
        createdLeads.push(existingLead);
        logger.info(`Lead already exists: ${existingLead.getFullName()}`);
      }
    } catch (error) {
      logger.error(`Failed to create lead ${leadData.first_name} ${leadData.last_name}:`, error);
    }
  }
  
  return createdLeads;
}

async function createDemoProperties(agencyId) {
  const properties = [
    {
      title: 'Modern Manhattan Apartment',
      description: 'Stunning 2-bedroom apartment with city views in the heart of Manhattan. Features modern amenities and prime location.',
      type: 'apartment',
      price: 650000,
      location: 'Manhattan, New York',
      bedrooms: 2,
      bathrooms: 2,
      area: 1200,
      status: 'available',
      features: ['City View', 'Modern Kitchen', 'Gym', 'Doorman'],
      agency_id: agencyId
    },
    {
      title: 'Family House with Garden',
      description: 'Beautiful 3-bedroom house with a large garden, perfect for families. Located in a quiet neighborhood.',
      type: 'house',
      price: 950000,
      location: 'Beverly Hills, Los Angeles',
      bedrooms: 3,
      bathrooms: 3,
      area: 2500,
      status: 'available',
      features: ['Garden', 'Garage', 'Fireplace', 'Pool'],
      agency_id: agencyId
    },
    {
      title: 'Downtown Condo',
      description: 'Cozy 1-bedroom condo in downtown Chicago. Perfect for young professionals.',
      type: 'condo',
      price: 380000,
      location: 'Downtown, Chicago',
      bedrooms: 1,
      bathrooms: 1,
      area: 800,
      status: 'available',
      features: ['Downtown Location', 'Modern Appliances', 'Balcony'],
      agency_id: agencyId
    },
    {
      title: 'Luxury Waterfront Villa',
      description: 'Exclusive 4-bedroom villa with private beach access and stunning ocean views.',
      type: 'villa',
      price: 1250000,
      location: 'Miami Beach, Miami',
      bedrooms: 4,
      bathrooms: 4,
      area: 3500,
      status: 'available',
      features: ['Ocean View', 'Private Beach', 'Pool', 'Wine Cellar'],
      agency_id: agencyId
    },
    {
      title: 'Modern Townhouse',
      description: 'Contemporary 2-bedroom townhouse with rooftop terrace in trendy Seattle neighborhood.',
      type: 'townhouse',
      price: 520000,
      location: 'Capitol Hill, Seattle',
      bedrooms: 2,
      bathrooms: 2,
      area: 1600,
      status: 'available',
      features: ['Rooftop Terrace', 'Modern Design', 'Walk Score 95'],
      agency_id: agencyId
    }
  ];
  
  const createdProperties = [];
  
  for (const propertyData of properties) {
    try {
      // Check if property already exists
      const existingProperty = await Property.findOne({
        where: { title: propertyData.title, agency_id: agencyId }
      });
      
      if (!existingProperty) {
        const property = await Property.create(propertyData);
        createdProperties.push(property);
        logger.info(`Created property: ${property.title}`);
      } else {
        createdProperties.push(existingProperty);
        logger.info(`Property already exists: ${existingProperty.title}`);
      }
    } catch (error) {
      logger.error(`Failed to create property ${propertyData.title}:`, error);
    }
  }
  
  return createdProperties;
}

async function createDemoFollowUps(leads, users) {
  if (leads.length === 0 || users.length === 0) {
    logger.warn('No leads or users available for creating follow-ups');
    return [];
  }
  
  const followUps = [
    {
      lead_id: leads[0]?.id,
      assigned_to: users[1]?.id,
      type: 'call',
      description: 'Initial consultation call to discuss requirements',
      due_date: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      priority: 'high',
      status: 'pending'
    },
    {
      lead_id: leads[1]?.id,
      assigned_to: users[1]?.id,
      type: 'email',
      description: 'Send property recommendations based on criteria',
      due_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // Day after tomorrow
      priority: 'medium',
      status: 'pending'
    },
    {
      lead_id: leads[2]?.id,
      assigned_to: users[2]?.id,
      type: 'meeting',
      description: 'Property viewing appointment',
      due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // In 3 days
      priority: 'high',
      status: 'pending'
    }
  ];
  
  const createdFollowUps = [];
  
  for (const followUpData of followUps) {
    try {
      if (followUpData.lead_id && followUpData.assigned_to) {
        const followUp = await FollowUp.create(followUpData);
        createdFollowUps.push(followUp);
        logger.info(`Created follow-up: ${followUp.type} for lead ${followUpData.lead_id}`);
      }
    } catch (error) {
      logger.error(`Failed to create follow-up:`, error);
    }
  }
  
  return createdFollowUps;
}

// Run seeding if this file is executed directly
if (require.main === module) {
  seedDatabase()
    .then(() => {
      logger.info('Seeding script completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Seeding script failed:', error);
      process.exit(1);
    });
}

module.exports = { seedDatabase };
