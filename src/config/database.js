'use strict';

require('dotenv').config();

const databaseUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/slsea_solar';
const dialect = process.env.DB_DIALECT || (databaseUrl.startsWith('mysql') ? 'mysql' : 'postgres');

const isPostgres = dialect === 'postgres';
const useSsl = isPostgres && (
  process.env.DB_SSL === 'true' ||
  databaseUrl.includes('sslmode=require') ||
  databaseUrl.includes('supabase.co') ||
  databaseUrl.includes('pooler.supabase.com')
);

const dialectOptions = useSsl ? {
  ssl: {
    require: true,
    rejectUnauthorized: false,
  },
} : {};

const config = {
  url: databaseUrl,
  dialect,
  dialectOptions,
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  define: {
    underscored: true,
    timestamps: true,
  },
  pool: {
    max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    min: parseInt(process.env.DB_POOL_MIN || '0', 10),
    acquire: 30000,
    idle: 10000,
  },
};

module.exports = {
  development: config,
  test: config,
  production: config,
};
