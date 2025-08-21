// src/db/connection.ts
import { Sequelize } from "sequelize";
import { dbConfig } from "../config/dbConfig"; // Import our validated config

// Use Sequelize's built-in schema option
console.log('DB connection params being used:', {
  host: dbConfig.host,
  port: dbConfig.port,
  name: dbConfig.name,
  user: dbConfig.user,
  pass: dbConfig.pass,
  schema: dbConfig.schema || 'public',
  hostCodes: Array.from(dbConfig.host).map((c) => c.charCodeAt(0)),
  userCodes: Array.from(dbConfig.user).map((c) => c.charCodeAt(0)),
});

const sequelize = new Sequelize(dbConfig.name, dbConfig.user, dbConfig.pass, {
  host: dbConfig.host,
  port: dbConfig.port,
  dialect: "postgres",
  schema: dbConfig.schema || 'public', 

  pool: {
    max: 50,
    min: 0,
    acquire: 1200000,
    idle: 1000000
  },
  logging: false, // Set to console.log for debugging SQL queries

  define: {
    underscored: true,
    timestamps: false
  },

  dialectOptions: {
    // ssl: false, // Generally better to configure SSL for production
    useUTC: false, // Keep if you want local time
    dateStrings: true, // This is sufficient for returning dates as strings
  },

  timezone: 'Asia/Kolkata' // For writing dates to the database
});


export const testDbConnection = async (): Promise<void> => {
  try {
    await sequelize.authenticate();
    console.log('✅ Remote Database Connection has been established successfully.');
    if (dbConfig.schema) {
      console.log(`✅ Default schema set to: ${dbConfig.schema}`);
    }
  } catch (error) {
    console.error('🔴 Unable to connect to the database:', error);    
    throw error;
  }
};

// Export the sequelize instance for use in models
export default sequelize;