# Changelog

All notable changes, schema iterations, and codebase updates for the **Sri Lanka Sustainable Energy Authority (SLSEA) Solar Generation Tracking Platform** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Planned / Upcoming
- JWT authentication middleware and role-based jurisdiction guards (`national`, `provincial`, `district`).
- High-throughput batch telemetry ingestion endpoint (`POST /api/v1/telemetry/batch`).

---

## [0.4.0] - 2026-09-24

### Analytical Historical Readings Endpoint (`GET /installations/:id/readings`)

#### Added
- **Hypermedia HATEOAS Pagination**:
  - Supports query parameters `page` (default `1`) and `limit` (default `50`, max `200`).
  - Standardized JSON envelope: `{ total_count, page, limit, data, links: { self, next, prev } }`.
  - Preserves all query filtering and sorting options in the generated navigation URIs.
- **Multi-dimensional Filtering & Sorting**:
  - Time window filtering: `?start_time=ISO8601&end_time=ISO8601` with ISO format validation.
  - Geographical / grid topology filtering: `?province_id=X&district_id=Y&substation_id=Z`.
  - Chronological sorting: `?sort=timestamp` (ascending) and `?sort=-timestamp` (descending, default).
- **HTTP Caching, Conditional GET & Status Codes**:
  - Deterministic SHA-256 `ETag` generation based on dataset query criteria and record hashes.
  - `Last-Modified` derivation formatted in RFC 7232 HTTP date.
  - Conditional GET handling: returns `304 Not Modified` on matching `If-None-Match` or valid `If-Modified-Since`.
  - Precondition verification: returns `412 Precondition Failed` if `If-Match` or `If-Unmodified-Since` evaluations fail.
  - Content Negotiation: returns `406 Not Acceptable` if `Accept` header excludes `application/json`.
  - Explicit enforcement of `Content-Type: application/json; charset=utf-8`.
- **Testing & Verification**:
  - `tests/test_unit_readings.js`: Unit test suite testing Content Negotiation (406), Pagination (400), Sorting (400), Time filtering (400), ETag generation, Conditional GET (304), and Preconditions (412).


## [0.3.0] - 2026-09-22

### Core REST API Routes & Ingestion Path

#### Added
- **Hierarchy Navigation Endpoints (Scoped Collections)**:
  - `GET /provinces`: Returns all 9 administrative provinces with district counts and codes.
  - `GET /provinces/:id/districts`: Scoped collection retrieving districts in a specific province.
  - `GET /districts/:id/substations`: Scoped collection retrieving CEB/LECO grid substations in a district.
  - `GET /substations/:id/installations`: Scoped collection retrieving solar installations interconnected to a substation.
- **Composite Resource (`GET /installations/:id/composite`)**:
  - Delivers complete installation metadata alongside its parent topology hierarchy (`grid_substation` -> `district` -> `province`).
  - Calculates real-time telemetry summary metrics (`total_readings`, `latest_cumulative_energy_kwh`, `current_power_kw`, `max_power_kw_recorded`, `avg_voltage_v`, `first_reading_timestamp`, `last_reading_timestamp`).
- **Operational Derived Resource (`GET /installations/:id/last-reading`)**:
  - Exposes the single most recent `GenerationReading` as a derived resource rather than a generic table query.
  - Executes sub-millisecond index scans utilizing the compound index `(installation_id, timestamp DESC)`.
- **Device Ingestion Write Path (`POST /installations/:id/readings`)**:
  - Validates incoming reading payloads (`timestamp`, `power_kw`, `energy_kwh`, `voltage_v`).
  - Appends telemetry directly into `generation_readings` (append-only ledger).
  - Emits standard `201 Created` with a `Location: /installations/{id}/readings/{reading.id}` header.
  - Added `GET /installations/:id/readings/:readingId` to resolve the emitted `Location` header.
- **Middleware & Application Architecture**:
  - `src/middleware/validateUuid.js`: Route parameter UUID guard preventing database query syntax errors.
  - `src/middleware/errorHandler.js`: Centralized error handler formatting RFC-standard JSON error responses.
  - `src/app.js`: Express app instance mounting routes at both `/` and `/api/v1/`.
  - `src/server.js`: Production HTTP listener with database pre-flight checks.
  - `tests/test_api.js`: Verification test suite for automated route inspection.
  - `.gitignore`: Standard Node.js rules excluding `node_modules/`, `.env`, logs, and OS/IDE metadata.

---

## [0.2.0] - 2026-09-18

### Database Seeding Engine (Phase 1 Scale)

#### Added
- **Production Seeder Script (`src/seeders/seed.js`)**:
  - Full Sri Lankan administrative topology: 9 Provinces, 25 Districts strictly mapped.
  - 28 real CEB/LECO Grid Substations distributed across all 25 districts (exceeds requirement of 20).
  - 200 Solar Installations distributed across grid substations with unique `meter_id`s (`SLSEA-MTR-0001` through `0200`).
  - Generated 1 full week of 15-minute interval telemetry per installation (96 readings/day × 7 days = 672 readings per site; **134,400 total time-series records**).
  - Implemented Sri Lankan equatorial diurnal solar curve: strict 0 kW cutoff between 18:30 and 05:30, realistic morning ramp, solar noon peak (78%-85% rated capacity) between 11:30 and 13:30, and realistic cloud variance.
  - Monotonic cumulative energy accumulation (`energy_kwh += power_kw * 0.25h`) and AC grid voltage modeling (228V base + solar backfeed rise).
  - High-performance chunked bulk insertion (`BATCH_SIZE = 8000`) ensuring sub-minute execution without memory exhaustion.
  - Seeded default jurisdictional administrative accounts for national, provincial, and district tiers.
- **Project Configuration**:
  - Added `package.json` with npm run scripts (`"seed"`, `"migrate"`, `"dev"`).

---

## [0.1.0] - 2026-09-14

### Initial Architecture & Database Foundation

#### Added
- **Sequelize ORM Model Definitions (`src/models/`)**:
  - `Province.js`: Represents the 9 administrative provinces of Sri Lanka (`id`, `name`, `code`).
  - `District.js`: Represents the 25 administrative districts with `province_id` foreign key.
  - `GridSubstation.js`: Interconnection CEB/LECO substations with `capacity_mw` and `district_id` foreign key.
  - `SolarInstallation.js`: Solar generation sites with `capacity_kw`, `installation_type`, `grid_substation_id`, and direct `meter_id`.
  - `GenerationReading.js`: High-frequency append-only time-series telemetry (`power_kw`, `energy_kwh`, `voltage_v`, `timestamp`, `installation_id`).
  - `User.js`: Authentication and jurisdictional scoping model with roles `['national', 'provincial', 'district']` and `jurisdiction_id`.
  - `index.js`: Model loader, connection pool initialization, and association registry.
- **Database Migrations**:
  - `migrations/20260914150000-create-slsea-schema.js`: Production-ready Sequelize CLI migration script.
- **Documentation**:
  - `CHANGELOG.md`: Tracks ongoing features, modifications, and schema updates.
  - `ARCHITECTURE_REASONING.md`: In-depth rationale behind domain decisions, schema trade-offs, and indexing strategies.
