const { Sequelize } = require('sequelize');

// Load environment configuration or fallback
const databaseUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/slsea_solar';

const sequelize = new Sequelize(databaseUrl, {
  dialect: 'postgres',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  define: {
    underscored: true,
    timestamps: true,
  },
  pool: {
    max: 20,
    min: 2,
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
