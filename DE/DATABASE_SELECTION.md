# Database Selection and Architectural Justification

## 1. Selected Database Engine
- **Primary Database**: **PostgreSQL 17** (Relational Database Management System)
- **Data Access Layer**: **Prisma ORM 6** (`@prisma/client`) with native PostgreSQL driver
- **In-Memory Cache / Lock Broker**: Redis 7 Alpine (Distributed locks and worker heartbeat)

---

## 2. Nature of Data Stored in API Sentinel

API Sentinel manages five distinct categories of data:

1. **Transactional Metadata (Strong Consistency Required)**:
   - User identities, bcrypt password hashes, organizations, and role-based memberships (`OWNER`, `ADMIN`, `MEMBER`).
   - Monitored API Endpoint configurations (target URL, HTTP method, probe intervals, timeout limits, expected status codes, failure thresholds).
   - Strict relational integrity is non-negotiable: an endpoint cannot belong to a non-existent organization, and member access must be strictly validated.

2. **High-Velocity Time-Series Telemetry**:
   - Automated probe outcomes (`HealthCheck`) logged every 30–60 seconds across monitored APIs.
   - HTTP response status code, round-trip latency (in milliseconds), boolean health state, and timestamped error messages.
   - Requires rapid append-only writes, sequential range scans for historical charts, and aggregations (e.g. `P50`, `P95`, `P99` percentiles, uptime %).

3. **State-Driven Operational Incidents**:
   - Outage tracking records created after 3 consecutive probe failures.
   - Lifecycle state machine: `OPEN` ➔ `ACKNOWLEDGED` ➔ `RESOLVED`.
   - Requires atomic state transitions, concurrency deduplication (`occurrenceCount`), and auto-recovery triggers upon subsequent healthy probes.

4. **API Contract Version Specifications (Semi-Structured Documents)**:
   - OpenAPI 3.0 and 3.1 specifications in JSON and YAML formats.
   - Canonical SHA-256 specification hashes (`specHash`) to prevent duplicate version uploads and detect semantic drift.

5. **Directed Graph Dependencies & Blast Radius**:
   - Self-referential graph edges representing `Provider Service ➔ Consumer Service` relationships.
   - Downstream integration mappings (`Integration`) tracking consumer microservices, environments, criticality tiers (`CRITICAL`, `HIGH`, `MEDIUM`), and team alert emails.

---

## 3. Justification: Why PostgreSQL Over MongoDB?

| Criteria | PostgreSQL (Chosen Solution) | MongoDB (Alternative Evaluated) | Architectural Rationale for API Sentinel |
| :--- | :--- | :--- | :--- |
| **Data Integrity & Relationships** | **Strict Relational Integrity** with database-enforced Foreign Keys and cascading actions (`ON DELETE CASCADE`, `ON DELETE SET NULL`). | Unenforced references or embedded documents; application layer must handle orphans manually. | Deleting an endpoint must automatically cascade to its health checks, incidents, versions, and integrations without orphaned rows. |
| **ACID Transaction Guarantees** | **Full Multi-Row ACID Compliance** across complex operations. | Single-document atomicity; multi-document transactions exist but carry high latency overhead. | Updating an incident status while updating endpoint telemetry and recording diagnostic reports requires transactional atomicity. |
| **Query Flexibility & Analytics** | **Advanced SQL**: CTEs (`WITH`), Window Functions (`ROW_NUMBER() OVER PARTITION BY`), Filtered Aggregations (`COUNT(*) FILTER`), and complex joins. | Aggregation pipeline (`$lookup`, `$facet`) is verbose and slower for complex multi-table graph joins. | Calculating P95/P99 latency percentiles and extracting the single latest probe per endpoint is clean, fast, and standard in SQL. |
| **Data Redundancy & Normalization** | Supports **Third Normal Form (3NF)** with zero data duplication across organizations, users, and endpoints. | Favors denormalization/embedding; updating an endpoint name requires updating duplicate copies across all consumer documents. | Centralized updates: changing a service criticality or endpoint URL propagates instantly across the system. |
| **Semi-Structured Support (Hybrid)** | Native `TEXT` / `JSONB` support allows storing full OpenAPI schemas, headers, and AI diagnostic reports directly. | Native BSON/JSON document storage. | PostgreSQL offers the best of both worlds: strict relational integrity for core entities, plus JSON storage for OpenAPI contracts and AI reports. |
| **Concurrency & Distributed Operations** | B-Tree indexing, MVCC (Multi-Version Concurrency Control), and row-level locking (`FOR UPDATE`). | Document-level locking with optimistic concurrency. | Prevents duplicate incident creation when concurrent probe workers evaluate failing endpoints simultaneously. |

---

## 4. Suitability Summary

PostgreSQL was selected because API Sentinel's core domain is fundamentally **relational and state-driven**:
1. **Zero Orphaned Data**: When an API endpoint is decommissioned, PostgreSQL's foreign key constraints guarantee that thousands of related historical health checks and contract versions are cleanly removed.
2. **Deterministic Reporting**: Auditing SLAs, uptime percentages, and incident blast radiuses requires deterministic join semantics and mathematical aggregation functions that SQL excels at.
3. **Enterprise Compliance**: Multi-tenant organizations require provable data isolation that relational schemas and role-based foreign keys provide natively.
