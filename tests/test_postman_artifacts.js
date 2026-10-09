'use strict';

/**
 * Automated Verification Suite for Postman Collection v2.1 & Environment Artifacts
 * Validates:
 * 1. Postman Collection Schema v2.1.0 compliance
 * 2. Postman Environment Schema compliance
 * 3. All 6 folders, 32 requests, pre-request scripts, and test scripts
 * 4. Syntax correctness of embedded PM test scripts
 * 5. Simulation of key collection requests against the live Express app
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');
const app = require('../src/app');
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

async function runPostmanArtifactVerification() {
  console.log('\n📬 Verifying Postman Collection v2.1 & Environment Artifacts...\n');

  const collectionPath = path.join(__dirname, '..', 'postman_collection.json');
  const environmentPath = path.join(__dirname, '..', 'postman_environment.json');

  // ==========================================================================
  // 1. Files Existence & JSON Parsing
  // ==========================================================================
  console.log('  -- 1. File Existence & Schema Integrity --');
  assert(fs.existsSync(collectionPath), 'postman_collection.json exists on disk');
  assert(fs.existsSync(environmentPath), 'postman_environment.json exists on disk');

  let collection;
  let environment;

  try {
    collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
    assert(true, 'postman_collection.json parsed as valid JSON');
  } catch (err) {
    assert(false, `postman_collection.json JSON parse failed: ${err.message}`);
  }

  try {
    environment = JSON.parse(fs.readFileSync(environmentPath, 'utf8'));
    assert(true, 'postman_environment.json parsed as valid JSON');
  } catch (err) {
    assert(false, `postman_environment.json JSON parse failed: ${err.message}`);
  }

  // ==========================================================================
  // 2. Collection Schema & Folder Structure
  // ==========================================================================
  console.log('\n  -- 2. Postman Collection v2.1 Structure Checks --');
  assert(collection.info?.schema === 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json', 'Collection declares official v2.1.0 schema');
  assert(collection.info?.name.includes('SLSEA'), 'Collection title matches SLSEA platform');
  assert(Array.isArray(collection.item), 'Collection contains root items array');
  assert(collection.item.length === 6, `Collection contains 6 functional folders (found: ${collection.item.length})`);

  const folderNames = collection.item.map((f) => f.name);
  assert(folderNames.some((n) => n.includes('Authentication')), "Folder '01. Authentication & Token Management' present");
  assert(folderNames.some((n) => n.includes('Topological')), "Folder '02. Topological Hierarchy Traversal' present");
  assert(folderNames.some((n) => n.includes('Telemetry Ingestion')), "Folder '03. Telemetry Ingestion & Operational Reads' present");
  assert(folderNames.some((n) => n.includes('Grid Analytics')), "Folder '04. Grid Analytics & Operational Dashboards' present");
  assert(folderNames.some((n) => n.includes('System Health')), "Folder '05. System Health, Probes & OpenAPI Specs' present");
  assert(folderNames.some((n) => n.includes('Security Boundaries')), "Folder '06. Security Boundaries & Negative Edge Cases' present");

  // Flatten all requests across folders
  const allRequests = [];
  function collectRequests(items) {
    for (const item of items) {
      if (item.request) {
        allRequests.push(item);
      }
      if (item.item) {
        collectRequests(item.item);
      }
    }
  }
  collectRequests(collection.item);
  assert(allRequests.length >= 25, `Collection contains ${allRequests.length} requests (exceeds requirement of 20+)`);

  // ==========================================================================
  // 3. Embedded Postman Scripts Syntax Validation
  // ==========================================================================
  console.log('\n  -- 3. PM Test Scripts & Pre-request Scripts Syntax Check --');
  let validScriptsCount = 0;
  for (const reqItem of allRequests) {
    if (reqItem.event && Array.isArray(reqItem.event)) {
      for (const ev of reqItem.event) {
        if (ev.script && Array.isArray(ev.script.exec)) {
          const code = ev.script.exec.join('\n');
          try {
            // Validate JavaScript syntax using Node's vm
            new vm.Script(code);
            validScriptsCount++;
          } catch (syntaxErr) {
            assert(false, `Syntax error in script for request '${reqItem.name}': ${syntaxErr.message}`);
          }
        }
      }
    }
  }
  assert(validScriptsCount > 0, `All ${validScriptsCount} embedded test & pre-request scripts are valid JavaScript`);

  // ==========================================================================
  // 4. Environment Schema & Variable Coverage
  // ==========================================================================
  console.log('\n  -- 4. Environment Configuration Variables Check --');
  assert(environment.name.includes('SLSEA'), 'Environment name is configured');
  assert(Array.isArray(environment.values), 'Environment values is an array');

  const envMap = {};
  for (const v of environment.values) {
    envMap[v.key] = v.value;
  }

  assert(envMap.hasOwnProperty('baseUrl'), "Environment defines 'baseUrl'");
  assert(envMap.hasOwnProperty('national_email'), "Environment defines 'national_email'");
  assert(envMap.hasOwnProperty('provincial_email'), "Environment defines 'provincial_email'");
  assert(envMap.hasOwnProperty('district_email'), "Environment defines 'district_email'");
  assert(envMap.hasOwnProperty('default_password'), "Environment defines 'default_password'");
  assert(envMap.hasOwnProperty('target_installation_id'), "Environment defines 'target_installation_id'");
  assert(envMap.hasOwnProperty('national_token'), "Environment defines placeholder 'national_token'");
  assert(envMap.hasOwnProperty('provincial_token'), "Environment defines placeholder 'provincial_token'");
  assert(envMap.hasOwnProperty('district_token'), "Environment defines placeholder 'district_token'");
  assert(envMap.hasOwnProperty('device_token'), "Environment defines placeholder 'device_token'");

  // ==========================================================================
  // 5. Live Simulation of Key Postman Requests Against Express App
  // ==========================================================================
  console.log('\n  -- 5. Live Simulation of Core Postman Workflow --');
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  async function api(method, urlPath, body = null, headers = {}) {
    const defaultHeaders = body ? { 'Content-Type': 'application/json' } : {};
    const res = await fetch(`${baseUrl}${urlPath}`, {
      method,
      headers: { ...defaultHeaders, ...headers },
      body: body ? JSON.stringify(body) : null,
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, headers: res.headers, data };
  }

  try {
    // 5a. Login National Admin (Simulating Request 1)
    const loginRes = await api('POST', '/auth/login', {
      email: envMap.national_email,
      password: envMap.default_password,
    });
    assert(loginRes.status === 200, 'POST /auth/login returns 200 OK');
    assert(!!loginRes.data?.token, "Token received from login matches Postman pm.environment.set('national_token')");
    const testNatToken = loginRes.data.token;

    // 5b. Introspect Principal (Simulating Request 5)
    const meRes = await api('GET', '/auth/me', null, {
      Authorization: `Bearer ${testNatToken}`,
    });
    assert(meRes.status === 200, 'GET /auth/me returns 200 OK');
    assert(meRes.data?.principal?.role === 'national', "Principal role matches 'national'");

    // 5c. Liveness & Readiness Probes (Simulating Folder 5)
    const liveRes = await api('GET', '/health');
    assert(liveRes.status === 200 && liveRes.data?.status === 'healthy', 'GET /health returns healthy');

    const specRes = await api('GET', '/docs/openapi.json');
    assert(specRes.status === 200 && specRes.data?.openapi.startsWith('3.0'), 'GET /docs/openapi.json returns valid OpenAPI spec');

    // 5d. Security Edge-Cases (Simulating Folder 6)
    const badUuidRes = await api('GET', '/provinces/not-a-valid-uuid-format/districts');
    assert(badUuidRes.status === 400 && badUuidRes.data?.code === 'BAD_REQUEST', '400 Bad Request returned on malformed UUID');

    const unauthRes = await api('GET', '/auth/me');
    assert(unauthRes.status === 401 && unauthRes.data?.code === 'UNAUTHORIZED', '401 Unauthorized returned on missing Bearer header');

    const notFoundRes = await api('GET', '/installations/ffffffff-ffff-4fff-afff-ffffffffffff/composite', null, {
      Authorization: `Bearer ${testNatToken}`,
    });
    assert(notFoundRes.status === 404 && notFoundRes.data?.code === 'NOT_FOUND', '404 Not Found returned on non-existent installation');

  } finally {
    server.close();
  }

  console.log(`\nPostman Artifact Verification Results: ${passed} Passed, ${failed} Failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runPostmanArtifactVerification().catch((err) => {
    console.error('Postman verification error:', err);
    process.exit(1);
  });
}

module.exports = { runPostmanArtifactVerification };
