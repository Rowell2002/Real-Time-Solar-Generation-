'use strict';

/**
 * Standardized operational error class matching the SLSEA API error contract:
 * {
 *   "code": "STRING_ERROR_CODE",
 *   "message": "Human-readable summary message.",
 *   "detail": "Specific technical detail or parameter error.",
 *   "timestamp": "ISO8601_TIMESTAMP"
 * }
 */
class ApiError extends Error {
  /**
   * @param {number} statusCode - HTTP status code (e.g. 400, 401, 403, 404, 406, 412, 422, 500, 503)
   * @param {string} code - Machine-readable error code (e.g. 'BAD_REQUEST', 'VALIDATION_ERROR')
   * @param {string} message - Human-readable summary message
   * @param {string|object|null} [detail=null] - Specific technical detail or parameter error
   */
  constructor(statusCode, code, message, detail = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.message = message;
    this.detail =
      detail !== null && typeof detail === 'object'
        ? Array.isArray(detail)
          ? detail.map((d) => (typeof d === 'object' && d.message ? d.message : JSON.stringify(d))).join('; ')
          : JSON.stringify(detail)
        : detail !== null
        ? String(detail)
        : null;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }

  /** 400 Bad Request */
  static badRequest(message = 'Bad Request', detail = null, code = 'BAD_REQUEST') {
    return new ApiError(400, code, message, detail);
  }

  /** 401 Unauthorized */
  static unauthorized(message = 'Authentication required.', detail = null, code = 'UNAUTHORIZED') {
    return new ApiError(401, code, message, detail);
  }

  /** 403 Forbidden */
  static forbidden(message = 'Access forbidden.', detail = null, code = 'FORBIDDEN') {
    return new ApiError(403, code, message, detail);
  }

  /** 404 Not Found */
  static notFound(message = 'Resource not found.', detail = null, code = 'NOT_FOUND') {
    return new ApiError(404, code, message, detail);
  }

  /** 406 Not Acceptable */
  static notAcceptable(message = 'Requested media type is not supported.', detail = null, code = 'NOT_ACCEPTABLE') {
    return new ApiError(406, code, message, detail);
  }

  /** 409 Conflict / Duplicate Key */
  static conflict(message = 'Resource conflict or duplicate key violation.', detail = null, code = 'DUPLICATE_KEY_ERROR') {
    return new ApiError(409, code, message, detail);
  }

  /** 412 Precondition Failed */
  static preconditionFailed(message = 'Precondition evaluation failed.', detail = null, code = 'PRECONDITION_FAILED') {
    return new ApiError(412, code, message, detail);
  }

  /** 422 Validation Error / Unprocessable Entity */
  static validationError(message = 'Validation error occurred.', detail = null, code = 'VALIDATION_ERROR') {
    return new ApiError(422, code, message, detail);
  }

  /** 422 Foreign Key Constraint Violation */
  static foreignKeyViolation(message = 'Foreign key constraint violation.', detail = null, code = 'FOREIGN_KEY_VIOLATION') {
    return new ApiError(422, code, message, detail);
  }

  /** 429 Too Many Requests */
  static tooManyRequests(message = 'Rate limit quota exceeded.', detail = null, code = 'TOO_MANY_REQUESTS') {
    return new ApiError(429, code, message, detail);
  }

  /** 500 Internal Server Error */
  static internal(message = 'Internal server error occurred.', detail = null, code = 'INTERNAL_SERVER_ERROR') {
    return new ApiError(500, code, message, detail);
  }

  /** 503 Service Unavailable / Connection Timeout */
  static serviceUnavailable(message = 'Database service unavailable or timed out.', detail = null, code = 'DATABASE_CONNECTION_TIMEOUT') {
    return new ApiError(503, code, message, detail);
  }

  /** Formats standard JSON contract */
  toJSON() {
    return {
      code: this.code,
      message: this.message,
      detail: this.detail,
      timestamp: this.timestamp,
    };
  }
}

module.exports = ApiError;
