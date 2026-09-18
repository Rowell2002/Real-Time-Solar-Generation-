# Changelog

All notable changes, schema iterations, and codebase updates for the **Sri Lanka Sustainable Energy Authority (SLSEA) Solar Generation Tracking Platform** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Planned / Upcoming
- Express.js route controllers for the 5-entity hierarchy (`/provinces`, `/districts`, `/substations`, `/installations`, `/readings`).
- High-throughput ingestion endpoint for real-time meter telemetry (`POST /api/v1/telemetry`).
- JWT authentication middleware and role-based jurisdiction guards (`national`, `provincial`, `district`).

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
