'use strict';

/**
 * Verification test suite for:
 * 1. Global exception handler & standardized JSON error contract:
 *    { code, message, detail, timestamp }
 *    - 400 Bad Request
 *    - 401 Unauthorized
 *    - 403 Forbidden
 *    - 404 Not Found
 *    - 406 Not Acceptable
 *    - 412 Precondition Failed
 *    - 422 Validation Error
 *    - MySQL Database Exceptions:
 *      * Foreign key constraint failure (1451/1452) -> 422 FOREIGN_KEY_VIOLATION
 *      * Duplicate key constraint failure (1062) -> 409 DUPLICATE_KEY_ERROR
 *      * Database connection timeout (ETIMEDOUT) -> 503 DATABASE_CONNECTION_TIMEOUT
 * 2. Live OpenAPI / Swagger UI documentation mounted at /docs:
 *    - Mounted at /docs (returns 200 HTML)
 *    - Raw JSON served at /docs/openapi.json and /api-docs.json
 *    - Title: 'SLSEA Solar Generation Monitoring API'
 *    - BearerAuth security scheme defined in components.securitySchemes
 *    - 2xx success schemas and 4xx error schemas defined
 */

const http = require('http');
const app = require('../src/app');
const errorHandler = require('../src/middleware/errorHandler');
const ApiError = require('../src/utils/apiError');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✔ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

function mockResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(key, val) {
      this.headers[key.toLowerCase()] = val;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    end() {
      return this;
    },
  };
  return res;
}

function validateStandardErrorContract(body, expectedCode) {
  if (!body || typeof body !== 'object') return false;
  const hasCode = typeof body.code === 'string' && (expectedCode ? body.code === expectedCode : true);
  const hasMessage = typeof body.message === 'string' && body.message.length > 0;
  const hasDetail = body.detail === null || typeof body.detail === 'string';
  const hasTimestamp = typeof body.timestamp === 'string' && !isNaN(Date.parse(body.timestamp));
  return hasCode && hasMessage && hasDetail && hasTimestamp;
}

async function runTests() {
  console.log('\n🛡️  Testing Global Exception Handler & Standardized JSON Error Contract...\n');

  // ============================================================================
  // Test 1: HTTP Status Code Mappings via errorHandler
  // ============================================================================
  console.log('  -- 1. HTTP Status Codes & Error Contract Validation --');

  // 1a. 400 Bad Request
  {
    const req = { method: 'POST', originalUrl: '/test-bad-request' };
    const res = mockResponse();
    const err = ApiError.badRequest('Invalid payload', 'Field capacity_kw cannot be negative');
    errorHandler(err, req, res, () => {});
    assert(res.statusCode === 400, '400 Bad Request status code set');
    assert(validateStandardErrorContract(res.body, 'BAD_REQUEST'), '400 response matches standard contract');
    assert(res.body.detail === 'Field capacity_kw cannot be negative', '400 response detail preserved');
  }

  // 1b. 401 Unauthorized
  {
    const req = { method: 'GET', originalUrl: '/test-unauthorized' };
    const res = mockResponse();
    const err = ApiError.unauthorized('Missing JWT Bearer token', 'Authorization header is required');
    errorHandler(err, req, res, () => {});
    assert(res.statusCode === 401, '401 Unauthorized status code set');
    assert(validateStandardErrorContract(res.body, 'UNAUTHORIZED'), '401 response matches standard contract');
  }

  // 1c. 403 Forbidden
  {
    const req = { method: 'POST', originalUrl: '/test-forbidden' };
    const res = mockResponse();
    const err = ApiError.forbidden('Access denied', 'Device scope mismatch for target installation');
    errorHandler(err, req, res, () => {});
    assert(res.statusCode === 403, '403 Forbidden status code set');
    assert(validateStandardErrorContract(res.body, 'FORBIDDEN'), '403 response matches standard contract');
  }

  // 1d. 404 Not Found
  {
    const req = { method: 'GET', originalUrl: '/test-not-found' };
    const res = mockResponse();
    const err = ApiError.notFound('Resource not found', 'Installation 123 does not exist');
    errorHandler(err, req, res, () => {});
    assert(res.statusCode === 404, '404 Not Found status code set');
    assert(validateStandardErrorContract(res.body, 'NOT_FOUND'), '404 response matches standard contract');
  }

  // 1e. 406 Not Acceptable
  {
    const req = { method: 'GET', originalUrl: '/test-not-acceptable' };
    const res = mockResponse();
    const err = ApiError.notAcceptable('Requested media type not supported', "Only 'application/json' supported");
    errorHandler(err, req, res, () => {});
    assert(res.statusCode === 406, '406 Not Acceptable status code set');
    assert(validateStandardErrorContract(res.body, 'NOT_ACCEPTABLE'), '406 response matches standard contract');
  }

  // 1f. 412 Precondition Failed
  {
    const req = { method: 'GET', originalUrl: '/test-precondition' };
    const res = mockResponse();
    const err = ApiError.preconditionFailed('If-Match evaluation failed', 'Supplied ETag does not match current resource state');
    errorHandler(err, req, res, () => {});
    assert(res.statusCode === 412, '412 Precondition Failed status code set');
    assert(validateStandardErrorContract(res.body, 'PRECONDITION_FAILED'), '412 response matches standard contract');
  }

  // 1g. 422 Validation Error
  {
    const req = { method: 'POST', originalUrl: '/test-validation' };
    const res = mockResponse();
    const err = ApiError.validationError('Entity validation failed', 'voltage_v must be between 180 and 260');
    errorHandler(err, req, res, () => {});
    assert(res.statusCode === 422, '422 Validation Error status code set');
    assert(validateStandardErrorContract(res.body, 'VALIDATION_ERROR'), '422 response matches standard contract');
  }

  // ============================================================================
  // Test 2: MySQL Database Exceptions Handling
  // ============================================================================
  console.log('\n  -- 2. MySQL Database Exception Mapping --');

  // 2a. Foreign Key Constraint Failure (MySQL errno 1451 / 1452)
  {
    const req = { method: 'POST', originalUrl: '/installations/123/readings' };
    const res = mockResponse();
    const fkError = new Error('Cannot add or update a child row: a foreign key constraint fails');
    fkError.name = 'SequelizeForeignKeyConstraintError';
    fkError.table = 'generation_readings';
    fkError.fields = ['installation_id'];
    fkError.original = { errno: 1452, code: 'ER_NO_REFERENCED_ROW_2' };

    errorHandler(fkError, req, res, () => {});
    assert(res.statusCode === 422, 'Foreign key failure maps to 422 Unprocessable/Validation Error');
    assert(res.body.code === 'FOREIGN_KEY_VIOLATION', 'Error code is FOREIGN_KEY_VIOLATION');
    assert(validateStandardErrorContract(res.body), 'Foreign key error matches standard contract');
    assert(res.body.detail.includes('generation_readings'), 'Detail references violated table');
  }

  // 2b. Duplicate Unique Key Failure (MySQL errno 1062)
  {
    const req = { method: 'POST', originalUrl: '/installations/123/readings' };
    const res = mockResponse();
    const dupError = new Error("Duplicate entry 'MTR-001' for key 'solar_installations.meter_id'");
    dupError.name = 'SequelizeUniqueConstraintError';
    dupError.errors = [{ path: 'meter_id', value: 'MTR-001' }];
    dupError.original = { errno: 1062, code: 'ER_DUP_ENTRY' };

    errorHandler(dupError, req, res, () => {});
    assert(res.statusCode === 409, 'Duplicate key failure maps to 409 Conflict');
    assert(res.body.code === 'DUPLICATE_KEY_ERROR', 'Error code is DUPLICATE_KEY_ERROR');
    assert(validateStandardErrorContract(res.body), 'Duplicate key error matches standard contract');
    assert(res.body.detail.includes('meter_id'), 'Detail references duplicate field');
  }

  // 2c. Database Connection Timeout (ETIMEDOUT / SequelizeConnectionTimedOutError)
  {
    const req = { method: 'GET', originalUrl: '/districts/123/summary' };
    const res = mockResponse();
    const timeoutError = new Error('Connection timed out while acquiring MySQL pool connection');
    timeoutError.name = 'SequelizeConnectionTimedOutError';
    timeoutError.original = { code: 'ETIMEDOUT' };

    errorHandler(timeoutError, req, res, () => {});
    assert(res.statusCode === 503, 'Database timeout maps to 503 Service Unavailable');
    assert(res.body.code === 'DATABASE_CONNECTION_TIMEOUT', 'Error code is DATABASE_CONNECTION_TIMEOUT');
    assert(validateStandardErrorContract(res.body), 'Connection timeout error matches standard contract');
  }

  // ============================================================================
  // Test 3: Live HTTP Server Tests (/docs & 404 Not Found)
  // ============================================================================
  console.log('\n  -- 3. Live Server & OpenAPI Swagger UI Documentation Checks --');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 3a. 404 Route handling produces standard error contract
    const res404 = await fetch(`${baseUrl}/undefined-endpoint`);
    const body404 = await res404.json();
    assert(res404.status === 404, 'Undefined route returns 404 Not Found');
    assert(validateStandardErrorContract(body404, 'NOT_FOUND'), '404 response matches standard contract');
    assert(body404.detail.includes('Cannot GET /undefined-endpoint'), '404 detail explains attempted path');

    // 3b. GET /docs returns HTML with Swagger UI
    const docsRes = await fetch(`${baseUrl}/docs/`);
    assert(docsRes.status === 200, 'GET /docs/ returns 200 OK');
    const docsHtml = await docsRes.text();
    assert(docsHtml.includes('swagger-ui'), 'GET /docs/ contains swagger-ui container');
    assert(docsHtml.includes('SLSEA Solar Generation Monitoring API Documentation'), 'Swagger UI page title is configured');

    // 3c. GET /docs/openapi.json returns valid OpenAPI 3.0 document
    const specRes = await fetch(`${baseUrl}/docs/openapi.json`);
    assert(specRes.status === 200, 'GET /docs/openapi.json returns 200 OK');
    const spec = await specRes.json();
    assert(spec.openapi === '3.0.3', "OpenAPI version is 3.0.3");
    assert(spec.info.title === 'SLSEA Solar Generation Monitoring API', "OpenAPI title matches 'SLSEA Solar Generation Monitoring API'");

    // 3d. Verify BearerAuth security scheme
    const bearerScheme = spec.components?.securitySchemes?.BearerAuth;
    assert(!!bearerScheme, 'components.securitySchemes.BearerAuth is defined');
    assert(bearerScheme.type === 'http' && bearerScheme.scheme === 'bearer', 'BearerAuth is http bearer scheme');
    assert(bearerScheme.bearerFormat === 'JWT', 'BearerAuth specifies JWT format');

    // 3e. Verify ErrorResponse schema in components
    const errorSchema = spec.components?.schemas?.ErrorResponse;
    assert(!!errorSchema, 'components.schemas.ErrorResponse is defined');
    assert(errorSchema.required.includes('code') && errorSchema.required.includes('message') && errorSchema.required.includes('detail') && errorSchema.required.includes('timestamp'), 'ErrorResponse defines code, message, detail, timestamp as required');

    // 3f. Verify Key Operation IDs and Tags
    const paths = Object.keys(spec.paths);
    assert(paths.includes('/health'), "Path /health is documented");
    assert(paths.includes('/provinces'), "Path /provinces is documented");
    assert(paths.includes('/provinces/{id}/districts'), "Path /provinces/{id}/districts is documented");
    assert(paths.includes('/districts/{id}/substations'), "Path /districts/{id}/substations is documented");
    assert(paths.includes('/substations/{id}/installations'), "Path /substations/{id}/installations is documented");
    assert(paths.includes('/installations/{id}/composite'), "Path /installations/{id}/composite is documented");
    assert(paths.includes('/installations/{id}/last-reading'), "Path /installations/{id}/last-reading is documented");
    assert(paths.includes('/installations/{id}/readings'), "Path /installations/{id}/readings is documented");
    assert(paths.includes('/installations/{id}/readings/{readingId}'), "Path /installations/{id}/readings/{readingId} is documented");
    assert(paths.includes('/districts/{id}/summary'), "Path /districts/{id}/summary is documented");

    // 3g. Verify 2xx and 4xx response schemas on endpoints
    const ingestPost = spec.paths['/installations/{id}/readings']?.post;
    assert(!!ingestPost?.responses?.['201'], 'POST /installations/{id}/readings defines 201 schema');
    assert(!!ingestPost?.responses?.['403'], 'POST /installations/{id}/readings defines 403 error schema');
    assert(!!ingestPost?.responses?.['422'], 'POST /installations/{id}/readings defines 422 error schema');

    const readingsGet = spec.paths['/installations/{id}/readings']?.get;
    assert(!!readingsGet?.responses?.['200'], 'GET /installations/{id}/readings defines 200 schema');
    assert(!!readingsGet?.responses?.['406'], 'GET /installations/{id}/readings defines 406 error schema');
    assert(!!readingsGet?.responses?.['412'], 'GET /installations/{id}/readings defines 412 error schema');

    const summaryGet = spec.paths['/districts/{id}/summary']?.get;
    assert(!!summaryGet?.responses?.['200'], 'GET /districts/{id}/summary defines 200 schema');
    assert(!!summaryGet?.responses?.['404'], 'GET /districts/{id}/summary defines 404 error schema');
  } finally {
    server.close();
  }

  console.log(`\nResults: ${passed} Passed, ${failed} Failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
