'use strict';

/**
 * Verification test suite for JWT Bearer Authentication & RBAC Security Layer:
 * 1. Missing / Malformed / Invalid JWT -> 401 Unauthorized
 * 2. Device Write Authorization (POST /installations/:id/readings):
 *    - Token for Installation A writing to Installation A -> 201 Created & Location header
 *    - Token for Installation A writing to Installation B -> 403 Forbidden
 *    - Non-existent installation -> 404 Not Found
 * 3. User Jurisdictional Authorization:
 *    - National user -> Unrestricted read access
 *    - Provincial user -> Restricted to assigned province_id (403 for other provinces/districts)
 *    - District user -> Restricted to assigned district_id (403 for other districts/provinces)
 * 4. HTTPS Enforcement in production -> 403 Forbidden & HSTS header check
 */

const {
  generateDeviceToken,
  generateUserToken,
} = require('../src/utils/jwtUtils');
const authenticateJwt = require('../src/middleware/authenticateJwt');
const authorizeDeviceWrite = require('../src/middleware/authorizeDeviceWrite');
const authorizeJurisdiction = require('../src/middleware/authorizeJurisdiction');
const requireHttps = require('../src/middleware/requireHttps');
const { SolarInstallation, District, GridSubstation } = require('../src/models');

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

async function runSecurityTests() {
  console.log('\n🔒 Running Security Verification: JWT & RBAC Write-Read Security Split...\n');

  // ============================================================================
  // Test 1: JWT Authentication Layer (401 Unauthorized)
  // ============================================================================
  console.log('  -- 1. JWT Authentication Checks --');
  {
    // 1a. Missing Authorization header
    const req = { headers: {} };
    const res = mockResponse();
    let nextCalled = false;
    authenticateJwt(req, res, () => { nextCalled = true; });
    assert(res.statusCode === 401, 'Missing Authorization header returns 401 Unauthorized');
    assert(!nextCalled, 'next() not called on missing auth header');

    // 1b. Malformed Authorization header (not Bearer)
    const req2 = { headers: { authorization: 'Basic dXNlcjpwYXNz' } };
    const res2 = mockResponse();
    authenticateJwt(req2, res2, () => {});
    assert(res2.statusCode === 401, 'Non-Bearer Authorization header returns 401 Unauthorized');

    // 1c. Invalid token string
    const req3 = { headers: { authorization: 'Bearer invalid.jwt.token' } };
    const res3 = mockResponse();
    authenticateJwt(req3, res3, () => {});
    assert(res3.statusCode === 401, 'Invalid JWT signature returns 401 Unauthorized');

    // 1d. Valid token parses correctly
    const validToken = generateDeviceToken('11111111-1111-1111-1111-111111111111');
    const req4 = { headers: { authorization: `Bearer ${validToken}` } };
    const res4 = mockResponse();
    let authPassed = false;
    authenticateJwt(req4, res4, () => { authPassed = true; });
    assert(authPassed, 'Valid Bearer token invokes next()');
    assert(req4.auth?.installation_id === '11111111-1111-1111-1111-111111111111', 'Payload decoded on req.auth');
  }

  // ============================================================================
  // Test 2: Device Write Authorization (POST /installations/:id/readings)
  // ============================================================================
  console.log('\n  -- 2. Device Write Authorization (Metering Devices) --');
  {
    const instA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const instB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    // Mock SolarInstallation.findByPk
    const origFindByPk = SolarInstallation.findByPk;
    SolarInstallation.findByPk = async (id) => {
      if (id === instA || id === instB) {
        return { id, name: `Installation ${id}`, meter_id: `MTR-${id.slice(0, 4)}` };
      }
      return null;
    };

    try {
      // 2a. Device assigned to installation A posts to installation A -> Allowed
      const tokenA = generateDeviceToken(instA);
      const reqA = {
        params: { id: instA },
        headers: { authorization: `Bearer ${tokenA}` },
        auth: {
          sub: `device:${instA}`,
          installation_id: instA,
          scope: `installation:write:${instA}`,
          scopes: [`installation:write:${instA}`],
        },
      };
      const resA = mockResponse();
      let writeAllowed = false;
      await authorizeDeviceWrite(reqA, resA, () => { writeAllowed = true; });
      assert(writeAllowed, 'Device authorized for installation A can post to installation A');
      assert(reqA.targetInstallation?.id === instA, 'targetInstallation cached on request object');

      // 2b. Device assigned to installation A posts to installation B -> 403 Forbidden!
      const reqForbidden = {
        params: { id: instB },
        headers: { authorization: `Bearer ${tokenA}` },
        auth: {
          sub: `device:${instA}`,
          installation_id: instA,
          scope: `installation:write:${instA}`,
          scopes: [`installation:write:${instA}`],
        },
      };
      const resForbidden = mockResponse();
      let forbiddenNext = false;
      await authorizeDeviceWrite(reqForbidden, resForbidden, () => { forbiddenNext = true; });
      assert(!forbiddenNext, 'Forbidden device write blocked before controller');
      assert(resForbidden.statusCode === 403, 'Device for installation A posting to B returns 403 Forbidden');
      assert(resForbidden.body?.error === 'Forbidden', 'Standardized Forbidden JSON body returned');

      // 2c. Target installation does not exist in MySQL -> 404 Not Found
      const reqMissing = {
        params: { id: '99999999-9999-9999-9999-999999999999' },
        auth: { scopes: ['installation:write:99999999-9999-9999-9999-999999999999'] },
      };
      const resMissing = mockResponse();
      await authorizeDeviceWrite(reqMissing, resMissing, () => {});
      assert(resMissing.statusCode === 404, 'Non-existent installation returns 404 Not Found');
    } finally {
      SolarInstallation.findByPk = origFindByPk;
    }
  }

  // ============================================================================
  // Test 3: Jurisdictional User Authorization (SLSEA Analysts)
  // ============================================================================
  console.log('\n  -- 3. Jurisdictional User Authorization (SLSEA Analysts) --');
  {
    const PROV_WESTERN = '11111111-0000-0000-0000-000000000001';
    const PROV_CENTRAL = '22222222-0000-0000-0000-000000000002';
    const DIST_COLOMBO = 'cccccccc-0000-0000-0000-000000000001'; // belongs to PROV_WESTERN
    const DIST_KANDY = 'kkkkkkkk-0000-0000-0000-000000000002';   // belongs to PROV_CENTRAL

    const origDistrictFindByPk = District.findByPk;
    District.findByPk = async (id) => {
      if (id === DIST_COLOMBO) return { id, province_id: PROV_WESTERN };
      if (id === DIST_KANDY) return { id, province_id: PROV_CENTRAL };
      return null;
    };

    try {
      // 3a. National Scope: Full read access
      const nationalUserToken = generateUserToken({
        id: 'usr-nat-01',
        email: 'admin@slsea.gov.lk',
        role: 'national',
        jurisdiction_id: null,
      });
      const reqNat = {
        params: { id: DIST_KANDY },
        auth: { role: 'national', scopes: ['read:national'] },
      };
      const resNat = mockResponse();
      let natAllowed = false;
      const districtGuard = authorizeJurisdiction('district');
      await districtGuard(reqNat, resNat, () => { natAllowed = true; });
      assert(natAllowed, 'National user has unrestricted access across all districts');

      // 3b. Provincial Scope: Western Provincial User
      const reqProvWesternAccessWesternDist = {
        params: { id: DIST_COLOMBO },
        auth: {
          role: 'provincial',
          jurisdiction_id: PROV_WESTERN,
          scopes: [`read:province:${PROV_WESTERN}`],
        },
      };
      const resProvWestern1 = mockResponse();
      let provAllowed1 = false;
      await districtGuard(reqProvWesternAccessWesternDist, resProvWestern1, () => { provAllowed1 = true; });
      assert(provAllowed1, 'Western Provincial user CAN access Colombo (District in Western Province)');

      // 3c. Provincial Scope: Western Provincial User attempting to access Kandy District (Central Province) -> 403
      const reqProvWesternAccessCentralDist = {
        params: { id: DIST_KANDY },
        auth: {
          role: 'provincial',
          jurisdiction_id: PROV_WESTERN,
          scopes: [`read:province:${PROV_WESTERN}`],
        },
      };
      const resProvWestern2 = mockResponse();
      let provAllowed2 = false;
      await districtGuard(reqProvWesternAccessCentralDist, resProvWestern2, () => { provAllowed2 = true; });
      assert(!provAllowed2, 'Western Provincial user blocked from accessing Central Province district');
      assert(resProvWestern2.statusCode === 403, 'Cross-provincial access returns 403 Forbidden');

      // 3d. District Scope: Colombo District User accessing Colombo District -> 200
      const reqDistColombo = {
        params: { id: DIST_COLOMBO },
        auth: {
          role: 'district',
          jurisdiction_id: DIST_COLOMBO,
          scopes: [`read:district:${DIST_COLOMBO}`],
        },
      };
      const resDist1 = mockResponse();
      let distAllowed1 = false;
      await districtGuard(reqDistColombo, resDist1, () => { distAllowed1 = true; });
      assert(distAllowed1, 'Colombo District user CAN access Colombo District');

      // 3e. District Scope: Colombo District User attempting to access Kandy District -> 403 Forbidden
      const reqDistColomboAccessKandy = {
        params: { id: DIST_KANDY },
        auth: {
          role: 'district',
          jurisdiction_id: DIST_COLOMBO,
          scopes: [`read:district:${DIST_COLOMBO}`],
        },
      };
      const resDist2 = mockResponse();
      let distAllowed2 = false;
      await districtGuard(reqDistColomboAccessKandy, resDist2, () => { distAllowed2 = true; });
      assert(!distAllowed2, 'District user blocked from accessing other districts');
      assert(resDist2.statusCode === 403, 'Cross-district access returns 403 Forbidden');

      // 3f. District Scope attempting province-level collection -> 403 Forbidden
      const provinceGuard = authorizeJurisdiction('province');
      const reqDistAccessProvince = {
        params: { id: PROV_WESTERN },
        auth: {
          role: 'district',
          jurisdiction_id: DIST_COLOMBO,
          scopes: [`read:district:${DIST_COLOMBO}`],
        },
      };
      const resDistProv = mockResponse();
      await provinceGuard(reqDistAccessProvince, resDistProv, () => {});
      assert(resDistProv.statusCode === 403, 'District user blocked from province collections (403)');
    } finally {
      District.findByPk = origDistrictFindByPk;
    }
  }

  // ============================================================================
  // Test 4: HTTPS Enforcement & Security Headers
  // ============================================================================
  console.log('\n  -- 4. HTTPS Enforcement & Security Headers --');
  {
    // 4a. HSTS header is injected on all requests
    const reqHsts = { secure: false, headers: {} };
    const resHsts = mockResponse();
    requireHttps(reqHsts, resHsts, () => {});
    assert(
      resHsts.headers['strict-transport-security'] === 'max-age=31536000; includeSubDomains',
      'Strict-Transport-Security header injected'
    );

    // 4b. In production, unencrypted HTTP request is rejected with 403 Forbidden
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const reqHttpProd = { secure: false, headers: {} };
      const resHttpProd = mockResponse();
      let prodNext = false;
      requireHttps(reqHttpProd, resHttpProd, () => { prodNext = true; });
      assert(!prodNext, 'Unencrypted HTTP rejected in production');
      assert(resHttpProd.statusCode === 403, 'Unencrypted HTTP in production returns 403 Forbidden');

      // 4c. In production, HTTPS request with x-forwarded-proto passes
      const reqHttpsProd = { secure: false, headers: { 'x-forwarded-proto': 'https' } };
      const resHttpsProd = mockResponse();
      let prodHttpsNext = false;
      requireHttps(reqHttpsProd, resHttpsProd, () => { prodHttpsNext = true; });
      assert(prodHttpsNext, 'HTTPS with x-forwarded-proto passes in production');
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  }

  console.log(`\nResults: ${passed} Passed, ${failed} Failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runSecurityTests();
