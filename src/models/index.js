require('dotenv').config();
require('pg');
require('pg-hstore');
const { Sequelize } = require('sequelize');

// Load environment configuration or fallback
const rawDatabaseUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/slsea_solar';
const databaseUrl = rawDatabaseUrl.replace(/[?&]sslmode=[^&]+/, '');

// Detect dialect: 'mysql', 'mariadb', or 'postgres'
const dialect = process.env.DB_DIALECT || (rawDatabaseUrl.startsWith('mysql') ? 'mysql' : rawDatabaseUrl.startsWith('mariadb') ? 'mariadb' : 'postgres');

const isPostgres = dialect === 'postgres';
const useSsl = isPostgres && (
  process.env.DB_SSL === 'true' ||
  rawDatabaseUrl.includes('sslmode=require') ||
  rawDatabaseUrl.includes('supabase.co') ||
  rawDatabaseUrl.includes('pooler.supabase.com')
);

const dialectOptions = useSsl ? {
  ssl: {
    require: true,
    rejectUnauthorized: false,
  },
} : {};

const sequelize = new Sequelize(databaseUrl, {
  dialect,
  dialectOptions,
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  define: {
    underscored: true,
    timestamps: true,
  },
  pool: {
    max: parseInt(process.env.DB_POOL_MAX || '20', 10),
    min: parseInt(process.env.DB_POOL_MIN || '2', 10),
    acquire: 30000,
    idle: 10000,
  },
});


// Import model classes
const Province = require('./Province');
const District = require('./District');
const GridSubstation = require('./GridSubstation');
const SolarInstallation = require('./SolarInstallation');
const GenerationReading = require('./GenerationReading');
const User = require('./User');

const models = {
  Province: Province.initModel(sequelize),
  District: District.initModel(sequelize),
  GridSubstation: GridSubstation.initModel(sequelize),
  SolarInstallation: SolarInstallation.initModel(sequelize),
  GenerationReading: GenerationReading.initModel(sequelize),
  User: User.initModel(sequelize),
};

// Wire up model associations
Object.values(models).forEach((model) => {
  if (typeof model.associate === 'function') {
    model.associate(models);
  }
});

module.exports = {
  sequelize,
  Sequelize,
  ...models,
};
