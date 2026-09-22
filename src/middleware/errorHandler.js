'use strict';

/**
 * Centralized Express error-handling middleware.
 * Formats errors consistently as JSON.
 */
function errorHandler(err, req, res, next) {
  // Check for Sequelize validation errors
  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'One or more fields failed validation.',
      details: err.errors ? err.errors.map((e) => ({ field: e.path, message: e.message })) : err.message,
    });
  }

  // Check for Sequelize unique constraint violation
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      error: 'Conflict',
      message: 'A resource with these unique attributes already exists.',
      details: err.errors ? err.errors.map((e) => ({ field: e.path, message: e.message })) : err.message,
    });
  }

  // Check for JSON parse error
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Malformed JSON payload in request body.',
    });
  }

  const statusCode = err.statusCode || err.status || 500;
  const isProd = process.env.NODE_ENV === 'production';

  console.error(`[Error] ${req.method} ${req.originalUrl}:`, err);

  res.status(statusCode).json({
    error: err.name || 'Internal Server Error',
    message: err.message || 'An unexpected error occurred.',
    ...(isProd ? {} : { stack: err.stack }),
  });
}

module.exports = errorHandler;
