'use strict';

// Explicit requires to guarantee Vercel Serverless Function Bundler traces and includes DB packages
require('pg');
require('pg-hstore');

let app;
let initError = null;

try {
  app = require('../src/app');
} catch (err) {
  initError = err;
  console.error('CRITICAL INIT ERROR:', err);
}

module.exports = (req, res) => {
  if (initError) {
    return res.status(500).json({
      code: 'SERVER_INITIALIZATION_FAILED',
      message: initError.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : initError.stack,
      detail: 'Failed to load application module during cold start.',
      error: initError.toString(),
    });
  }

  if (!app) {
    try {
      app = require('../src/app');
    } catch (err) {
      console.error('RUNTIME REQUIRE ERROR:', err);
      return res.status(500).json({
        code: 'RUNTIME_MODULE_LOAD_ERROR',
        message: err.message,
        error: err.toString(),
      });
    }
  }

  return app(req, res);
};
