const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

let sequelize;

const connectDatabase = async () => {
  try {
    // Database configuration
    const config = {
      dialect: process.env.DATABASE_URL?.startsWith('sqlite:') ? 'sqlite' : 'postgres',
      logging: process.env.NODE_ENV === 'development' ?
        (msg) => logger.debug(msg) : false,
      pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000
      },
      dialectOptions: {
        ssl: process.env.NODE_ENV === 'production' ? {
          require: true,
          rejectUnauthorized: false
        } : false
      },
      define: {
        timestamps: true,
        underscored: true,
        freezeTableName: true
      }
    };

    // Create Sequelize instance
    if (process.env.DATABASE_URL) {
      // Use DATABASE_URL if provided (for production)
      console.log('Using DATABASE_URL for connection');
      console.log('URL format:', process.env.DATABASE_URL.substring(0, 30) + '...');

      // Validate URL format
      if (!process.env.DATABASE_URL.startsWith('postgresql://') &&
          !process.env.DATABASE_URL.startsWith('postgres://') &&
          !process.env.DATABASE_URL.startsWith('sqlite:')) {
        throw new Error('Invalid DATABASE_URL format. Must start with postgresql://, postgres://, or sqlite:');
      }

      sequelize = new Sequelize(process.env.DATABASE_URL, config);
    } else {
      console.log('Using individual environment variables for connection');
      // Use individual environment variables
      sequelize = new Sequelize(
        process.env.DB_NAME || 'leadEstate_agency',
        process.env.DB_USER || 'postgres',
        process.env.DB_PASSWORD || 'password',
        {
          host: process.env.DB_HOST || 'localhost',
          port: process.env.DB_PORT || 5432,
          ...config
        }
      );
    }

    // Test the connection
    await sequelize.authenticate();
    logger.info('Database connection established successfully');

    // Sync database in development
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
      logger.info('Database synchronized');
    }

    return sequelize;
  } catch (error) {
    logger.error('Unable to connect to the database:', error);
    throw error;
  }
};

const getSequelize = () => {
  if (!sequelize) {
    // Try to initialize if not already done
    console.log('Database not initialized, attempting to initialize...');
    return null;
  }
  return sequelize;
};

const closeDatabase = async () => {
  if (sequelize) {
    await sequelize.close();
    logger.info('Database connection closed');
  }
};

module.exports = {
  connectDatabase,
  getSequelize,
  closeDatabase,
  sequelize
};
