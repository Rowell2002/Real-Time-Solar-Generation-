'use strict';

const express = require('express');
const swaggerUi = require('swagger-ui-express');
const openApiSpec = require('./docs/openapi.json');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const requireHttps = require('./middleware/requireHttps');
const { sequelize } = require('./models');

const app = express();

// Enforce HTTPS and security headers
app.use(requireHttps);

// Standard middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health liveness check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'SLSEA Solar Generation Tracking API',
  });
});

// Deep readiness check endpoint verifying database connectivity
app.get('/health/ready', async (req, res) => {
  try {
    const start = Date.now();
    await sequelize.authenticate();
    const latencyMs = Date.now() - start;

    res.status(200).json({
      status: 'ready',
      database: 'connected',
      dialect: sequelize.getDialect(),
      latency_ms: latencyMs,
      timestamp: new Date().toISOString(),
      service: 'SLSEA Solar Generation Tracking API',
    });
  } catch (err) {
    return res.status(503).json({
      code: 'DATABASE_CONNECTION_TIMEOUT',
      message: 'Service Unavailable: Database connection failed during readiness probe.',
      detail: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Serve raw OpenAPI JSON for machine consumption & tooling
app.get(['/docs/openapi.json', '/api-docs.json'], (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json(openApiSpec);
});

// Mount live OpenAPI (Swagger UI) documentation at /docs
app.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(openApiSpec, {
    customSiteTitle: 'SLSEA Solar Generation Monitoring API Documentation',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
    },
  })
);

// Mount routes at root and /api/v1 for flexible client consumption
app.use('/api/v1', routes);
app.use('/', routes);

// 404 handler for undefined routes producing standardized error contract
app.use((req, res, next) => {
  res.status(404).json({
    code: 'NOT_FOUND',
    message: 'The requested API endpoint was not found.',
    detail: `Cannot ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString(),
  });
});

// Centralized error handler
app.use(errorHandler);

module.exports = app;
