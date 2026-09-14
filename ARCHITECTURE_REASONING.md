# Architecture Decision Record (ADR) & Design Reasoning

**Project:** Sri Lanka Sustainable Energy Authority (SLSEA) - Solar Generation Tracking Platform  
**Target Runtime:** Node.js / Express.js  
**Database:** PostgreSQL  
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
  1. **Write Amplification & Row Locking**: In PostgreSQL, every `UPDATE` on `solar_installations` creates a new row version (MVCC), causing table bloat and locking the parent record. Under concurrent telemetry streaming from hundreds of thousands of meters, this creates massive write bottlenecks.
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
  - **Type**: `UUID` with PostgreSQL `gen_random_uuid()`.
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
