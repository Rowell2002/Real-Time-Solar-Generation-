# Changelog

All notable changes, schema iterations, and codebase updates for the **Sri Lanka Sustainable Energy Authority (SLSEA) Solar Generation Tracking Platform** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Planned / Upcoming
- Express.js route controllers for the 5-entity hierarchy (`/provinces`, `/districts`, `/substations`, `/installations`, `/readings`).
- High-throughput ingestion endpoint for real-time meter telemetry (`POST /api/v1/telemetry`).
- JWT authentication middleware and role-based jurisdiction guards (`national`, `provincial`, `district`).
- Database seeders for Sri Lanka's 9 provinces and 25 districts.

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
