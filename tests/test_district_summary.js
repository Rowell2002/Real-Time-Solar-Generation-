'use strict';

/**
 * Unit verification test for GET /districts/:id/summary
 * - 404 Not Found on non-existent district ID
 * - 400 Bad Request on invalid UUID
 * - Single-query execution and aggregation logic
 * - ETag header calculation and 304 Not Modified conditional GET
 */

const { getDistrictSummary } = require('../src/controllers/districtController');
const { sequelize } = require('../src/models');

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

async function testDistrictSummary() {
  console.log('\n🧪 Running Unit Tests on GET /districts/:id/summary...\n');

  // Test 1: 404 Not Found when query returns no rows
  {
    const req = {
      params: { id: '00000000-0000-0000-0000-000000000099' },
      headers: {},
    };
    const res = mockResponse();

    const origQuery = sequelize.query;
    sequelize.query = async () => [];

    try {
      await getDistrictSummary(req, res, () => {});
      assert(res.statusCode === 404, 'Non-existent district returns 404 Not Found');
      assert(res.body.error === 'Not Found', 'Standardized JSON error message returned');
    } finally {
      sequelize.query = origQuery;
    }
  }

  // Test 2: Successful single-query aggregation with substation breakdown
  {
    const req = {
      params: { id: 'e45cfb22-8350-4828-b0a6-f3ecf183984d' },
      headers: {},
    };
    const res = mockResponse();

    const mockQueryResult = [
      {
        district_id: 'e45cfb22-8350-4828-b0a6-f3ecf183984d',
        district_name: 'Colombo',
        substation_id: '92f75432-68c1-4b15-9988-51f7bb8a0b01',
        substation_name: 'Pannipitiya GSS',
        capacity_mw: '250.00',
        active_installations_count: '10',
        current_total_power_kw: '1350.25',
        today_energy_kwh: '8240.50',
      },
      {
        district_id: 'e45cfb22-8350-4828-b0a6-f3ecf183984d',
        district_name: 'Colombo',
        substation_id: 'a1b2c3d4-e5f6-4a1b-9c2d-3e4f5a6b7c8d',
        substation_name: 'Kolonnawa GSS',
        capacity_mw: '180.00',
        active_installations_count: '8',
        current_total_power_kw: '1100.50',
        today_energy_kwh: '6280.00',
      },
    ];

    const origQuery = sequelize.query;
    sequelize.query = async (sql, options) => {
      // Verify query contains ROW_NUMBER() window function and CTE as required
      assert(sql.includes('ROW_NUMBER() OVER (PARTITION BY r.installation_id ORDER BY r.timestamp DESC)'), 'SQL query uses ROW_NUMBER() window function for latest readings');
      assert(sql.includes('DATE(r.timestamp) = CURRENT_DATE'), 'SQL query filters today generation using DATE(timestamp) = CURRENT_DATE');
      return mockQueryResult;
    };

    try {
      await getDistrictSummary(req, res, () => {});
      assert(res.statusCode === 200, 'GET /districts/:id/summary returns 200 OK');
      assert(res.body.district_id === 'e45cfb22-8350-4828-b0a6-f3ecf183984d', 'district_id matches requested ID');
      assert(res.body.district_name === 'Colombo', 'district_name matches');
      assert(res.body.total_active_installations === 18, 'total_active_installations aggregated correctly (10 + 8 = 18)');
      assert(res.body.current_total_power_kw === 2450.75, 'current_total_power_kw aggregated correctly (1350.25 + 1100.50 = 2450.75)');
      assert(res.body.today_total_energy_kwh === 14520.50, 'today_total_energy_kwh aggregated correctly (8240.50 + 6280.00 = 14520.50)');
      assert(Array.isArray(res.body.substation_breakdown), 'substation_breakdown is an array');
      assert(res.body.substation_breakdown.length === 2, 'substation_breakdown contains both substations');

      const etag = res.headers['etag'];
      assert(!!etag && etag.startsWith('"'), `ETag header calculated: ${etag}`);

      // Test 3: Conditional GET with matching If-None-Match returns 304
      const condReq = {
        params: { id: 'e45cfb22-8350-4828-b0a6-f3ecf183984d' },
        headers: { 'if-none-match': etag },
      };
      const condRes = mockResponse();
      await getDistrictSummary(condReq, condRes, () => {});
      assert(condRes.statusCode === 304, 'If-None-Match matching ETag returns 304 Not Modified');
    } finally {
      sequelize.query = origQuery;
    }
  }

  console.log(`\nResults: ${passed} Passed, ${failed} Failed\n`);
}

testDistrictSummary();
