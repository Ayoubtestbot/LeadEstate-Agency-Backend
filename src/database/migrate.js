const { connectDatabase, getSequelize } = require('./connection');
const logger = require('../utils/logger');

// Import all models to ensure they're defined
require('../models');

async function runMigrations() {
  try {
    logger.info('Starting database migrations...');
    
    // Connect to database
    await connectDatabase();
    const sequelize = getSequelize();
    
    // Sync all models (create tables if they don't exist)
    await sequelize.sync({ 
      alter: process.env.NODE_ENV === 'development',
      force: false // Never drop tables in production
    });
    
    logger.info('Database migrations completed successfully');
    
    // Create indexes for better performance
    await createIndexes(sequelize);
    
    logger.info('Database indexes created successfully');
    
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

async function createIndexes(sequelize) {
  try {
    // Create additional indexes for better query performance
    const queries = [
      // Users table indexes
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_agency 
       ON users(email, agency_id);`,
      
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_role_status 
       ON users(role, status);`,
      
      // Leads table indexes
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_status_agency 
       ON leads(status, agency_id);`,
      
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_source_agency 
       ON leads(source, agency_id);`,
      
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_assigned_to 
       ON leads(assigned_to) WHERE assigned_to IS NOT NULL;`,
      
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_score_priority 
       ON leads(score DESC, priority);`,
      
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_next_follow_up 
       ON leads(next_follow_up) WHERE next_follow_up IS NOT NULL;`,
      
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_created_at 
       ON leads(created_at DESC);`,
      
      // Properties table indexes
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_properties_status_agency 
       ON properties(status, agency_id);`,
      
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_properties_type_agency 
       ON properties(type, agency_id);`,
      
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_properties_price_range 
       ON properties(price) WHERE price IS NOT NULL;`,
      
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_properties_location 
       ON properties(location) WHERE location IS NOT NULL;`,
      
      // Follow-ups table indexes
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_follow_ups_due_date 
       ON follow_ups(due_date) WHERE due_date IS NOT NULL;`,
      
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_follow_ups_status_assigned 
       ON follow_ups(status, assigned_to);`,
      
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_follow_ups_priority 
       ON follow_ups(priority);`,
      
      // Activities table indexes
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activities_type_date 
       ON activities(type, created_at DESC);`,
      
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activities_lead_id 
       ON activities(lead_id) WHERE lead_id IS NOT NULL;`,
      
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activities_property_id 
       ON activities(property_id) WHERE property_id IS NOT NULL;`,
      
      // Lead-Properties junction table indexes
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lead_properties_lead_id 
       ON lead_properties(lead_id);`,
      
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lead_properties_property_id 
       ON lead_properties(property_id);`,
    ];
    
    for (const query of queries) {
      try {
        await sequelize.query(query);
        logger.info(`Index created: ${query.split('IF NOT EXISTS')[1]?.split('ON')[0]?.trim()}`);
      } catch (error) {
        // Ignore errors for existing indexes
        if (!error.message.includes('already exists')) {
          logger.warn(`Failed to create index: ${error.message}`);
        }
      }
    }
    
  } catch (error) {
    logger.error('Failed to create indexes:', error);
    throw error;
  }
}

// Run migrations if this file is executed directly
if (require.main === module) {
  runMigrations()
    .then(() => {
      logger.info('Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { runMigrations, createIndexes };
