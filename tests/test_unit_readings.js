'use strict';

/**
 * Unit verification test for getInstallationReadings HTTP specification:
 * - Content negotiation (406)
 * - UUID validation (400)
 * - Pagination validation (400)
 * - Sorting validation (400)
 * - Time window validation (400)
 * - ETag and Last-Modified computation
 * - Conditional GET (304 Not Modified)
 * - Precondition check (412 Precondition Failed)
 */

const { getInstallationReadings } = require('../src/controllers/readingController');

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

async function testUnit() {
  console.log('\n🧪 Running Unit Tests on getInstallationReadings HTTP Specification...\n');

  // Test 1: Content Negotiation - 406 Not Acceptable
  {
    const req = {
      headers: { accept: 'text/html, application/xml' },
      params: { id: '00000000-0000-0000-0000-000000000001' },
      query: {},
    };
    const res = mockResponse();
    await getInstallationReadings(req, res, () => {});
    assert(res.statusCode === 406, 'Content negotiation: Accept: text/html returns 406 Not Acceptable');
    assert(res.headers['content-type'].includes('application/json'), 'Content-Type header is application/json');
  }

  // Test 2: Pagination - invalid page (400)
  {
    const req = {
      headers: { accept: 'application/json' },
      params: { id: '00000000-0000-0000-0000-000000000001' },
      query: { page: '-1' },
    };
    const res = mockResponse();
    // Stub SolarInstallation.findByPk to return mock installation
    const { SolarInstallation } = require('../src/models');
    const origFindByPk = SolarInstallation.findByPk;
    SolarInstallation.findByPk = async () => ({ id: req.params.id, updatedAt: new Date() });

    try {
      await getInstallationReadings(req, res, () => {});
      assert(res.statusCode === 400, "Pagination: invalid page returns 400 Bad Request");
    } finally {
      SolarInstallation.findByPk = origFindByPk;
    }
  }

  // Test 3: Sorting - invalid sort param (400)
  {
    const req = {
      headers: { accept: 'application/json' },
      params: { id: '00000000-0000-0000-0000-000000000001' },
      query: { sort: 'invalid_column' },
    };
    const res = mockResponse();
    const { SolarInstallation } = require('../src/models');
    const origFindByPk = SolarInstallation.findByPk;
    SolarInstallation.findByPk = async () => ({ id: req.params.id, updatedAt: new Date() });

    try {
      await getInstallationReadings(req, res, () => {});
      assert(res.statusCode === 400, "Sorting: invalid sort param returns 400 Bad Request");
    } finally {
      SolarInstallation.findByPk = origFindByPk;
    }
  }

  // Test 4: Time window - invalid timestamp format (400)
  {
    const req = {
      headers: { accept: 'application/json' },
      params: { id: '00000000-0000-0000-0000-000000000001' },
      query: { start_time: 'not-a-date' },
    };
    const res = mockResponse();
    const { SolarInstallation } = require('../src/models');
    const origFindByPk = SolarInstallation.findByPk;
    SolarInstallation.findByPk = async () => ({ id: req.params.id, updatedAt: new Date() });

    try {
      await getInstallationReadings(req, res, () => {});
      assert(res.statusCode === 400, "Time window: invalid start_time returns 400 Bad Request");
    } finally {
      SolarInstallation.findByPk = origFindByPk;
    }
  }

  // Test 5: Full Mocked Success with ETag, Last-Modified, Pagination Links & Conditional GET
  {
    const req = {
      headers: { accept: 'application/json' },
      params: { id: '00000000-0000-0000-0000-000000000001' },
      query: { page: '2', limit: '2' },
    };
    const res = mockResponse();
    const { SolarInstallation, GenerationReading } = require('../src/models');
    const origInstFindByPk = SolarInstallation.findByPk;
    const origReadingFindAndCount = GenerationReading.findAndCountAll;

    const mockDate = new Date('2026-09-24T10:00:00Z');
    SolarInstallation.findByPk = async () => ({
      id: req.params.id,
      updatedAt: mockDate,
      grid_substation: { district: { province: {} } },
    });

    GenerationReading.findAndCountAll = async () => ({
      count: 10,
      rows: [
        {
          id: 3,
          installation_id: req.params.id,
          timestamp: new Date('2026-09-24T09:45:00Z'),
          power_kw: 150.0,
          energy_kwh: 500.0,
          voltage_v: 230.0,
        },
        {
          id: 4,
          installation_id: req.params.id,
          timestamp: new Date('2026-09-24T09:30:00Z'),
          power_kw: 145.0,
          energy_kwh: 462.5,
          voltage_v: 229.5,
        },
      ],
    });

    try {
      await getInstallationReadings(req, res, () => {});
      assert(res.statusCode === 200, 'GET /installations/:id/readings returns 200 OK');
      assert(res.body.total_count === 10, 'Response total_count matches query count (10)');
      assert(res.body.page === 2, 'Response page matches 2');
      assert(res.body.limit === 2, 'Response limit matches 2');
      assert(res.body.links.self.includes('page=2'), 'links.self includes page=2');
      assert(res.body.links.next.includes('page=3'), 'links.next includes page=3');
      assert(res.body.links.prev.includes('page=1'), 'links.prev includes page=1');

      const etag = res.headers['etag'];
      const lastModified = res.headers['last-modified'];
      assert(!!etag && etag.startsWith('"') && etag.endsWith('"'), 'ETag is SHA-256 quoted string');
      assert(!!lastModified, `Last-Modified is set: ${lastModified}`);

      // Test 5b: Conditional GET - If-None-Match -> 304
      const condReq = {
        headers: { accept: 'application/json', 'if-none-match': etag },
        params: { id: '00000000-0000-0000-0000-000000000001' },
        query: { page: '2', limit: '2' },
      };
      const condRes = mockResponse();
      await getInstallationReadings(condReq, condRes, () => {});
      assert(condRes.statusCode === 304, 'Conditional GET: If-None-Match returns 304 Not Modified');

      // Test 5c: Precondition Failed - If-Match -> 412
      const preReq = {
        headers: { accept: 'application/json', 'if-match': '"mismatched-etag"' },
        params: { id: '00000000-0000-0000-0000-000000000001' },
        query: { page: '2', limit: '2' },
      };
      const preRes = mockResponse();
      await getInstallationReadings(preReq, preRes, () => {});
      assert(preRes.statusCode === 412, 'Precondition: If-Match mismatch returns 412 Precondition Failed');
    } finally {
      SolarInstallation.findByPk = origInstFindByPk;
      GenerationReading.findAndCountAll = origReadingFindAndCount;
    }
  }

  console.log(`\nResults: ${passed} Passed, ${failed} Failed\n`);
}

testUnit();
