'use strict';

/**
 * SLSEA Solar Platform - Comprehensive Verification Test Suite:
 * 1. Pagination (page, limit, total_count, hypermedia links)
 * 2. Time Window Filtering (start_time, end_time, validation)
 * 3. Jurisdiction Filtering (province_id, district_id, substation_id)
 * 4. Timestamp Sorting (ascending 'timestamp', descending '-timestamp')
 */

const BASE_URL = process.env.LIVE_API_URL || 'https://real-time-solar-generation.vercel.app';

let passed = 0;
let failed = 0;

function assert(condition, message, detail) {
  if (condition) {
    console.log(`  ✔ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    if (detail) console.error('     Detail:', detail);
    failed++;
  }
}

async function request(url, options = {}) {
  const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
  const res = await fetch(fullUrl, {
    method: options.method || 'GET',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let data = null;
  const raw = await res.text();
  try { data = JSON.parse(raw); } catch { data = raw; }
  return { status: res.status, headers: res.headers, data };
}

async function run() {
  console.log('================================================================================');
  console.log('🚀 TESTING PAGINATION, FILTERING (JURISDICTION & TIME), AND SORTING');
  console.log(`🎯 Target API: ${BASE_URL}`);
  console.log('================================================================================\n');

  // Step 1: Login as National Admin
  const loginRes = await request('/api/v1/auth/login', {
    method: 'POST',
    body: { email: 'national.admin@slsea.gov.lk', password: 'Password123!' },
  });
  assert(loginRes.status === 200 && !!loginRes.data.token, 'National Admin authentication successful');
  const token = loginRes.data.token;
  const headers = { Authorization: `Bearer ${token}` };

  // Step 2: Fetch hierarchy sample to obtain realistic UUIDs
  const provsRes = await request('/api/v1/provinces', { headers });
  const provs = provsRes.data.data;
  const wp = provs.find(p => p.code === 'WP');
  const cp = provs.find(p => p.code === 'CP');

  const distsRes = await request(`/api/v1/provinces/${wp.id}/districts`, { headers });
  const colombo = distsRes.data.data.find(d => d.name === 'Colombo');

  const subsRes = await request(`/api/v1/districts/${colombo.id}/substations`, { headers });
  const sub = subsRes.data.data[0];

  const instsRes = await request(`/api/v1/substations/${sub.id}/installations`, { headers });
  const inst = instsRes.data.data[0];

  console.log(`\n📌 Target Installation for Telemetry Queries:`);
  console.log(`   Name: ${inst.name} (ID: ${inst.id})`);
  console.log(`   Substation: ${sub.name} (ID: ${sub.id})`);
  console.log(`   District: ${colombo.name} (ID: ${colombo.id})`);
  console.log(`   Province: ${wp.name} (ID: ${wp.id})\n`);

  // ----------------------------------------------------------------------------
  // TEST GROUP 1: PAGINATION (page & limit)
  // ----------------------------------------------------------------------------
  console.log('--- 1. Pagination Verification ---');

  // 1.1 Page 1 with limit 3
  const page1Res = await request(`/api/v1/installations/${inst.id}/readings?page=1&limit=3`, { headers });
  assert(page1Res.status === 200, 'GET /installations/:id/readings?page=1&limit=3 returns 200 OK');
  assert(page1Res.data.page === 1, 'Response envelope confirms page: 1');
  assert(page1Res.data.limit === 3, 'Response envelope confirms limit: 3');
  assert(page1Res.data.data.length === 3, 'Result contains exactly 3 items');
  assert(typeof page1Res.data.total_count === 'number' && page1Res.data.total_count > 0, `Total readings count reported: ${page1Res.data.total_count}`);
  assert(page1Res.data.links && page1Res.data.links.next, 'Hypermedia links include next page URI');

  // 1.2 Page 2 with limit 3
  const page2Res = await request(`/api/v1/installations/${inst.id}/readings?page=2&limit=3`, { headers });
  assert(page2Res.status === 200, 'GET /installations/:id/readings?page=2&limit=3 returns 200 OK');
  assert(page2Res.data.page === 2, 'Response envelope confirms page: 2');
  assert(page2Res.data.data[0].id !== page1Res.data.data[0].id, 'Page 2 items are distinct from Page 1 items');
  assert(page2Res.data.links && page2Res.data.links.prev, 'Hypermedia links include prev page URI');

  // 1.3 Pagination validation (Invalid page)
  const invalidPageRes = await request(`/api/v1/installations/${inst.id}/readings?page=0`, { headers });
  assert(invalidPageRes.status === 400 && invalidPageRes.data.code === 'BAD_REQUEST', 'Reject page=0 with 400 BAD_REQUEST');

  // ----------------------------------------------------------------------------
  // TEST GROUP 2: SORTING (ascending & descending)
  // ----------------------------------------------------------------------------
  console.log('\n--- 2. Sorting by Timestamp Verification ---');

  // 2.1 Ascending sort (oldest first: sort=timestamp)
  const sortAscRes = await request(`/api/v1/installations/${inst.id}/readings?sort=timestamp&limit=5`, { headers });
  assert(sortAscRes.status === 200, 'GET ?sort=timestamp returns 200 OK');
  const ascReadings = sortAscRes.data.data;
  const isAscending = new Date(ascReadings[0].timestamp) <= new Date(ascReadings[1].timestamp);
  assert(isAscending, `Ascending sort verified: ${ascReadings[0].timestamp} <= ${ascReadings[1].timestamp}`);

  // 2.2 Descending sort (newest first: sort=-timestamp)
  const sortDescRes = await request(`/api/v1/installations/${inst.id}/readings?sort=-timestamp&limit=5`, { headers });
  assert(sortDescRes.status === 200, 'GET ?sort=-timestamp returns 200 OK');
  const descReadings = sortDescRes.data.data;
  const isDescending = new Date(descReadings[0].timestamp) >= new Date(descReadings[1].timestamp);
  assert(isDescending, `Descending sort verified: ${descReadings[0].timestamp} >= ${descReadings[1].timestamp}`);

  // 2.3 Invalid sort field rejection
  const invalidSortRes = await request(`/api/v1/installations/${inst.id}/readings?sort=invalid_field`, { headers });
  assert(invalidSortRes.status === 400 && invalidSortRes.data.code === 'BAD_REQUEST', 'Reject invalid sort parameter with 400 BAD_REQUEST');

  // ----------------------------------------------------------------------------
  // TEST GROUP 3: TIME WINDOW FILTERING (start_time & end_time)
  // ----------------------------------------------------------------------------
  console.log('\n--- 3. Time Window Filtering Verification ---');

  // Use timestamps from the dataset
  const baselineTime = new Date(ascReadings[0].timestamp);
  const startTime = new Date(baselineTime.getTime() + 60 * 60 * 1000).toISOString(); // +1 hour
  const endTime = new Date(baselineTime.getTime() + 4 * 60 * 60 * 1000).toISOString(); // +4 hours

  const timeFilteredRes = await request(
    `/api/v1/installations/${inst.id}/readings?start_time=${encodeURIComponent(startTime)}&end_time=${encodeURIComponent(endTime)}&limit=20`,
    { headers }
  );
  assert(timeFilteredRes.status === 200, 'GET ?start_time=...&end_time=... returns 200 OK');
  const timeReadings = timeFilteredRes.data.data;
  assert(timeReadings.length > 0, `Returned ${timeReadings.length} readings within time window`);

  const allWithinWindow = timeReadings.every(r => {
    const t = new Date(r.timestamp).getTime();
    return t >= new Date(startTime).getTime() && t <= new Date(endTime).getTime();
  });
  assert(allWithinWindow, `All readings strictly bounded by start_time (${startTime}) and end_time (${endTime})`);

  // 3.2 Time window validation: start_time > end_time
  const invalidRangeRes = await request(
    `/api/v1/installations/${inst.id}/readings?start_time=${encodeURIComponent(endTime)}&end_time=${encodeURIComponent(startTime)}`,
    { headers }
  );
  assert(invalidRangeRes.status === 400 && invalidRangeRes.data.code === 'BAD_REQUEST', 'Reject start_time > end_time with 400 BAD_REQUEST');

  // 3.3 Malformed timestamp format rejection
  const malformedTimeRes = await request(
    `/api/v1/installations/${inst.id}/readings?start_time=not-a-valid-date`,
    { headers }
  );
  assert(malformedTimeRes.status === 400 && malformedTimeRes.data.code === 'BAD_REQUEST', 'Reject malformed ISO timestamp with 400 BAD_REQUEST');

  // ----------------------------------------------------------------------------
  // TEST GROUP 4: JURISDICTION FILTERING (province, district, substation)
  // ----------------------------------------------------------------------------
  console.log('\n--- 4. Jurisdiction Filtering Verification ---');

  // 4.1 Filter by matching Province ID (Western Province)
  const provMatchRes = await request(`/api/v1/installations/${inst.id}/readings?province_id=${wp.id}&limit=5`, { headers });
  assert(provMatchRes.status === 200, 'Filter by matching province_id returns 200 OK');
  assert(provMatchRes.data.data.length > 0, `Readings returned for matching province '${wp.name}'`);

  // 4.2 Filter by non-matching Province ID (Central Province) -> Must return 0 records
  const provMismatchRes = await request(`/api/v1/installations/${inst.id}/readings?province_id=${cp.id}&limit=5`, { headers });
  assert(provMismatchRes.status === 200, 'Filter by non-matching province_id returns 200 OK');
  assert(provMismatchRes.data.data.length === 0, `Non-matching province '${cp.name}' returns empty dataset (0 records)`);

  // 4.3 Filter by matching District ID (Colombo District)
  const distMatchRes = await request(`/api/v1/installations/${inst.id}/readings?district_id=${colombo.id}&limit=5`, { headers });
  assert(distMatchRes.status === 200, 'Filter by matching district_id returns 200 OK');
  assert(distMatchRes.data.data.length > 0, `Readings returned for matching district '${colombo.name}'`);

  // 4.4 Filter by matching Substation ID (Kolonnawa GSS)
  const subMatchRes = await request(`/api/v1/installations/${inst.id}/readings?substation_id=${sub.id}&limit=5`, { headers });
  assert(subMatchRes.status === 200, 'Filter by matching substation_id returns 200 OK');
  assert(subMatchRes.data.data.length > 0, `Readings returned for matching substation '${sub.name}'`);

  // 4.5 Malformed UUID validation
  const invalidUuidRes = await request(`/api/v1/installations/${inst.id}/readings?province_id=123-not-uuid`, { headers });
  assert(invalidUuidRes.status === 400 && invalidUuidRes.data.code === 'BAD_REQUEST', 'Reject malformed UUID filter parameter with 400 BAD_REQUEST');

  // ----------------------------------------------------------------------------
  // TEST GROUP 5: COMPOSITE COMBINED QUERY
  // ----------------------------------------------------------------------------
  console.log('\n--- 5. Composite Combined Query Verification ---');

  const combinedUrl = `/api/v1/installations/${inst.id}/readings?province_id=${wp.id}&district_id=${colombo.id}&start_time=${encodeURIComponent(startTime)}&end_time=${encodeURIComponent(endTime)}&sort=timestamp&page=1&limit=5`;
  const combinedRes = await request(combinedUrl, { headers });
  assert(combinedRes.status === 200, 'Combined query (Jurisdiction + Time Window + Sort + Pagination) returns 200 OK');
  assert(combinedRes.data.page === 1 && combinedRes.data.limit === 5, 'Envelope conforms to pagination parameters');
  assert(combinedRes.data.data.length > 0, `Combined query returned ${combinedRes.data.data.length} records`);

  console.log('\n================================================================================');
  console.log(`🏁 TEST RESULTS: ${passed} PASSED / ${failed} FAILED (${((passed / (passed + failed)) * 100).toFixed(1)}%)`);
  console.log('================================================================================\n');
}

run().catch(console.error);
