'use strict';

const express = require('express');
const openApiSpec = require('./docs/openapi.json');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const requireHttps = require('./middleware/requireHttps');
const { sequelize } = require('./models');

const app = express();

// Trust proxy for reverse proxies (Vercel, Cloudflare, etc.)
app.set('trust proxy', 1);

// Enforce HTTPS and security headers
app.use(requireHttps);

// Standard middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Swagger UI HTML Template using reliable unpkg CDN
const swaggerHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SLSEA Solar Generation Monitoring API Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
  <link rel="icon" type="image/png" href="https://unpkg.com/swagger-ui-dist@5.11.0/favicon-32x32.png" />
  <style>
    html { box-sizing: border-box; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin: 0; background: #fafafa; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info { margin: 25px 0; }
    .swagger-ui .info .title { color: #0284c7; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js" crossorigin></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-standalone-preset.js" crossorigin></script>
  <script>
    window.onload = function() {
      window.ui = SwaggerUIBundle({
        url: '/docs/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout",
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true
      });
    };
  </script>
</body>
</html>`;

// Root landing route - returns JSON service catalog
app.get('/', (req, res) => {
  res.status(200).json({
    service: 'Sri Lanka Sustainable Energy Authority (SLSEA) Solar Generation Tracking API',
    version: '1.1.0',
    environment: process.env.NODE_ENV || 'production',
    documentation: '/docs',
    openapi_spec: '/docs/openapi.json',
    health_liveness: '/health',
    health_readiness: '/health/ready',
    api_v1_base: '/api/v1',
    timestamp: new Date().toISOString(),
  });
});

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

// Mount live OpenAPI (Swagger UI) documentation at /docs and /docs/
app.get(['/docs', '/docs/'], (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(swaggerHtml);
});

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
