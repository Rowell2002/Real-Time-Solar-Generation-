'use strict';

require('dotenv').config();
const app = require('./app');
const { sequelize } = require('./models');

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Authenticate database connection
    await sequelize.authenticate();
    console.log('✔ PostgreSQL connection established successfully.');

    app.listen(PORT, () => {
      console.log(`🚀 SLSEA Solar Tracking REST API running on port ${PORT}`);
      console.log(`📡 Health Check: http://localhost:${PORT}/health`);
      console.log(`🌐 Base API:     http://localhost:${PORT}/api/v1/provinces`);
    });
  } catch (error) {
    console.error('❌ Failed to start server due to database error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };
