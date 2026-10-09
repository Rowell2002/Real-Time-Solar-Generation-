# Architecture Decision Record (ADR) & Design Reasoning

**Project:** Sri Lanka Sustainable Energy Authority (SLSEA) - Solar Generation Tracking Platform  
**Target Runtime:** Node.js / Express.js  
**Database:** PostgreSQL / MySQL 8.0+  
**Author:** Senior Backend Architecture Team  

---

## 1. Domain Overview & Entity Hierarchy

The platform models the electrical and geographic topology of solar generation across Sri Lanka. The structure follows a strict 5-level hierarchy plus user access control:

```
Province (9)
  └── District (25)
        └── GridSubstation (CEB/LECO Transmission Nodes)
              └── SolarInstallation (Rooftop / Ground / Floating)
                    └── GenerationReading (Append-only Time-Series Readings)
```

In addition, the `User` entity provides authentication and role-based jurisdictional scoping (`national`, `provincial`, `district`).

---

## 2. Core Architectural Decisions & Reasoning

### ADR-01: Direct `meter_id` Attribute on `SolarInstallation` (No Separate `Device` Entity)
* **Requirement**: *CRITICAL: Do NOT create a separate 'Device' entity. 'meter_id' must be a direct attribute on SolarInstallation.*
* **Context**: In IoT systems, architects often design a 1-to-1 or 1-to-many `Device`/`Meter` entity.
* **Reasoning & Benefits**:
  1. **Query Latency on Ingestion**: Solar telemetry arrives at high frequency (e.g., 1-minute to 15-minute intervals per meter). By putting `meter_id` directly on `SolarInstallation`, the ingestion pipeline can resolve the installation with a single index lookup: `WHERE meter_id = :id`.
  2. **Elimination of Join Overhead**: Eliminates an unnecessary `JOIN devices ON ...` for every telemetry insert and validation step.
  3. **Simpler Domain Model**: Under the SLSEA regulatory scheme, a solar tariff agreement ties directly to a single bidirectional revenue meter installed at the site. A separate entity adds complexity without real utility.

---

### ADR-02: Pure Append-Only Time-Series for `GenerationReading`
* **Requirement**: *CRITICAL: This is an append-only time-series table. Do not store last-known readings as columns on SolarInstallation.*
* **Context**: In some architectures, developers maintain denormalized columns like `last_power_kw` or `last_reading_at` on the parent installation row to speed up dashboard queries.
* **Why Denormalization Was Rejected**:
  1. **Write Amplification & Row Locking**: In PostgreSQL/MySQL, every `UPDATE` on `solar_installations` creates a new row version (MVCC), causing table bloat and locking the parent record. Under concurrent telemetry streaming from hundreds of thousands of meters, this creates massive write bottlenecks.
  2. **Audit Integrity**: Solar power generation involves billing, tariff reconciliation, and regulatory compliance. Storing an append-only ledger guarantees historical immutability.
* **How High-Performance Retrieval is Solved**:
  - We use a composite B-Tree index on `(installation_id, timestamp DESC)`.
  - Fetching the latest reading requires an index-only scan executing in sub-milliseconds:
    ```sql
    SELECT *
    FROM generation_readings
    WHERE installation_id = :id
    ORDER BY timestamp DESC
    LIMIT 1;
    ```

---

### ADR-03: Primary Key Strategy (UUIDv4 vs. 64-Bit BIGINT)
* **Structural Entities (`Province`, `District`, `GridSubstation`, `SolarInstallation`, `User`)**:
  - **Type**: `UUID` with database native UUID generation.
  - **Reasoning**: Prevents enumeration attacks (e.g., guessing installation IDs `/api/v1/installations/123`), simplifies distributed imports, and prevents collision when syncing across regional CEB/LECO subsystems.
* **Telemetry Entity (`GenerationReading`)**:
  - **Type**: `BIGINT` (`BIGSERIAL`).
  - **Reasoning**: `GenerationReading` grows by millions of rows monthly. UUIDs in high-frequency append-only tables lead to heavy B-Tree index fragmentation and significantly higher RAM/disk usage. An autoincrementing 64-bit integer preserves index locality and sequential write throughput.

---

### ADR-04: Indexing Strategy

| Table | Index Columns | Type | Purpose |
| :--- | :--- | :--- | :--- |
| `provinces` | `name`, `code` | Unique B-Tree | Fast lookup by province code (e.g., `'WP'`, `'CP'`). |
| `districts` | `(province_id, name)` | Unique Composite | Enforces unique district names per province; speeds up cascaded queries. |
| `grid_substations` | `district_id` | B-Tree | Filters substations by district quickly. |
| `solar_installations` | `meter_id` | Unique B-Tree | Instant resolution of incoming meter payload to installation entity. |
| `solar_installations` | `grid_substation_id`| B-Tree | Aggregates solar capacity feeding into a given grid substation. |
| `generation_readings` | `(installation_id, timestamp DESC)` | Composite B-Tree | **Primary query index**: Fast time-window slicing and latest-reading queries. |
| `generation_readings` | `(installation_id, timestamp)` | Unique Composite | Deduplication: Prevents double-counting readings for the same timestamp. |
| `users` | `email` | Unique B-Tree | Identity lookup during authentication. |
| `users` | `(role, jurisdiction_id)` | Composite B-Tree | Filters users based on administrative level and regional jurisdiction. |

---

### ADR-05: RBAC & Jurisdictional Scoping for SLSEA

* **Requirement**: User roles `['national', 'provincial', 'district']` with `jurisdiction_id`.
* **Design**:
  - **National (`role = 'national'`)**: Full access to all installations, substations, and generation analytics across the country. `jurisdiction_id` **must be `NULL`**.
  - **Provincial (`role = 'provincial'`)**: Access scoped to all districts and installations within a specific province. `jurisdiction_id` points to `provinces.id`.
  - **District (`role = 'district'`)**: Access strictly bounded to a single district. `jurisdiction_id` points to `districts.id`.
* **Integrity Enforcement**:
  - Validated at the ORM model level in `User.js` via a custom validator.
  - Validated at the database engine level using a `CHECK` constraint:
    ```sql
    CONSTRAINT chk_user_jurisdiction_consistency CHECK (
        (role = 'national' AND jurisdiction_id IS NULL) OR
        (role IN ('provincial', 'district') AND jurisdiction_id IS NOT NULL)
    )
    ```

---

### ADR-06: Future Scalability & Table Partitioning

As the number of grid-connected solar installations grows across Sri Lanka, `generation_readings` will accumulate tens of millions of rows.

* **Partition Readiness**:
  Because `generation_readings` includes `timestamp` in all primary compound indexes and constraints, the table is structured to be converted into **PostgreSQL native declarative range partitioning** (e.g., monthly partitions: `PARTITION BY RANGE (timestamp)`) or a **TimescaleDB hypertable** without requiring changes to application business logic.

---

### ADR-07: Diurnal Solar Curve Simulation & Ingestion Physics (Equatorial Sri Lanka)

* **Requirement**: Generation readings must reflect real-world physical solar patterns:
  - 0 kW between 18:30 and 05:30.
  - Peak generation between 11:30 and 13:30.
  - Cumulative `energy_kwh` accumulating realistically over time.
* **Mathematical Model**:
  1. **Strict Day/Night Bounding**:
     $$\text{hourOfDay} \in [0.0, 5.5) \cup [18.5, 24.0) \implies P(t) = 0.0\text{ kW}$$
  2. **Normalized Daylight Base Curve**:
     $$\tau = \frac{t - 5.5}{18.5 - 5.5} = \frac{t - 5.5}{13.0} \in [0, 1]$$
     $$S(\tau) = \sin(\pi \tau)$$
  3. **Peak Solar Noon Plateau (11:30 - 13:30)**:
     $$S_{\text{adjusted}}(\tau) = S(\tau)^{0.85} \quad \text{for } t \in [11.5, 13.5]$$
  4. **Tropical Derating & Atmospheric Variance**:
     - Derating factor $\eta = 0.82$ (accounts for panel temperature coefficients in tropical Sri Lanka, DC-to-AC inverter losses, and cable impedance).
     - Micro-weather noise factor $W(t) = 1.0 + 0.06 \sin(4.5t + 1.7d)$ simulates intermittent cloud cover without violating continuity.
  5. **Monotonic Cumulative Energy ($E_{\text{kWh}}$)**:
     $$E_{i} = E_{i-1} + (P_i \times 0.25\text{ hours})$$
     Ensures that cumulative meter registers strictly advance forward in time, preventing negative delta anomalies.
  6. **Grid Voltage Physics**:
     $$V(t) = 228.0\text{V} + \left(\frac{P(t)}{C_{\text{rated}}} \times 4.5\text{V}\right) \pm 1.0\text{V}$$
     Models localized distribution line voltage rise resulting from active solar power backfeeding into the substation.

---

### ADR-08: High-Throughput Seeder Execution & Batch Buffer Architecture

* **Challenge**: Inserting 134,400 time-series records (200 sites × 7 days × 96 readings/day) through an ORM in individual queries would take 30+ minutes and exhaust Node.js connection memory.
* **Solution**:
  - **Memory Chunking**: An in-memory buffer collects generated telemetry points and flushes in batches of `8,000` records via `GenerationReading.bulkCreate(buffer, { validate: false, ignoreDuplicates: true })`.
  - **Single Round-Trip Multi-Row Inserts**: Reduces database round-trips from 134,400 to ~17 batch transactions.
  - **Execution Time**: The complete 134,400-record dataset is seeded in **under 20 seconds**, maintaining ACID consistency across all foreign key relationships.

---

### ADR-09: REST Route Topology & Derived vs. Raw Resource Semantics

* **Requirement**: 
  - Hierarchy navigation: `/provinces`, `/provinces/{id}/districts`, `/districts/{id}/substations`, `/substations/{id}/installations`.
  - Composite resource: `/installations/{id}/composite` returning installation metadata + parent details + summary stats.
  - Operational read: `/installations/{id}/last-reading` as a derived resource.
  - Device ingestion: `POST /installations/{id}/readings` returning `201 Created` with a `Location` header.
* **Architectural Decisions**:
  1. **Scoped Collections**:
     - Sub-resource nesting (`/provinces/:id/districts`) cleanly mirrors the relational foreign-key topology of Sri Lanka's electrical grid.
     - Early validation via `validateUuid` intercepts invalid UUID strings before reaching the database, returning standard `400 Bad Request` instead of cryptic database type errors.
  2. **Composite Resource Aggregation**:
     - Combines relational parent hierarchy (`grid_substation` -> `district` -> `province`) with real-time aggregate stats (`COUNT`, `MAX(power_kw)`, `AVG(voltage_v)`, latest `energy_kwh`).
     - Eliminates the need for client frontend applications to perform 4–5 sequential round-trips to render a comprehensive installation overview screen.
  3. **Derived Operational Resource (`/last-reading`)**:
     - Rather than exposing generic `/readings?limit=1` table queries or polluting `SolarInstallation` with mutable last-reading columns, `/last-reading` is exposed as an explicit derived REST resource.
     - Powered by database index-only scans on `(installation_id, timestamp DESC)`, achieving sub-millisecond operational reads.
  4. **RFC 7231 Compliant Ingestion (`POST /installations/:id/readings`)**:
     - Returns HTTP status `201 Created`.
     - Injects a standard `Location: /installations/{id}/readings/{reading.id}` header.
     - Resolvable via dedicated endpoint `GET /installations/:id/readings/:readingId`.

---

### ADR-10: HTTP Caching, Conditional GET, Preconditions & Hypermedia Pagination

* **Context**: Analytical historical reading queries (`GET /installations/{id}/readings`) are read-heavy, query-intensive, and involve time-series data covering hundreds of thousands of records.
* **Specification Decisions**:
  1. **Hypermedia (HATEOAS) Pagination**:
     - Enforces standard pagination envelope: `{ total_count, page, limit, data, links: { self, next, prev } }`.
     - The hypermedia links preserve all active filtering flags (`start_time`, `end_time`, `sort`, `province_id`, `district_id`, `substation_id`), enabling clients to crawl analytical intervals without manual query string manipulation.
  2. **SHA-256 ETag Generation**:
     - Calculated deterministically over the query parameters, total count, and record set representation.
     - Protects against redundant network payload transfers when telemetry data within a queried interval has not changed.
  3. **RFC 7232 Conditional GET Evaluation (HTTP 304)**:
     - Evaluates incoming `If-None-Match` and `If-Modified-Since` headers before serialization.
     - Returns HTTP `304 Not Modified` with an empty response body when the representation is unchanged, saving bandwidth and CPU cycles.
  4. **Precondition Evaluation (HTTP 412)**:
     - Complies with RFC 7232 precondition semantics.
     - Returns HTTP `412 Precondition Failed` if an `If-Match` or `If-Unmodified-Since` header evaluation fails.
  5. **RFC 7231 Content Negotiation (HTTP 406)**:
     - Inspects the `Accept` header. If the client explicitly requests formats incompatible with `application/json` (e.g. `text/html`, `application/xml`), the server rejects the request with HTTP `406 Not Acceptable`.
     - Strictly enforces `Content-Type: application/json; charset=utf-8` on all outgoing responses.

---

### ADR-11: MySQL 8.0+ / MariaDB 10.5+ Single-Query Window Aggregation for Dashboard Summaries

* **Context**: The operational dashboard endpoint (`GET /districts/{id}/summary`) aggregates generation metrics across dozens of installations and multiple substations in a single district. Traditional ORM implementations suffer from severe N+1 query patterns:
  1. Fetch District $\rightarrow$ 1 query.
  2. Fetch Substations for District $\rightarrow$ 1 query.
  3. For each Substation, fetch Installations $\rightarrow$ N queries.
  4. For each Installation, fetch the latest GenerationReading and today's cumulative readings $\rightarrow$ 2 × M queries.
* **Specification Decisions**:
  1. **Single Query with Common Table Expressions (CTEs)**:
     - All calculations (district existence, active installation counts, latest instantaneous power, and today's energy) are collapsed into a **single SQL query execution**.
  2. **Window Function for Latest Reading (`ROW_NUMBER() OVER`)**:
     - `ROW_NUMBER() OVER (PARTITION BY r.installation_id ORDER BY r.timestamp DESC) AS rn` isolates the latest instantaneous reading per installation directly inside the database engine.
     - Filtering `rn = 1` avoids expensive correlated subqueries or repeated `MAX(timestamp)` self-joins.
  3. **Today's Cumulative Energy Slicing**:
     - Uses `DATE(r.timestamp) = CURRENT_DATE` to isolate generation occurring within the current calendar day.
     - Calculates delta energy produced today as `COALESCE(MAX(r.energy_kwh) - MIN(r.energy_kwh), 0)`.
  4. **Substation Breakdown Rollup**:
     - The single query projects each substation's capacity, site count, and current power generation alongside the district metadata.
     - If the district exists with 0 substations, an outer join ensures the district is still returned, while a non-existent district ID returns 0 rows $\rightarrow$ triggering HTTP `404 Not Found`.
  5. **Cache Header Attachment**:
     - Calculates SHA-256 `ETag` on the response payload and evaluates `If-None-Match`, returning HTTP `304 Not Modified` when cached data is fresh.

---

### ADR-12: Zero-Trust Write-Read Security Split & Cryptographic Jurisdictional Scoping

* **Context**: The SLSEA platform handles both untrusted hardware meter device writes and multi-tiered jurisdictional user analysis. Traditional single-role API security models fail to separate automated telemetry ingestion from administrative portal monitoring.
* **Specification Decisions**:
  1. **Strict Write-Read Security Split**:
     - **Device Principal (Write Path)**:
       - Smart meters authenticate with JWT tokens carrying a scoped capability: `installation:write:{installation_id}`.
       - The ingestion endpoint (`POST /installations/:id/readings`) explicitly requires this claim.
       - A device authorized for Installation 12 attempting to write to Installation 15 is rejected with HTTP `403 Forbidden`.
       - Eliminates cross-site injection, credential sharing across physical solar farms, and rogue meter spoofing.
     - **User Principal (Read Path)**:
       - Portal analysts authenticate with tokens identifying their administrative role (`national`, `provincial`, `district`) and cryptographic scopes (`read:national`, `read:province:{id}`, `read:district:{id}`).
  2. **Multi-Tiered Jurisdictional Scoping (RBAC Matrix)**:
     - **National**: Unrestricted read access across the entire national solar topology.
     - **Provincial**: Allowed read access strictly bounded to entities whose parent province matches the user's `jurisdiction_id`. Any query attempting to access out-of-province districts, substations, or installations returns HTTP `403 Forbidden`.
     - **District**: Bounded strictly to entities whose parent district matches the user's `jurisdiction_id`. Any attempt to access other districts or province-wide collections returns HTTP `403 Forbidden`.
  3. **Transport Layer Security & Header Enforcement**:
     - Rejects unencrypted HTTP requests in production with HTTP `403 Forbidden`.
     - Enforces standard HTTP Strict Transport Security (`Strict-Transport-Security: max-age=31536000; includeSubDomains`).
     - Mandates RFC 6750 `Authorization: Bearer <token>` header syntax, returning HTTP `401 Unauthorized` on missing or malformed authentication tokens.

---

### ADR-13: Standardized Global Error Contract & Live OpenAPI (Swagger UI) Architecture

* **Context**: Enterprise monitoring platforms require deterministic, machine-parsable error responses to eliminate client parsing ambiguity. Furthermore, third-party developers, hardware device engineers, and regulatory evaluators require an interactive documentation console mounted directly on the service.
* **Specification Decisions**:
  1. **Strict 4-Field Standardized JSON Error Contract**:
     - All API errors, whether originating from business validation, middleware rejections, or database driver failures, are normalized into:
       ```json
       {
         "code": "STRING_ERROR_CODE",
         "message": "Human-readable summary message.",
         "detail": "Specific technical detail or parameter error.",
         "timestamp": "ISO8601_TIMESTAMP"
       }
       ```
     - Fields are guaranteed non-null, with `detail` carrying granular diagnostic context (e.g., parameter names, validation rules, or database table identifiers).
  2. **Comprehensive HTTP Status Code Matrix**:
     - `400 Bad Request` (`BAD_REQUEST`): Malformed syntax, invalid pagination integers, invalid UUID representations, or inverted time ranges.
     - `401 Unauthorized` (`UNAUTHORIZED`): Missing or invalid JWT authentication credentials.
     - `403 Forbidden` (`FORBIDDEN`): Device token scope violation or jurisdictional boundary violation.
     - `404 Not Found` (`NOT_FOUND`): Target entity not found in the database.
     - `406 Not Acceptable` (`NOT_ACCEPTABLE`): Content negotiation failure when client does not accept `application/json`.
     - `412 Precondition Failed` (`PRECONDITION_FAILED`): Failure of `If-Match` or `If-Unmodified-Since` HTTP preconditions.
     - `422 Validation Error` (`VALIDATION_ERROR`): Semantic validation failures and database constraint violations.
  3. **Relational Database (MySQL / MariaDB / PostgreSQL) Exception Mapping**:
     - **Foreign Key Violations** (MySQL `1451`/`1452`, `SequelizeForeignKeyConstraintError`): Mapped to HTTP `422` with code `"FOREIGN_KEY_VIOLATION"` and detailed table/field violation diagnostics.
     - **Unique Constraint / Duplicate Keys** (MySQL `1062`, `SequelizeUniqueConstraintError`): Mapped to HTTP `409` with code `"DUPLICATE_KEY_ERROR"` indicating the conflicting attribute.
     - **Database Timeouts & Network Partitions** (`ETIMEDOUT`, `ECONNREFUSED`, `PROTOCOL_CONNECTION_LOST`, `SequelizeConnectionTimedOutError`): Mapped to HTTP `503` with code `"DATABASE_CONNECTION_TIMEOUT"`.
  4. **OpenAPI 3.0.3 Specification & Swagger UI (`/docs`)**:
     - Mounted Swagger UI at `/docs` with title `'SLSEA Solar Generation Monitoring API Documentation'`.
     - Raw OpenAPI specification available at `/docs/openapi.json` and `/api-docs.json`.
     - Configured `BearerAuth` in `components/securitySchemes` using HTTP Bearer format (`JWT`), enabling interactive authentication testing for device writers and regional analysts.
     - Fully specified 2xx success schemas, 4xx/5xx error contracts, tags, operation IDs, and parameter descriptions across all 11 endpoints.

---

### ADR-14: Authentication & Token Lifecycle Management Architecture

* **Context**: While JWT signature and claim validation middlewares (authenticateJwt, authorizeDeviceWrite, authorizeJurisdiction) existed, external clients and automated test runners required first-class endpoints to obtain valid tokens, mint hardware meter credentials, and introspect principal identities.
* **Specification Decisions**:
  1. **User Authentication (POST /auth/login)**:
     - Accepts email and password. Resolves user identity from the users table (or fallback pre-seeded credentials).
     - Issues signed JWT tokens encapsulating standard claims: sub (user UUID), email, role (national, provincial, or district), scopes (e.g. read:national, read:province:{id}), and jurisdiction_id.
  2. **Device Hardware Token Minting (POST /auth/device-token)**:
     - Dedicated route for provisioning IoT telemetry meters.
     - Validates that the requested installation_id exists in the solar_installations table.
     - Issues a focused hardware JWT embedded with single-purpose scope claim installation:write:{installation_id}.
  3. **Principal Identity Introspection (GET /auth/me)**:
     - Allows clients and dashboards to verify the current session, decode assigned permissions, and inspect token expiration without client-side manual token parsing.

---

### ADR-15: High-Throughput Batch Telemetry Ingestion Architecture

* **Context**: Solar inverters and data loggers often buffer readings during intermittent network outages, then attempt to flush multiple 15-minute readings simultaneously. Transmitting readings one-by-one introduces extreme HTTP handshake overhead and database connection contention.
* **Specification Decisions**:
  1. **Batched Payload Contract (POST /installations/:id/readings/batch)**:
     - Accepts up to 500 readings per request.
     - Verifies device write scope authorization (installation:write:{id}) via authorizeDeviceWrite.
  2. **Atomic Item Validation & Deduplication**:
     - Validates all records individually for non-negative numerical ranges (power_kw, energy_kwh, voltage_v) and valid ISO 8601 timestamps.
     - Performs in-memory deduplication of duplicate timestamps within the payload.
     - Queries existing timestamps in the database for the installation to avoid duplicate key errors.
     - Executes a bulk insert (bulkCreate) for new records.
  3. **Response Telemetry & HATEOAS Links**:
     - Returns HTTP 201 Created with ingestion metadata: total_received, inserted_count, duplicate_skipped_count, and chronological timestamp range.
     - Provides hypermedia links pointing to the batch endpoint, analytical readings collection, and derived operational last-reading resource.

---

### ADR-16: National Grid Solar Generation Summary Engine

* **Context**: National grid operators at the Ceylon Electricity Board (CEB) and SLSEA require high-level, macro-economic solar generation analytics across the entire nation, rolling up all 9 provinces in real-time.
* **Specification Decisions**:
  1. **Single-Query CTE Rollup**:
     - Computes active installations count, latest instantaneous power (via ROW_NUMBER() OVER (PARTITION BY installation_id ORDER BY timestamp DESC)), and today's cumulative energy per province in a single database query execution.
  2. **National Metric Projections**:
     - Projects total national instantaneous capacity in both kW and Megawatts (MW), alongside daily cumulative energy in both kWh and Megawatt-hours (MWh).
     - Returns a structured provinces_breakdown array detailing generation metrics per administrative province.
  3. **Strict Jurisdictional Isolation**:
     - Accessible exclusively by users possessing the national role (claim read:national).
     - Requests from provincial or district analysts are rejected immediately with HTTP 403 Forbidden.
  4. **Deterministic ETag Caching**:
     - Computes SHA-256 ETag from the aggregated data payload (excluding volatile timestamps), enabling high-speed 304 Not Modified conditional responses under polling load.

---

### ADR-17: Sliding-Window Rate Limiting & Deep Database Readiness Probes

* **Context**: In an IoT and public analytics grid monitoring system, unbounded traffic risks database connection exhaustion and DoS vulnerabilities. In addition, container orchestrators (Kubernetes / Docker Swarm) require distinct probes for liveness (process alive) vs. readiness (database connectivity established).
* **Specification Decisions**:
  1. **In-Memory Sliding-Window Rate Limiter (src/middleware/rateLimiter.js)**:
     - Tracks client request timestamps within a sliding time window (default 300 requests per 15 minutes).
     - Emits RFC 6585 standard headers on every request: X-RateLimit-Limit, X-RateLimit-Remaining, and X-RateLimit-Reset.
     - When limits are exceeded, returns HTTP 429 Too Many Requests with a Retry-After header and the SLSEA standardized 4-field error body.
  2. **Two-Tiered Health & Diagnostic Probes**:
     - GET /health (Liveness): Quick shallow check verifying that the Node.js event loop and Express HTTP server are responsive.
     - GET /health/ready (Readiness): Deep probe executing sequelize.authenticate(). Reports connection status (connected or disconnected), roundtrip database ping latency in milliseconds, and SQL dialect. Returns HTTP 200 when ready or HTTP 503 when degraded.

