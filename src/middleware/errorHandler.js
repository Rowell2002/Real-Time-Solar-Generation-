'use strict';

/**
 * Standard HTTP status code to error code / message mappings.
 */
const STATUS_CODE_MAP = {
  400: { code: 'BAD_REQUEST', message: 'Bad Request: The request could not be understood or was missing required parameters.' },
  401: { code: 'UNAUTHORIZED', message: 'Unauthorized: Authentication credentials are required or invalid.' },
  403: { code: 'FORBIDDEN', message: 'Forbidden: You do not have permission to access the requested resource.' },
  404: { code: 'NOT_FOUND', message: 'Not Found: The specified resource does not exist.' },
  406: { code: 'NOT_ACCEPTABLE', message: 'Not Acceptable: The requested media format is not supported.' },
  409: { code: 'CONFLICT', message: 'Conflict: A resource with these unique attributes already exists.' },
  412: { code: 'PRECONDITION_FAILED', message: 'Precondition Failed: The condition specified in request headers evaluated to false.' },
  422: { code: 'VALIDATION_ERROR', message: 'Validation Error: Semantic validation of request attributes failed.' },
  429: { code: 'TOO_MANY_REQUESTS', message: 'Too Many Requests: Rate limit quota exceeded. Please slow down.' },
  500: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal Server Error: An unexpected server error occurred.' },
  503: { code: 'SERVICE_UNAVAILABLE', message: 'Service Unavailable: The database or downstream service is temporarily unavailable.' },
};

/**
 * Centralized Express global exception handler.
 * Produces a standardized JSON error contract across the entire API:
 * {
 *   "code": "STRING_ERROR_CODE",
 *   "message": "Human-readable summary message.",
 *   "detail": "Specific technical detail or parameter error.",
 *   "timestamp": "ISO8601_TIMESTAMP"
 * }
 */
function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || err.status || 500;
  let code = err.code || null;
  let message = err.message || null;
  let detail = err.detail || null;

  // 1. MySQL / Sequelize Foreign Key Constraint Violations (MySQL 1451, 1452)
  if (
    err.name === 'SequelizeForeignKeyConstraintError' ||
    err.original?.code === 'ER_ROW_IS_REFERENCED_2' ||
    err.original?.code === 'ER_NO_REFERENCED_ROW_2' ||
    err.original?.errno === 1451 ||
    err.original?.errno === 1452
  ) {
    statusCode = 422;
    code = 'FOREIGN_KEY_VIOLATION';
    message = 'Foreign key constraint failure: Referenced entity does not exist or is constrained.';
    detail =
      err.parent?.message ||
      (err.table ? `Constraint violation on table '${err.table}' (fields: ${err.fields?.join(', ') || 'N/A'}).` : err.message);
  }

  // 2. MySQL / Sequelize Unique Constraint / Duplicate Key Violations (MySQL 1062)
  else if (
    err.name === 'SequelizeUniqueConstraintError' ||
    err.original?.code === 'ER_DUP_ENTRY' ||
    err.original?.errno === 1062
  ) {
    statusCode = 409;
    code = 'DUPLICATE_KEY_ERROR';
    message = 'A record with the specified unique key already exists.';
    detail = err.errors
      ? err.errors.map((e) => `${e.path || 'field'} '${e.value}' is already in use.`).join('; ')
      : err.parent?.message || err.message;
  }

  // 3. MySQL / Sequelize Connection & Network Timeouts
  else if (
    err.name === 'SequelizeConnectionError' ||
    err.name === 'SequelizeConnectionTimedOutError' ||
    err.name === 'SequelizeTimeoutError' ||
    err.name === 'SequelizeConnectionRefusedError' ||
    err.name === 'SequelizeHostNotFoundError' ||
    err.name === 'SequelizeHostNotReachableError' ||
    err.name === 'SequelizeInvalidConnectionError' ||
    err.name === 'TimeoutError' ||
    err.original?.code === 'ETIMEDOUT' ||
    err.original?.code === 'ECONNREFUSED' ||
    err.original?.code === 'PROTOCOL_CONNECTION_LOST' ||
    err.original?.code === 'ER_CON_COUNT_ERROR'
  ) {
    statusCode = 503;
    code = 'DATABASE_CONNECTION_TIMEOUT';
    message = 'Database connection timed out or database cluster is unavailable.';
    detail = err.message || 'The database failed to respond within the configured timeout period.';
  }

  // 4. Sequelize Entity Validation Errors
  else if (err.name === 'SequelizeValidationError') {
    statusCode = 422;
    code = 'VALIDATION_ERROR';
    message = 'Validation Error: One or more fields failed validation constraints.';
    detail = err.errors
      ? err.errors.map((e) => `${e.path}: ${e.message}`).join(', ')
      : err.message;
  }

  // 5. Malformed JSON Body Parsing Error
  else if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    statusCode = 400;
    code = 'BAD_REQUEST';
    message = 'Malformed JSON payload in request body.';
    detail = err.message;
  }

  // 6. Generic Sequelize Database Errors
  else if (err.name === 'SequelizeDatabaseError') {
    statusCode = 500;
    code = 'DATABASE_QUERY_ERROR';
    message = 'A database query execution error occurred.';
    detail = err.parent?.message || err.message;
  }

  // Apply fallback codes and messages based on HTTP status
  const fallback = STATUS_CODE_MAP[statusCode] || {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected internal error occurred.',
  };

  code = code || fallback.code;
  message = message || fallback.message;

  // Format detail
  if (detail !== null && typeof detail === 'object') {
    detail = Array.isArray(detail)
      ? detail.map((d) => (typeof d === 'object' && d.message ? d.message : JSON.stringify(d))).join('; ')
      : JSON.stringify(detail);
  } else if (detail !== null) {
    detail = String(detail);
  }

  const responseBody = {
    code,
    message,
    detail: detail || null,
    timestamp: err.timestamp || new Date().toISOString(),
  };

  // Ensure JSON Content-Type
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  // Log 5xx errors for observability
  if (statusCode >= 500) {
    console.error(`[GlobalErrorHandler] ${req.method} ${req.originalUrl} (${statusCode}):`, err);
  }

  return res.status(statusCode).json(responseBody);
}

module.exports = errorHandler;
module.exports.STATUS_CODE_MAP = STATUS_CODE_MAP;
