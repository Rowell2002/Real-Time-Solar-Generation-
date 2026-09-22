'use strict';

/**
 * Verification test script for SLSEA REST API routes
 * Tests:
 * 1. GET /provinces
 * 2. GET /provinces/:id/districts
 * 3. GET /districts/:id/substations
 * 4. GET /substations/:id/installations
 * 5. GET /installations/:id/composite
 * 6. GET /installations/:id/last-reading
 * 7. POST /installations/:id/readings (validates 201 Created & Location header)
 * 8. GET /installations/:id/readings/:readingId (resolves Location header)
 * 9. Error handling: invalid UUID (400), not found (404), invalid payload (400)
 */

const http = require('http');
const app = require('../src/app');

async function runTests() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  console.log(`\n🧪 Testing SLSEA REST API at ${baseUrl}`);
  let passed = 0;
  let failed = 0;

  async function request(method, path, body = null) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : null,
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, headers: res.headers, data };
  }

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`  ✔ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName} - ${details}`);
      failed++;
    }
  }

  try {
    // 0. Health check
    const health = await request('GET', '/health');
    assert(health.status === 200 && health.data.status === 'healthy', 'GET /health returns 200 OK');

    // 1. GET /provinces
    const provincesRes = await request('GET', '/provinces');
    assert(provincesRes.status === 200, 'GET /provinces returns 200');
    assert(Array.isArray(provincesRes.data?.data), 'GET /provinces returns data array');

    const provinceList = provincesRes.data?.data || [];
    if (provinceList.length === 0) {
      console.log('  ⚠️ Database empty. Seed data might not be loaded yet.');
      server.close();
      return;
    }

    const firstProvince = provinceList[0];
    assert(!!firstProvince.id && !!firstProvince.code, 'Province has id and code attributes');

    // 2. GET /provinces/:id/districts
    const districtsRes = await request('GET', `/provinces/${firstProvince.id}/districts`);
    assert(districtsRes.status === 200, 'GET /provinces/:id/districts returns 200');
    assert(Array.isArray(districtsRes.data?.data), 'Returns districts list for province');

    const districtList = districtsRes.data?.data || [];
    if (districtList.length > 0) {
      const firstDistrict = districtList[0];

      // 3. GET /districts/:id/substations
      const substationsRes = await request('GET', `/districts/${firstDistrict.id}/substations`);
      assert(substationsRes.status === 200, 'GET /districts/:id/substations returns 200');

      const substationList = substationsRes.data?.data || [];
      if (substationList.length > 0) {
        const firstSubstation = substationList[0];

        // 4. GET /substations/:id/installations
        const installationsRes = await request('GET', `/substations/${firstSubstation.id}/installations`);
        assert(installationsRes.status === 200, 'GET /substations/:id/installations returns 200');

        const installationList = installationsRes.data?.data || [];
        if (installationList.length > 0) {
          const firstInstallation = installationList[0];

          // 5. GET /installations/:id/composite
          const compositeRes = await request('GET', `/installations/${firstInstallation.id}/composite`);
          assert(compositeRes.status === 200, 'GET /installations/:id/composite returns 200');
          assert(!!compositeRes.data?.installation?.summary_stats, 'Composite response contains summary_stats');
          assert(!!compositeRes.data?.installation?.grid_substation, 'Composite response contains parent grid_substation');

          // 6. GET /installations/:id/last-reading
          const lastReadingRes = await request('GET', `/installations/${firstInstallation.id}/last-reading`);
          assert(
            lastReadingRes.status === 200 || lastReadingRes.status === 404,
            'GET /installations/:id/last-reading returns 200 or 404 derived resource response'
          );
          if (lastReadingRes.status === 200) {
            assert(!!lastReadingRes.data?.last_reading, 'Response includes last_reading payload');
          }

          // 7. POST /installations/:id/readings (Ingestion Write Path)
          const newReadingPayload = {
            timestamp: new Date().toISOString(),
            power_kw: 145.25,
            energy_kwh: 1250.75,
            voltage_v: 231.4,
          };
          const ingestRes = await request('POST', `/installations/${firstInstallation.id}/readings`, newReadingPayload);
          assert(ingestRes.status === 201, 'POST /installations/:id/readings returns 201 Created');
          
          const locationHeader = ingestRes.headers.get('location');
          assert(!!locationHeader, `Response has Location header: ${locationHeader}`);

          // 8. GET Location header resolution
          if (locationHeader) {
            const resolveRes = await request('GET', locationHeader);
            assert(resolveRes.status === 200, 'GET on Location header URI resolves to created reading');
            assert(resolveRes.data?.data?.power_kw === 145.25, 'Resolved reading matches ingested power_kw');
          }

          // 9. Negative & Error validation tests
          const badPayloadRes = await request('POST', `/installations/${firstInstallation.id}/readings`, {
            power_kw: -10, // Invalid negative
            energy_kwh: 'abc', // Not a number
          });
          assert(badPayloadRes.status === 400, 'Invalid payload returns 400 Bad Request');
        }
      }
    }

    // 10. UUID validation error tests
    const badUuidRes = await request('GET', '/provinces/not-a-uuid/districts');
    assert(badUuidRes.status === 400, 'Invalid UUID parameter returns 400 Bad Request');

    const notFoundUuidRes = await request('GET', '/provinces/00000000-0000-0000-0000-000000000000/districts');
    assert(notFoundUuidRes.status === 404, 'Non-existent UUID returns 404 Not Found');

    console.log(`\nResults: ${passed} Passed, ${failed} Failed\n`);
  } catch (err) {
    console.error('Test execution error:', err);
  } finally {
    server.close();
  }
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
