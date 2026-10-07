'use strict';

/**
 * Verification test suite for advanced enterprise API extensions:
 * 1. Authentication API:
 *    - POST /auth/login (National, Provincial, District logins & 401 invalid)
 *    - POST /auth/device-token (Scoped device write token issuance & 404)
 *    - GET /auth/me (Identity introspection)
 * 2. High-Throughput Batch Telemetry Ingestion:
 *    - POST /installations/:id/readings/batch (Bulk inserts, deduplication, 201 Created)
 *    - Cross-device write security enforcement (403 Forbidden)
 *    - Validation of payload items (422 Validation Error)
 * 3. National Operational Solar Generation Dashboard:
 *    - GET /national/summary (CTE/window single-query aggregation across 9 provinces)
 *    - ETag generation & 304 Not Modified conditional caching
 *    - Strict jurisdictional isolation: Provincial/District analysts rejected with 403 Forbidden
 * 4. Deep Database Readiness Probe:
 *    - GET /health/ready (Database ping, roundtrip latency measurement)
 * 5. Sliding-Window Rate Limiting:
 *    - 429 Too Many Requests with RFC 6585 headers (X-RateLimit-Limit, Retry-After)
 */

const http = require('http');
const app = require('../src/app');
const { SolarInstallation, sequelize } = require('../src/models');
const { createRateLimiter } = require('../src/middleware/rateLimiter');
const { generateUserToken, generateDeviceToken } = require('../src/utils/jwtUtils');

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

async function runAdvancedTests() {
  console.log('\n🚀 Testing Advanced Enterprise Features & API Endpoints...\n');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  async function request(method, path, body = null, headers = {}) {
    const defaultHeaders = body ? { 'Content-Type': 'application/json' } : {};
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { ...defaultHeaders, ...headers },
      body: body ? JSON.stringify(body) : null,
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, headers: res.headers, data };
  }

  try {
    // ==========================================================================
    // 1. System Readiness & Liveness Probes
    // ==========================================================================
    console.log('  -- 1. System Readiness & Health Checks --');
    {
      const liveRes = await request('GET', '/health');
      assert(liveRes.status === 200, 'GET /health returns 200 OK');
      assert(liveRes.data?.status === 'healthy', "Liveness probe reports status 'healthy'");

      const origAuth = sequelize.authenticate;
      sequelize.authenticate = async () => true;
      try {
        const readyRes = await request('GET', '/health/ready');
        assert(readyRes.status === 200, 'GET /health/ready returns 200 OK');
        assert(readyRes.data?.status === 'ready', "Readiness probe reports status 'ready'");
        assert(readyRes.data?.database === 'connected', "Database ping reports 'connected'");
        assert(typeof readyRes.data?.latency_ms === 'number', 'Latency measurement included in milliseconds');
      } finally {
        sequelize.authenticate = origAuth;
      }
    }

    // ==========================================================================
    // 2. Authentication & Token Issuance Endpoints
    // ==========================================================================
    console.log('\n  -- 2. Authentication & Token Management Endpoints --');
    let nationalToken = '';
    let provincialToken = '';
    let districtToken = '';

    {
      // 2a. National Admin Login
      const natRes = await request('POST', '/auth/login', {
        email: 'national.admin@slsea.gov.lk',
        password: 'Password123!',
      });
      assert(natRes.status === 200, 'POST /auth/login returns 200 OK for national admin');
      assert(!!natRes.data?.token, 'JWT Bearer token returned in response');
      assert(natRes.data?.user?.role === 'national', "User role is 'national'");
      assert(natRes.data?.user?.scopes?.includes('read:national'), "User scopes include 'read:national'");
      nationalToken = natRes.data.token;

      // 2b. Provincial Analyst Login
      const provRes = await request('POST', '/auth/login', {
        email: 'western.provincial@slsea.gov.lk',
        password: 'Password123!',
      });
      assert(provRes.status === 200, 'POST /auth/login returns 200 OK for provincial user');
      assert(provRes.data?.user?.role === 'provincial', "User role is 'provincial'");
      assert(provRes.data?.user?.scopes?.[0]?.startsWith('read:province:'), 'Scope correctly prefixed with read:province');
      provincialToken = provRes.data.token;

      // 2c. District Analyst Login
      const distRes = await request('POST', '/auth/login', {
        email: 'colombo.district@slsea.gov.lk',
        password: 'Password123!',
      });
      assert(distRes.status === 200, 'POST /auth/login returns 200 OK for district user');
      assert(distRes.data?.user?.role === 'district', "User role is 'district'");
      assert(distRes.data?.user?.scopes?.[0]?.startsWith('read:district:'), 'Scope correctly prefixed with read:district');
      districtToken = distRes.data.token;

      // 2d. Invalid Login Credentials -> 401 Unauthorized
      const badLogin = await request('POST', '/auth/login', {
        email: 'unknown.user@slsea.gov.lk',
        password: 'wrongpassword',
      });
      assert(badLogin.status === 401, 'Invalid credentials return 401 Unauthorized');
      assert(badLogin.data?.code === 'UNAUTHORIZED', 'Standardized code UNAUTHORIZED returned');

      // 2e. Token Introspection: GET /auth/me
      const meRes = await request('GET', '/auth/me', null, {
        Authorization: `Bearer ${nationalToken}`,
      });
      assert(meRes.status === 200, 'GET /auth/me returns 200 OK');
      assert(meRes.data?.principal?.role === 'national', 'Decoded principal role matches national');

      // 2f. Device Token Issuance: POST /auth/device-token
      const testInstId = '11111111-1111-4111-a111-111111111111';

      // Mock SolarInstallation lookup for test reliability
      const origFindByPk = SolarInstallation.findByPk;
      SolarInstallation.findByPk = async (id) => ({
        id,
        name: 'Test Installation Array',
        meter_id: 'MTR-TEST-001',
      });

      try {
        const deviceRes = await request('POST', '/auth/device-token', {
          installation_id: testInstId,
        });
        assert(deviceRes.status === 200, 'POST /auth/device-token returns 200 OK');
        assert(!!deviceRes.data?.token, 'Device JWT token generated');
        assert(deviceRes.data?.device?.scope === `installation:write:${testInstId}`, 'Device scope matches installation:write:{id}');
      } finally {
        SolarInstallation.findByPk = origFindByPk;
      }
    }

    // ==========================================================================
    // 3. High-Throughput Batch Telemetry Ingestion Endpoint
    // ==========================================================================
    console.log('\n  -- 3. Batch Telemetry Ingestion (POST /installations/:id/readings/batch) --');
    {
      const targetInstId = '11111111-1111-4111-a111-111111111111';
      const deviceToken = generateDeviceToken(targetInstId);

      // Mock SolarInstallation.findByPk
      const origFindByPk = SolarInstallation.findByPk;
      SolarInstallation.findByPk = async (id) => {
        if (id === targetInstId) {
          return { id, name: 'Pannipitiya Test Array', meter_id: 'MTR-BATCH-001' };
        }
        return null;
      };

      try {
        // 3a. Batch upload 5 valid readings
        const batchPayload = {
          readings: [
            { timestamp: '2026-10-02T06:00:00.000Z', power_kw: 15.2, energy_kwh: 100.5, voltage_v: 228.4 },
            { timestamp: '2026-10-02T06:15:00.000Z', power_kw: 32.8, energy_kwh: 108.7, voltage_v: 229.1 },
            { timestamp: '2026-10-02T06:30:00.000Z', power_kw: 68.4, energy_kwh: 125.8, voltage_v: 230.0 },
            { timestamp: '2026-10-02T06:45:00.000Z', power_kw: 105.1, energy_kwh: 152.0, voltage_v: 230.5 },
            { timestamp: '2026-10-02T07:00:00.000Z', power_kw: 142.6, energy_kwh: 187.6, voltage_v: 231.2 },
          ],
        };

        const batchRes = await request('POST', `/installations/${targetInstId}/readings/batch`, batchPayload, {
          Authorization: `Bearer ${deviceToken}`,
        });
        assert(batchRes.status === 201, 'POST /installations/:id/readings/batch returns 201 Created');
        assert(batchRes.data?.data?.total_received === 5, 'Response confirms 5 readings received');
        assert(typeof batchRes.data?.data?.inserted_count === 'number', 'Response contains inserted_count');
        assert(!!batchRes.data?._links?.self, 'Response contains HATEOAS self link');

        // 3b. Empty batch payload -> 400 Bad Request
        const emptyBatch = await request('POST', `/installations/${targetInstId}/readings/batch`, { readings: [] }, {
          Authorization: `Bearer ${deviceToken}`,
        });
        assert(emptyBatch.status === 400, 'Empty batch returns 400 Bad Request');
        assert(emptyBatch.data?.code === 'BAD_REQUEST', 'Standard code BAD_REQUEST returned');

        // 3c. Invalid reading item format -> 422 Validation Error
        const invalidItemBatch = await request(
          'POST',
          `/installations/${targetInstId}/readings/batch`,
          {
            readings: [
              { timestamp: 'not-a-date', power_kw: -10, energy_kwh: 50, voltage_v: 230 },
            ],
          },
          {
            Authorization: `Bearer ${deviceToken}`,
          }
        );
        assert(invalidItemBatch.status === 422, 'Invalid reading attributes return 422 Validation Error');
        assert(invalidItemBatch.data?.code === 'VALIDATION_ERROR', 'Standard code VALIDATION_ERROR returned');

        // 3d. Device write authorization mismatch -> 403 Forbidden
        const otherInstToken = generateDeviceToken('22222222-2222-4222-a222-222222222222');
        const crossPostRes = await request('POST', `/installations/${targetInstId}/readings/batch`, batchPayload, {
          Authorization: `Bearer ${otherInstToken}`,
        });
        assert(crossPostRes.status === 403, 'Cross-installation batch upload rejected with 403 Forbidden');
        assert(crossPostRes.data?.code === 'FORBIDDEN', 'Standard code FORBIDDEN returned');
      } finally {
        SolarInstallation.findByPk = origFindByPk;
      }
    }

    // ==========================================================================
    // 4. National Operational Solar Generation Summary Endpoint
    // ==========================================================================
    console.log('\n  -- 4. National Operational Summary (GET /national/summary) --');
    {
      // Mock sequelize.query for deterministic national aggregation testing
      const origQuery = sequelize.query;
      sequelize.query = async (sql) => {
        if (typeof sql === 'string' && sql.includes('province_stats')) {
          return [
            {
              province_id: '018f4a12-7b32-7c80-87a1-000000000001',
              province_name: 'Western',
              province_code: 'WP',
              active_installations_count: 50,
              current_total_power_kw: 12500.5,
              today_energy_kwh: 54200.0,
            },
            {
              province_id: '018f4a12-7b32-7c80-87a1-000000000002',
              province_name: 'Southern',
              province_code: 'SP',
              active_installations_count: 35,
              current_total_power_kw: 8900.25,
              today_energy_kwh: 38100.5,
            },
          ];
        }
        return [];
      };

      try {
        // 4a. National user access -> 200 OK
        const natSummaryRes = await request('GET', '/national/summary', null, {
          Authorization: `Bearer ${nationalToken}`,
        });
        assert(natSummaryRes.status === 200, 'GET /national/summary returns 200 OK for national analyst');
        assert(natSummaryRes.data?.country === 'Sri Lanka', "Response country is 'Sri Lanka'");
        assert(natSummaryRes.data?.total_active_installations === 85, 'Total installations rolled up correctly (50 + 35 = 85)');
        assert(natSummaryRes.data?.current_total_power_kw === 21400.75, 'Instantaneous power aggregated correctly');
        assert(natSummaryRes.data?.current_total_power_mw === 21.401, 'MW calculation accurate');
        assert(Array.isArray(natSummaryRes.data?.provinces_breakdown), 'provinces_breakdown is an array');

        // Check ETag header
        const etag = natSummaryRes.headers.get('etag');
        assert(!!etag, `ETag header calculated on national summary: ${etag}`);

        // 4b. Conditional GET with matching ETag -> 304 Not Modified
        if (etag) {
          const res304 = await fetch(`${baseUrl}/national/summary`, {
            headers: {
              Authorization: `Bearer ${nationalToken}`,
              'If-None-Match': etag,
            },
          });
          assert(res304.status === 304, 'If-None-Match matching ETag returns 304 Not Modified');
        }

        // 4c. Provincial user blocked -> 403 Forbidden
        const provBlocked = await request('GET', '/national/summary', null, {
          Authorization: `Bearer ${provincialToken}`,
        });
        assert(provBlocked.status === 403, 'Provincial user blocked from national summary (403 Forbidden)');
        assert(provBlocked.data?.code === 'FORBIDDEN', 'Standard code FORBIDDEN returned');

        // 4d. District user blocked -> 403 Forbidden
        const distBlocked = await request('GET', '/national/summary', null, {
          Authorization: `Bearer ${districtToken}`,
        });
        assert(distBlocked.status === 403, 'District user blocked from national summary (403 Forbidden)');
        assert(distBlocked.data?.code === 'FORBIDDEN', 'Standard code FORBIDDEN returned');
      } finally {
        sequelize.query = origQuery;
      }
    }

    // ==========================================================================
    // 5. Sliding-Window Rate Limiting Middleware
    // ==========================================================================
    console.log('\n  -- 5. Sliding Window Rate Limiting (RFC 6585) --');
    {
      const testLimiter = createRateLimiter({ windowMs: 10000, max: 3, keyGenerator: () => 'test-client-ip' });

      const reqMock = { auth: {}, ip: '127.0.0.1', headers: {}, socket: {} };
      let lastRes = null;

      for (let i = 0; i < 4; i++) {
        const mockRes = {
          statusCode: 200,
          headers: {},
          body: null,
          setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
          status(code) { this.statusCode = code; return this; },
          json(b) { this.body = b; return this; },
        };

        let nextCalled = false;
        testLimiter(reqMock, mockRes, () => { nextCalled = true; });

        if (i < 3) {
          assert(nextCalled, `Request #${i + 1} within quota succeeds`);
        } else {
          lastRes = mockRes;
          assert(!nextCalled, 'Request #4 exceeding limit is blocked');
          assert(mockRes.statusCode === 429, 'Rate limiter returns HTTP 429 Too Many Requests');
          assert(mockRes.body?.code === 'TOO_MANY_REQUESTS', "Error code is 'TOO_MANY_REQUESTS'");
          assert(!!mockRes.headers['retry-after'], 'RFC 6585 Retry-After header present');
          assert(mockRes.headers['x-ratelimit-remaining'] === 0, 'X-RateLimit-Remaining is 0');
        }
      }
    }

  } finally {
    server.close();
  }

  console.log(`\nResults: ${passed} Passed, ${failed} Failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runAdvancedTests().catch((err) => {
    console.error('Test execution error:', err);
    process.exit(1);
  });
}

module.exports = { runAdvancedTests };
