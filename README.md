# Sri Lanka Sustainable Energy Authority (SLSEA)
## Real-Time Solar Generation Monitoring RESTful Telemetry Platform

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-v4.19-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Sequelize ORM](https://img.shields.io/badge/Sequelize-v6.37-52B0E7?logo=sequelize&logoColor=white)](https://sequelize.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![OpenAPI 3.0](https://img.shields.io/badge/OpenAPI-3.0.3-85EA2D?logo=swagger&logoColor=black)](http://localhost:3000/docs)
[![Test Suite](https://img.shields.io/badge/Tests-204%20Passing%20(100%25)-brightgreen)](#7-automated-test-suite-overview--verification-evidence)
[![Maturity](https://img.shields.io/badge/RMM-Level%203%20(HATEOAS)-blue)](#3-richardson-maturity-model-rmm-compliance)

---

## Table of Contents
1. [Executive Summary & Problem Domain](#1-executive-summary--problem-domain)
   - [Regulatory Mandate & Policy Context](#11-regulatory-mandate--policy-context)
   - [Grid Modernization & The Duck Curve Phenomenon](#12-grid-modernization--the-duck-curve-phenomenon)
   - [System Architectural Mission](#13-system-architectural-mission)
2. [Architectural Decisions & Domain Model](#2-architectural-decisions--domain-model)
   - [Resource-Oriented Topological Hierarchy](#21-resource-oriented-topological-hierarchy)
   - [Entity-Relationship Diagram (ERD)](#22-entity-relationship-diagram-erd)
   - [Architectural Decision Records (ADRs) Summary](#23-architectural-decision-records-adrs-summary)
3. [Richardson Maturity Model (RMM) Compliance](#3-richardson-maturity-model-rmm-compliance)
   - [Maturity Level Assessment Matrix](#31-maturity-level-assessment-matrix)
   - [Level 3 HATEOAS & Hypermedia Engine Demonstration](#32-level-3-hateoas--hypermedia-engine-demonstration)
4. [Security & Cryptographic Jurisdictional Scoping](#4-security--cryptographic-jurisdictional-scoping)
   - [Zero-Trust Write-Read Security Split](#41-zero-trust-write-read-security-split)
   - [Role-Based Access Control (RBAC) Matrix](#42-role-based-access-control-rbac-matrix)
   - [Transport Security & Quota Enforcement](#43-transport-security--quota-enforcement)
5. [Comprehensive API Catalog](#5-comprehensive-api-catalog)
   - [Endpoint Master Index](#51-endpoint-master-index)
   - [Identity & Token Lifecycle Resources](#52-identity--token-lifecycle-resources)
   - [Topological Hierarchy Traversal Resources](#53-topological-hierarchy-traversal-resources)
   - [Telemetry Ingestion & Operational Read Resources](#54-telemetry-ingestion--operational-read-resources)
   - [Aggregated Grid Analytics Resources](#55-aggregated-grid-analytics-resources)
   - [Standardized Error Contract](#56-standardized-error-contract)
6. [Setup and Execution Guide](#6-setup-and-execution-guide)
   - [System Prerequisites](#61-system-prerequisites)
   - [Environment Configuration](#62-environment-configuration)
   - [Database Migration Execution](#63-database-migration-execution)
   - [Diurnal Physics Seeder Execution](#64-diurnal-physics-seeder-execution)
   - [Server Execution & Live Documentation](#65-server-execution--live-documentation)
7. [Automated Test Suite Overview & Verification Evidence](#7-automated-test-suite-overview--verification-evidence)
   - [Testing Pyramid Architecture](#71-testing-pyramid-architecture)
   - [Verification Test Matrix (167 Passing Assertions)](#72-verification-test-matrix-167-passing-assertions)
   - [Test Execution Runbook](#73-test-execution-runbook)

---

## 1. Executive Summary & Problem Domain

### 1.1 Regulatory Mandate & Policy Context
Under the statutory authority established by the **Sri Lanka Sustainable Energy Authority Act No. 35 of 2007** and the Government of Sri Lanka's **National Energy Policy & Strategies**, the country has committed to achieving **70% renewable electricity generation by the year 2030**, transitioning toward complete carbon neutrality in the power sector by 2050.

In accordance with the Ceylon Electricity Board (CEB) **Long-Term Generation Expansion Plan (LTGEP)**, solar photovoltaic (PV) generation—both utility-scale solar farms and decentralized net-metered rooftop solar arrays—represents the primary catalyst for clean capacity additions. However, unmetered or asynchronously monitored solar generation introduces severe transmission-level volatility.

### 1.2 Grid Modernization & The Duck Curve Phenomenon
As the penetration of non-dispatchable distributed photovoltaic systems surges across Sri Lanka's low-voltage and medium-voltage networks, grid system operators face pronounced operational vulnerabilities:
1. **The Tropical Duck Curve**: Rapid midday solar generation spikes coincide with intermediate load troughs between 11:30 and 13:30, followed by steep ramp-down gradients at sunset (17:30–18:30) as commercial and domestic peak demand surges.
2. **Reverse Power Flow at Grid Substations**: High-density rooftop solar in urban districts (e.g., Colombo, Gampaha) produces reverse active power flow through 33kV/132kV transformers, causing local voltage swell and power factor deterioration.
3. **Telemetry Latency Bottlenecks**: Without standardized real-time telemetry, transmission dispatchers lack visibility into instantaneous generation reserves, forcing thermal spinning reserves to run inefficiently.

```
       Power (kW)
         ▲
 100% ───│                      ██████
         │                   ████████████
  75% ───│                 ████████████████
         │               ████████████████████
  50% ───│             ████████████████████████
         │           ████████████████████████████
  25% ───│         ████████████████████████████████
         │       ████████████████████████████████████
   0% ───┴─────██────────────────────────────────────██──────► Time (Hours)
        00:00 05:30   08:00    12:30   15:30   18:30 23:59
              Sunrise          Zenith          Sunset
```

### 1.3 System Architectural Mission
This RESTful platform provides a fault-tolerant, low-latency, zero-trust backend infrastructure engineered to:
* **Ingest high-frequency telemetry** from distributed smart energy meters at 15-minute intervals across all 9 provinces.
* **Guarantee idempotent, append-only persistence** using relational constraints and window-partitioned time-series indexing.
* **Eliminate N+1 database querying** through single-query Common Table Expressions (CTEs) for upper-band regional and national dashboards.
* **Enforce zero-trust boundaries** segregating automated meter ingestion from provincial and national regulatory analysts.

---

## 2. Architectural Decisions & Domain Model

### 2.1 Resource-Oriented Topological Hierarchy
The platform structures Sri Lanka's electrical grid into an atomic 5-tier containment hierarchy, enabling predictable URI scoping and strict foreign key referential integrity:

$$\text{Province (9)} \xrightarrow{1:N} \text{District (25)} \xrightarrow{1:N} \text{Grid Substation (20+)} \xrightarrow{1:N} \text{Solar Installation (200+)} \xrightarrow{1:N} \text{Generation Reading (134,400+)}$$

### 2.2 Entity-Relationship Diagram (ERD)

```
+-------------------------------------------------------------------------------------------------+
|                                     PROVINCES (provinces)                                       |
+-------------------------------------------------------------------------------------------------+
| PK id                 : UUID            (RFC 4122 v4)                                           |
|    name               : VARCHAR(100)    (e.g., 'Western Province')                              |
|    code               : VARCHAR(10)     (UNIQUE, e.g., 'WP')                                    |
|    created_at         : TIMESTAMPTZ                                                             |
|    updated_at         : TIMESTAMPTZ                                                             |
+-------------------------------------------------------------------------------------------------+
                                                  │ 1
                                                  │ has many
                                                  ▼ N
+-------------------------------------------------------------------------------------------------+
|                                     DISTRICTS (districts)                                       |
+-------------------------------------------------------------------------------------------------+
| PK id                 : UUID            (RFC 4122 v4)                                           |
| FK province_id        : UUID            (REFERENCES provinces(id) ON DELETE CASCADE)            |
|    name               : VARCHAR(100)    (e.g., 'Colombo')                                       |
|    code               : VARCHAR(10)     (UNIQUE, e.g., 'COL')                                   |
|    created_at         : TIMESTAMPTZ                                                             |
|    updated_at         : TIMESTAMPTZ                                                             |
+-------------------------------------------------------------------------------------------------+
                                                  │ 1
                                                  │ has many
                                                  ▼ N
+-------------------------------------------------------------------------------------------------+
|                               GRID SUBSTATIONS (grid_substations)                               |
+-------------------------------------------------------------------------------------------------+
| PK id                 : UUID            (RFC 4122 v4)                                           |
| FK district_id        : UUID            (REFERENCES districts(id) ON DELETE CASCADE)            |
|    name               : VARCHAR(150)    (e.g., 'Pannipitiya GSS')                               |
|    substation_code    : VARCHAR(20)     (UNIQUE, e.g., 'GSS-WP-PAN-01')                         |
|    voltage_kv         : DECIMAL(6,2)    (e.g., 132.00 kV)                                       |
|    capacity_mva       : DECIMAL(8,2)    (e.g., 60.00 MVA)                                       |
|    created_at         : TIMESTAMPTZ                                                             |
|    updated_at         : TIMESTAMPTZ                                                             |
+-------------------------------------------------------------------------------------------------+
                                                  │ 1
                                                  │ has many
                                                  ▼ N
+-------------------------------------------------------------------------------------------------+
|                             SOLAR INSTALLATIONS (solar_installations)                           |
+-------------------------------------------------------------------------------------------------+
| PK id                 : UUID            (RFC 4122 v4)                                           |
| FK substation_id      : UUID            (REFERENCES grid_substations(id) ON DELETE CASCADE)     |
|    name               : VARCHAR(150)    (e.g., 'Pannipitiya Solar Array 1')                     |
|    meter_id           : VARCHAR(50)     (UNIQUE INDEX, e.g., 'MTR-WP-COL-001')                  |
|    capacity_kw        : DECIMAL(8,2)    (e.g., 500.00 kW)                                       |
|    installation_type  : ENUM            ('rooftop', 'ground_mounted', 'floating')               |
|    is_active          : BOOLEAN         (DEFAULT: true)                                         |
|    created_at         : TIMESTAMPTZ                                                             |
|    updated_at         : TIMESTAMPTZ                                                             |
+-------------------------------------------------------------------------------------------------+
                                                  │ 1
                                                  │ has many
                                                  ▼ N
+-------------------------------------------------------------------------------------------------+
|                             GENERATION READINGS (generation_readings)                           |
+-------------------------------------------------------------------------------------------------+
| PK id                 : UUID            (RFC 4122 v4)                                           |
| FK installation_id    : UUID            (REFERENCES solar_installations(id) ON DELETE CASCADE)  |
|    timestamp          : TIMESTAMPTZ     (15-minute interval timestamp)                          |
|    power_kw           : DECIMAL(10,3)   (Instantaneous generation, kW)                          |
|    energy_kwh         : DECIMAL(14,3)   (Monotonically increasing cumulative kWh)               |
|    voltage_v          : DECIMAL(6,2)    (Grid connection voltage, Volts)                        |
|    created_at         : TIMESTAMPTZ                                                             |
+-------------------------------------------------------------------------------------------------+
| INDEXES:                                                                                        |
| - UNIQUE INDEX (installation_id, timestamp)                                                     |
| - COMPOSITE INDEX idx_installation_timestamp (installation_id, timestamp DESC)                  |
| - PARTITION/FILTER INDEX (timestamp)                                                            |
+-------------------------------------------------------------------------------------------------+

                               USERS & JURISDICTIONS (users)
+-------------------------------------------------------------------------------------------------+
| PK id                 : UUID            (RFC 4122 v4)                                           |
|    email              : VARCHAR(150)    (UNIQUE, e.g., 'western.analyst@slsea.gov.lk')           |
|    password_hash      : VARCHAR(255)    (Argon2 / BCrypt hash)                                  |
|    role               : ENUM            ('national', 'provincial', 'district')                  |
|    jurisdiction_id    : UUID            (NULL for national; province_id or district_id)         |
|    scopes             : JSONB / TEXT    (e.g., '["read:province:018f..."]')                     |
|    created_at         : TIMESTAMPTZ                                                             |
|    updated_at         : TIMESTAMPTZ                                                             |
+-------------------------------------------------------------------------------------------------+
```

### 2.3 Architectural Decision Records (ADRs) Summary

| ADR Identifier | Architectural Decision | Core Rationale & Trade-offs |
| :--- | :--- | :--- |
| **ADR-01** | Direct `meter_id` on `SolarInstallation` | Binds the physical hardware meter identity to the revenue installation, enabling $O(1)$ token lookup and preventing cross-meter telemetry forgery. |
| **ADR-02** | Append-Only Immutable Time-Series | Telemetry logs are strictly append-only. Zero in-place `UPDATE` operations preserve audit fidelity and avoid relational deadlocks. |
| **ADR-03** | Composite B-Tree Indexing | Composite index `(installation_id, timestamp DESC)` eliminates index scans, serving operational window queries in $<5\text{ms}$. |
| **ADR-04** | Node.js Buffer Batch Seeding | Eliminates memory thrashing during 134,400-record generation using 8,000-item buffered chunks, completing in $<20\text{s}$. |
| **ADR-05** | Diurnal Solar Physics Formulation | Synthesizes realistic bell-curve generation with $0\,\text{kW}$ nocturnal floors and parabolic noon peaks reflecting Sri Lankan insolation. |
| **ADR-06** | Strict REST Resource Traversal | Scopes collections by parent URI (`/provinces/:id/districts`) enforcing navigational containment without cross-scope leakage. |
| **ADR-07** | Composite Lineage Projection | `GET /installations/:id/composite` returns parent substation, district, province, and summary metrics in a single consolidated payload. |
| **ADR-08** | Derived Operational `last-reading` | Models the latest generation record as a derived first-class URI rather than exposing raw unconstrained table scans. |
| **ADR-09** | SHA-256 ETag & Conditional Caching | Calculates cryptographic entity tags over canonical JSON envelopes, returning `304 Not Modified` on cache hits. |
| **ADR-10** | Precondition & Negotiation Handling | Enforces RFC 7232 `If-Match` validation (`412 Precondition Failed`) and RFC 7231 `Accept: application/json` negotiation (`406 Not Acceptable`). |
| **ADR-11** | Single-Query CTE + Window Rollup | Collapses district dashboard aggregations into a single SQL execution via `ROW_NUMBER() OVER (PARTITION BY ...)` to eliminate N+1 latency. |
| **ADR-12** | Zero-Trust Write-Read Security Split | Separates device write capabilities (`installation:write:{id}`) from regional analyst queries (`read:province:{id}`). |
| **ADR-13** | Standardized 4-Field Error Contract | Normalizes all 4xx/5xx errors into `{ code, message, detail, timestamp }`, mapping MySQL/Postgres exceptions deterministically. |
| **ADR-14** | Token Lifecycle & Device Minting | Introduces first-class endpoints (`/auth/login`, `/auth/device-token`, `/auth/me`) for secure JWT generation and introspection. |
| **ADR-15** | High-Throughput Batch Telemetry | Ingests up to 500 readings atomically with deduplication, in-flight item validation, and bulk insertion. |
| **ADR-16** | National Grid Generation Engine | Provides macro-level country rollups across all 9 provinces via a single CTE, restricted to `national` analysts. |
| **ADR-17** | Sliding-Window Rate Limiting | Implements in-memory sliding-window throttling (RFC 6585) with standard headers alongside deep DB readiness probes (`/health/ready`). |

---

## 3. Richardson Maturity Model (RMM) Compliance

The API adheres to Leonard Richardson's REST Maturity Model, advancing beyond basic RPC-over-HTTP systems to reach full Level 3 hypermedia maturity:

```
                          ▲
                          │  [ LEVEL 3 ]: Hypermedia Controls (HATEOAS, HAL, RFC 5988)
                          │  [ LEVEL 2 ]: HTTP Verbs, Semantic Status Codes, Caching & Negotiation
                          │  [ LEVEL 1 ]: Distinct Resources & Scoped Hierarchical URIs
                          │  [ LEVEL 0 ]: Monolithic Single-URI RPC / HTTP Tunneling (The Swamp of POX)
                          └─────────────────────────────────────────────────────────────────────────────►
```

### 3.1 Maturity Level Assessment Matrix

| RMM Level | Architectural Trait | SLSEA Implementation Detail | Status |
| :---: | :--- | :--- | :---: |
| **Level 0**<br>*The Swamp of POX* | Single endpoint, single HTTP verb (`POST`), action dispatching in payload. | **Explicitly Rejected**. The API does not use monolithic remote procedure call endpoints or generic action tunneling. | ✅ **Compliant** |
| **Level 1**<br>*Resources* | Individual URIs identifying atomic resources and nested collections. | **Implemented**. Granular resource addresses: `/provinces/{id}`, `/districts/{id}/substations`, `/installations/{id}/composite`, `/installations/{id}/last-reading`. | ✅ **Compliant** |
| **Level 2**<br>*HTTP Verbs & Status* | Semantic verbs (`GET`, `POST`), standard status codes, content negotiation, conditional validation. | **Implemented**. Semantic verbs; status codes `200`, `201`, `304`, `400`, `401`, `403`, `404`, `406`, `412`, `422`, `429`, `503`; `ETag` and `Last-Modified` validation; `Accept` negotiation. | ✅ **Compliant** |
| **Level 3**<br>*Hypermedia (HATEOAS)* | Self-describing messages with contextual hypermedia links driving client navigation state. | RFC 5988 / HAL `links` envelopes provided on paginated analytical collections and batch ingestion responses. | ❌ *Not Implemented* |

### 3.2 Level 3 HATEOAS & Hypermedia Engine Demonstration

#### A. Paginated Analytical Reading Collection (`GET /installations/{id}/readings`)
Clients do not hardcode URL pagination schemes; navigation state is driven entirely by hypermedia links returned by the server:

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
ETag: "9f83a48e89e023158097b69206b12d5b6e4e892c90234a71"
Last-Modified: Thu, 08 Oct 2026 09:45:00 GMT
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 298
```
```json
{
  "total_count": 672,
  "page": 2,
  "limit": 50,
  "data": [
    {
      "id": "018f4a12-7b32-7c80-87a1-f0a801234567",
      "installation_id": "018f4a12-7b32-7c80-87a1-000000000001",
      "timestamp": "2026-10-08T09:30:00.000Z",
      "power_kw": 432.850,
      "energy_kwh": 12845.200,
      "voltage_v": 230.40
    }
  ],
  "links": {
    "self": "/installations/018f4a12-7b32-7c80-87a1-000000000001/readings?page=2&limit=50",
    "next": "/installations/018f4a12-7b32-7c80-87a1-000000000001/readings?page=3&limit=50",
    "prev": "/installations/018f4a12-7b32-7c80-87a1-000000000001/readings?page=1&limit=50"
  }
}
```

#### B. Batch Ingestion Telemetry State Transition (`POST /installations/{id}/readings/batch`)
Successful write operations return contextual navigational links allowing the device or client to transition to analytical or operational views:

```http
HTTP/1.1 201 Created
Content-Type: application/json; charset=utf-8
```
```json
{
  "message": "Batch telemetry readings processed successfully.",
  "data": {
    "installation_id": "018f4a12-7b32-7c80-87a1-000000000001",
    "meter_id": "MTR-WP-COL-001",
    "total_received": 96,
    "inserted_count": 96,
    "duplicate_skipped_count": 0,
    "first_timestamp": "2026-10-08T00:00:00.000Z",
    "last_timestamp": "2026-10-08T23:45:00.000Z"
  },
  "_links": {
    "self": { "href": "/installations/018f4a12-7b32-7c80-87a1-000000000001/readings/batch" },
    "readings": { "href": "/installations/018f4a12-7b32-7c80-87a1-000000000001/readings" },
    "last_reading": { "href": "/installations/018f4a12-7b32-7c80-87a1-000000000001/last-reading" }
  }
}
```

---

## 4. Security & Cryptographic Jurisdictional Scoping

### 4.1 Zero-Trust Write-Read Security Split
The architecture decouples automated IoT meter ingestion from human analytical monitoring:
* **Write Path**: Hardware energy meters hold constrained JWT tokens containing a single capability claim (`installation:write:{installation_id}`). Hardware cannot read regional topology, query analytical histories, or post readings to unauthorized installations.
* **Read Path**: Administrative and analytical users authenticate via identity credentials, receiving role-scoped tokens bounded to jurisdictional entities (`national`, `provincial`, or `district`).

### 4.2 Role-Based Access Control (RBAC) Matrix

| Principal Type | Role Claim | Cryptographic Scopes | Authorized Endpoints | Boundary Enforcement & Rejection Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **National Analyst** | `national` | `read:national` | Unrestricted read access across all national, provincial, district, and installation resources. | Allowed everywhere on read path. Blocked from posting device readings without explicit device capability. |
| **Provincial Analyst** | `provincial` | `read:province:{province_id}` | Read access strictly within their designated province (districts, substations, installations). | Rejection with **HTTP 403 Forbidden** if requesting out-of-province districts, national summary (`/national/summary`), or other provincial scopes. |
| **District Analyst** | `district` | `read:district:{district_id}` | Read access strictly within their assigned district and its child installations. | Rejection with **HTTP 403 Forbidden** if requesting sibling districts, provincial collections, or national aggregates. |
| **IoT Hardware Meter** | `device` | `installation:write:{installation_id}` | `POST /installations/{id}/readings`<br>`POST /installations/{id}/readings/batch` | Rejection with **HTTP 403 Forbidden** if `{id}` in the URI does not match the token's `installation:write:{id}` claim. Read paths return **HTTP 403**. |

### 4.3 Transport Security & Quota Enforcement
* **Mandatory HTTPS Enforcement**: In production environments, unencrypted HTTP requests are rejected with **HTTP 403 Forbidden**.
* **Strict Transport Security (HSTS)**: The server emits `Strict-Transport-Security: max-age=31536000; includeSubDomains` on every response.
* **Sliding-Window Rate Limiting (RFC 6585)**: In-memory sliding-window throttling enforces an allocation quota (default: 300 requests per 15-minute window). When exceeded, the API returns **HTTP 429 Too Many Requests** with `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.

---

## 5. Comprehensive API Catalog

### 5.1 Endpoint Master Index

```
Authentication & Identity:
  POST /auth/login                       -> Issue user Bearer token (national, provincial, district)
  POST /auth/device-token                -> Mint hardware token for meter device
  GET  /auth/me                          -> Introspect principal claims and scopes

Topology Navigation:
  GET  /provinces                        -> Scoped province collection
  GET  /provinces/{id}/districts         -> Scoped districts under province
  GET  /districts/{id}/substations       -> Scoped substations under district
  GET  /substations/{id}/installations   -> Scoped installations under substation
  GET  /installations/{id}/composite     -> Composite resource with full lineage

Telemetry Ingestion & Operational Read:
  GET  /installations/{id}/last-reading  -> Derived single most recent reading
  POST /installations/{id}/readings      -> Single device ingestion write path
  POST /installations/{id}/readings/batch-> High-throughput batch ingestion (up to 500)
  GET  /installations/{id}/readings      -> Paginated analytical history (ETag, filters)

Grid Operations & Dashboards:
  GET  /districts/{id}/summary           -> District-level CTE window summary
  GET  /national/summary                 -> Country-level solar summary across 9 provinces

Health, Monitoring & Documentation:
  GET  /health                           -> Liveness probe
  GET  /health/ready                     -> Deep database readiness probe (latency ms)
  GET  /docs                             -> Interactive Swagger UI documentation
  GET  /docs/openapi.json                -> Raw OpenAPI 3.0 specification
```

### 5.2 Identity & Token Lifecycle Resources

#### `POST /auth/login`
* **Description**: Authenticates an SLSEA jurisdictional analyst and issues a signed JWT Bearer token.
* **Request Body**:
  ```json
  { "email": "western.provincial@slsea.gov.lk", "password": "Password123!" }
  ```
* **Success Status**: `200 OK`
* **Response Body**:
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "018f4a12-7b32-7c80-87a1-000000000099",
      "email": "western.provincial@slsea.gov.lk",
      "role": "provincial",
      "scopes": ["read:province:018f4a12-7b32-7c80-87a1-000000000001"],
      "jurisdiction_id": "018f4a12-7b32-7c80-87a1-000000000001"
    }
  }
  ```

#### `POST /auth/device-token`
* **Description**: Validates that an installation exists and mints a scoped hardware token.
* **Request Body**:
  ```json
  { "installation_id": "018f4a12-7b32-7c80-87a1-000000000001" }
  ```
* **Success Status**: `200 OK`
* **Response Body**:
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "device": {
      "installation_id": "018f4a12-7b32-7c80-87a1-000000000001",
      "meter_id": "MTR-WP-COL-001",
      "scope": "installation:write:018f4a12-7b32-7c80-87a1-000000000001"
    }
  }
  ```

#### `GET /auth/me`
* **Description**: Returns authenticated principal claims and active token scopes.
* **Headers**: `Authorization: Bearer <token>`
* **Success Status**: `200 OK`

---

### 5.3 Topological Hierarchy Traversal Resources

| Method | Endpoint | Required Scope | Response Content | Status Codes |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/provinces` | `read:national` or `read:province:*` | List of all 9 administrative provinces. | `200`, `401`, `403` |
| `GET` | `/provinces/{id}/districts` | Province boundary | Scoped collection of districts within province `{id}`. | `200`, `400`, `401`, `403`, `404` |
| `GET` | `/districts/{id}/substations` | District/Province boundary | Grid substations (GSS) within district `{id}`. | `200`, `400`, `401`, `403`, `404` |
| `GET` | `/substations/{id}/installations` | Substation parent boundary | Solar installations connected to GSS `{id}`. | `200`, `400`, `401`, `403`, `404` |
| `GET` | `/installations/{id}/composite` | Installation parent boundary | Composite installation metadata with parent substation, district, province, and operational aggregates. | `200`, `400`, `401`, `403`, `404` |

---

### 5.4 Telemetry Ingestion & Operational Read Resources

#### `POST /installations/{id}/readings`
* **Description**: Appends a single 15-minute telemetry reading from a physical meter.
* **Headers**: `Authorization: Bearer <device-token>`
* **Request Body**:
  ```json
  {
    "timestamp": "2026-10-08T12:00:00.000Z",
    "power_kw": 485.20,
    "energy_kwh": 14210.50,
    "voltage_v": 230.10
  }
  ```
* **Success Status**: `201 Created`
* **Headers Emitted**: `Location: /installations/{id}/readings/{reading_id}`

#### `POST /installations/{id}/readings/batch`
* **Description**: High-throughput ingestion of buffered telemetry (up to 500 readings) with automatic deduplication.
* **Headers**: `Authorization: Bearer <device-token>`
* **Request Body**:
  ```json
  {
    "readings": [
      { "timestamp": "2026-10-08T06:00:00.000Z", "power_kw": 12.5, "energy_kwh": 100.2, "voltage_v": 228.4 },
      { "timestamp": "2026-10-08T06:15:00.000Z", "power_kw": 28.4, "energy_kwh": 107.3, "voltage_v": 229.1 }
    ]
  }
  ```
* **Success Status**: `201 Created`

#### `GET /installations/{id}/last-reading`
* **Description**: Derived operational resource returning the single most recent reading for a site.
* **Success Status**: `200 OK`, `404 Not Found` (if installation has no readings).

#### `GET /installations/{id}/readings`
* **Description**: Paginated analytical historical readings supporting multi-dimensional filters, sorting, and conditional caching.
* **Query Parameters**:
  - `page` (integer, default: 1)
  - `limit` (integer, default: 50, max: 200)
  - `start_time` (ISO 8601, e.g., `2026-10-01T00:00:00Z`)
  - `end_time` (ISO 8601, e.g., `2026-10-08T23:59:59Z`)
  - `sort` (`timestamp` or `-timestamp`)
* **Caching & Precondition Headers**:
  - Emits: `ETag`, `Last-Modified`
  - Evaluates: `If-None-Match` $\rightarrow$ `304 Not Modified`, `If-Match` $\rightarrow$ `412 Precondition Failed`
  - Negotiation: `Accept: application/json` $\rightarrow$ `406 Not Acceptable` if mismatched.

---

### 5.5 Aggregated Grid Analytics Resources

#### `GET /districts/{id}/summary`
* **Description**: Single-query CTE + window function computing instantaneous generation, active site count, today's energy generation, and substation breakdown for a district.
* **Caching**: Emits SHA-256 `ETag`. Supports conditional `304 Not Modified`.
* **Sample Response**:
  ```json
  {
    "district_id": "018f4a12-7b32-7c80-87a1-000000000001",
    "district_name": "Colombo",
    "total_active_installations": 42,
    "current_total_power_kw": 18450.25,
    "today_total_energy_kwh": 89400.50,
    "substation_breakdown": [
      {
        "substation_id": "018f4a12-7b32-7c80-87a1-000000000010",
        "substation_name": "Pannipitiya GSS",
        "installation_count": 18,
        "current_power_kw": 7820.10
      }
    ]
  }
  ```

#### `GET /national/summary`
* **Description**: National grid macro summary rolling up all 9 provinces. Restricted exclusively to `national` role analysts.
* **Sample Response**:
  ```json
  {
    "country": "Sri Lanka",
    "total_active_installations": 210,
    "current_total_power_kw": 92450.75,
    "current_total_power_mw": 92.451,
    "today_total_energy_kwh": 412500.20,
    "today_total_energy_mwh": 412.500,
    "provinces_breakdown": [
      {
        "province_id": "018f4a12-7b32-7c80-87a1-000000000001",
        "province_name": "Western",
        "province_code": "WP",
        "active_installations_count": 65,
        "current_total_power_kw": 28450.50,
        "today_energy_kwh": 128900.00
      }
    ]
  }
  ```

---

### 5.6 Standardized Error Contract
Every 4xx/5xx error response conforms to a deterministic 4-field contract:

```json
{
  "code": "STRING_ERROR_CODE",
  "message": "Human-readable summary message.",
  "detail": "Specific technical detail, parameter name, or database constraint violation.",
  "timestamp": "2026-10-08T20:58:00.000Z"
}
```

#### HTTP Status Code & Database Exception Mapping

| Status Code | Standard Code | Trigger / Exception Mapped |
| :---: | :--- | :--- |
| **400** | `BAD_REQUEST` | Syntax error, malformed UUID parameter, inverted timestamp range. |
| **401** | `UNAUTHORIZED` | Missing or invalid `Authorization: Bearer <token>` header. |
| **403** | `FORBIDDEN` | Out-of-boundary jurisdictional access or device write mismatch. |
| **404** | `NOT_FOUND` | Target entity not found in the database. |
| **406** | `NOT_ACCEPTABLE` | Client `Accept` header does not include `application/json`. |
| **409** | `DUPLICATE_KEY_ERROR` | Database unique constraint violation (MySQL 1062 / Postgres 23505). |
| **412** | `PRECONDITION_FAILED` | RFC 7232 `If-Match` validation failure. |
| **422** | `FOREIGN_KEY_VIOLATION`<br>`VALIDATION_ERROR` | Relational foreign key constraint violation or schema attribute invalidity. |
| **429** | `TOO_MANY_REQUESTS` | Client exceeded sliding-window rate limit allocation. |
| **503** | `DATABASE_CONNECTION_TIMEOUT` | Database pool connection timeout or network partition (`ETIMEDOUT`). |

---

## 6. Setup and Execution Guide

### 6.1 System Prerequisites
* **Node.js**: `v18.0.0` or higher (tested on Node.js `v22.x`)
* **Package Manager**: `npm` (`v9.x` or higher)
* **Relational Database**: PostgreSQL `14+` (default) or MySQL `8.0+` / MariaDB `10.5+`

### 6.2 Environment Configuration
Clone the repository and copy the environment template:
```bash
cp .env.example .env
```

Edit `.env` to configure your database connection and secrets:
```ini
PORT=3000
NODE_ENV=development

# Database Dialect ('postgres' or 'mysql')
DB_DIALECT=postgres
DB_SSL=true

# Database Connection URI (Supabase / Neon / AWS RDS / Local)
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres?sslmode=require

# Connection Pool Settings
DB_POOL_MAX=10
DB_POOL_MIN=0

# JSON Web Token Secret for RBAC Auth
JWT_SECRET=super_secret_slsea_jwt_key_change_in_production
JWT_EXPIRES_IN=24h
```

### 6.3 Database Migration Execution
Apply the schema migrations to provision tables, foreign keys, and composite indexes:
```bash
npm run migrate
```
To roll back the most recent migration:
```bash
npm run migrate:undo
```

### 6.4 Diurnal Physics Seeder Execution
Execute the high-throughput seeding engine:
```bash
npm run seed
```
**Seeded Topology**:
* **9 Sri Lankan Provinces**: Western, Central, Southern, Northern, Eastern, North Western, North Central, Uva, Sabaragamuwa.
* **25 Administrative Districts**: Mapped directly to their parent provinces.
* **25 Grid Substations**: Distributed across districts with realistic voltage and MVA ratings.
* **200 Solar Installations**: Each provisioned with a distinct, indexed `meter_id`.
* **134,400 Generation Readings**: 1 full week of 15-minute readings per site (96 readings/day) calculated using the Sri Lankan diurnal insolation curve.

### 6.5 Server Execution & Live Documentation
Start the server in development mode:
```bash
npm run dev
```
Or in production mode:
```bash
npm start
```

Access the interactive OpenAPI 3.0 documentation:
* **Interactive Swagger UI**: [http://localhost:3000/docs](http://localhost:3000/docs)
* **Raw OpenAPI JSON**: [http://localhost:3000/docs/openapi.json](http://localhost:3000/docs/openapi.json)
* **Liveness Probe**: [http://localhost:3000/health](http://localhost:3000/health)
* **Database Readiness Probe**: [http://localhost:3000/health/ready](http://localhost:3000/health/ready)

---

## 7. Automated Test Suite Overview & Verification Evidence

### 7.1 Testing Pyramid Architecture
The test suite spans unit, integration, security, and edge-case validation without external test runners, executing directly via Node.js:

```
                          ▲
                         / \     [ ADVANCED SUITE ]: 53 Assertions (Batch, National CTE, Rate Limit)
                        /---\
                       /     \    [ ERROR & DOCS ]: 58 Assertions (4-Field Errors, DB Mapping, OpenAPI)
                      /-------\
                     /         \   [ DISTRICT SUMMARY ]: 16 Assertions (Single-Query CTE, Window Func)
                    /-----------\
                   /             \  [ READINGS UNIT ]: 16 Assertions (HATEOAS, Filters, ETag, Preconditions)
                  /---------------\
                 /                 \ [ SECURITY & RBAC ]: 24 Assertions (JWT, Device Scopes, HTTPS)
                /───────────────────\
```

### 7.2 Verification Test Matrix (204 Passing Assertions)

| Test Suite | Path | Assertions | Core Validations | Status |
| :--- | :--- | :---: | :--- | :---: |
| **Security & RBAC** | [`tests/test_auth_rbac.js`](tests/test_auth_rbac.js) | **24** | JWT bearer parsing, device write isolation (`installation:write:{id}`), cross-device tampering rejection (403), provincial/district jurisdictional boundary checks, HTTPS enforcement. | **PASS** (100%) |
| **Historical Readings** | [`tests/test_unit_readings.js`](tests/test_unit_readings.js) | **16** | Content negotiation (`Accept: text/html` $\rightarrow$ 406), HATEOAS envelope navigation, time range filters, SHA-256 ETag generation, conditional `304 Not Modified`, `412 Precondition Failed`. | **PASS** (100%) |
| **District Aggregation** | [`tests/test_district_summary.js`](tests/test_district_summary.js) | **16** | Single-query SQL optimization, `ROW_NUMBER() OVER` window function validation, `DATE(timestamp) = CURRENT_DATE` energy isolation, ETag conditional caching. | **PASS** (100%) |
| **Error Contract & Docs** | [`tests/test_error_and_docs.js`](tests/test_error_and_docs.js) | **58** | Standard 4-field error contract across all status codes (400, 401, 403, 404, 406, 412, 422), MySQL/Postgres foreign key/duplicate/timeout exception mapping, live Swagger UI HTML, OpenAPI 3.0 schema compliance. | **PASS** (100%) |
| **Advanced Features** | [`tests/test_advanced_features.js`](tests/test_advanced_features.js) | **53** | Database readiness ping latency probe, user authentication (`/auth/login`), hardware meter token minting, token introspection (`/auth/me`), batch ingestion (up to 500 items), cross-installation rejection, national summary CTE, sliding-window rate limiting. | **PASS** (100%) |
| **Postman Artifacts** | [`tests/test_postman_artifacts.js`](tests/test_postman_artifacts.js) | **37** | Postman Schema v2.1.0 compliance, environment variable mapping, script syntax validity, live simulated workflow for login, auth introspection, and negative error contracts. | **PASS** (100%) |
| **TOTAL** | **6 Test Suites** | **204** | **Zero Regressions Across All Enterprise Subsystems** | **100% PASS** |

### 7.3 Test Execution Runbook

Run each test suite independently:
```bash
# 1. Security & RBAC Suite
node tests/test_auth_rbac.js

# 2. Historical Analytical Readings Suite
node tests/test_unit_readings.js

# 3. Upper-Band District Summary Suite
node tests/test_district_summary.js

# 4. Error Contract & OpenAPI Documentation Suite
node tests/test_error_and_docs.js

# 5. Advanced Enterprise Features Suite
node tests/test_advanced_features.js

# 6. Postman Collection & Environment Verification Suite
node tests/test_postman_artifacts.js
```

Or execute all 204 verification assertions in batch:
```bash
npm run test:all
```

### 7.4 Postman Collection & Newman CI/CD Automation

The repository includes an enterprise Postman Collection v2.1 and Environment ready for manual testing or headless CI/CD execution:
* **Collection File**: [`postman_collection.json`](postman_collection.json) (32 requests across 6 folders)
* **Environment File**: [`postman_environment.json`](postman_environment.json) (Pre-configured credentials, test UUIDs, dynamic tokens)

#### Running with Newman CLI
To execute the complete automated API test suite headlessly via Newman:
```bash
# Install Newman globally (if not already installed)
npm install -g newman

# Execute entire collection against the active environment
newman run postman_collection.json -e postman_environment.json
```

Or generate an HTML test report:
```bash
npm install -g newman-reporter-htmlextra
newman run postman_collection.json -e postman_environment.json -r cli,htmlextra --reporter-htmlextra-export ./newman-report.html
```

---

## Licensing & Governance
This platform is developed for the **Sri Lanka Sustainable Energy Authority (SLSEA)** in accordance with the regulatory and technological frameworks of the **Ministry of Power and Energy, Sri Lanka**.

* **Author**: SLSEA Enterprise Software Engineering Team
* **License**: ISC License
* **Specification Compliance**: RFC 7231 (HTTP Semantics), RFC 7232 (Conditional Requests), RFC 5988 (Web Linking / HATEOAS), RFC 6585 (Additional HTTP Status Codes), RFC 6750 (Bearer Token Usage), RFC 4122 (UUID URN Namespace).
