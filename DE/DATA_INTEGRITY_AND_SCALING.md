# Data Integrity, Indexing & High-Volume Scaling Architecture

## 1. Data Integrity & Validation Architecture

API Sentinel implements defense-in-depth data integrity across three distinct layers:
1. **Database-Level Constraints (PostgreSQL)**
2. **Data-Access Layer (Prisma ORM Types & Enums)**
3. **Application & Request Validation (Zod Schemas & Domain Rules)**

---

### A. Database-Level Constraints

| Constraint Type | Table & Column | Implementation | Business Purpose |
| :--- | :--- | :--- | :--- |
| **Primary Keys** | All 9 tables | `id VARCHAR(30) PRIMARY KEY` | Guarantees entity uniqueness using collision-resistant CUIDs. |
| **Foreign Keys with Cascading** | `health_checks(endpointId)`<br>`incidents(endpointId)`<br>`api_versions(endpointId)` | `REFERENCES api_endpoints(id) ON DELETE CASCADE` | Prevents orphaned records. Deleting a service cleanly purges all telemetry. |
| **Foreign Keys with Nulling** | `services(endpointId)`<br>`diagnostic_reports(endpointId)` | `REFERENCES api_endpoints(id) ON DELETE SET NULL` | Deleting a monitored URL does not destroy the microservice topology or historical AI audit reports. |
| **Unique Constraints** | `users(email)`<br>`organizations(slug)` | `UNIQUE(email)`<br>`UNIQUE(slug)` | Prevents duplicate user accounts and collision in URL tenant routing. |
| **Composite Unique Keys** | `organization_members`<br>`service_dependencies` | `UNIQUE(organizationId, userId)`<br>`UNIQUE(providerId, consumerId)` | Prevents duplicate memberships and duplicate dependency edges between services. |
| **Self-Dependency Check** | `service_dependencies` | `CHECK (providerId <> consumerId)` | Prohibits cyclic self-dependency graph edges at the database engine level. |
| **Domain Range Checks** | `api_endpoints(interval)`<br>`api_endpoints(expectedStatus)` | `CHECK (interval >= 5)`<br>`CHECK (expectedStatus BETWEEN 100 AND 599)` | Prevents DoS probe frequencies (< 5s) and malformed HTTP status codes. |
| **Lifecycle State Checks** | `incidents(status)`<br>`incidents(severity)` | `CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED'))`<br>`CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM'))` | Enforces valid finite state machine transitions in the database. |

---

## 2. Indexing Strategy & Performance Proof

### Index Inventory and Access Patterns

```text
Table: health_checks (10,000+ rows)
├── idx_health_checks_composite  ON (endpointId, checkedAt DESC)  <-- Critical for timeseries lookups
├── idx_health_checks_time       ON (checkedAt)                   <-- Range scans for 24h charts
└── idx_health_checks_endpoint   ON (endpointId)                  <-- Foreign key join speedup

Table: incidents
├── idx_incidents_status         ON (status)                      <-- Fast filtering for active OPEN outages
└── idx_incidents_endpoint       ON (endpointId)                  <-- Endpoint incident lookups

Table: api_versions
└── idx_api_versions_spechash    ON (specHash)                    <-- O(1) duplicate spec rejection
```

### Performance Proof: Composite Index Optimization
A frequent query in API Sentinel retrieves the last 10 probes for an endpoint:
```sql
SELECT statusCode, latency, checkedAt 
FROM health_checks 
WHERE endpointId = 'cmwdipuse0002god61qi4tte3' 
ORDER BY checkedAt DESC 
LIMIT 10;
```

#### Execution Plan with Composite Index `(endpointId, checkedAt DESC)`:
```text
Limit  (cost=0.29..8.50 rows=10 width=16)
  ->  Index Scan using idx_health_checks_composite on health_checks
        Index Cond: ("endpointId" = 'cmwdipuse0002god61qi4tte3'::text)
Execution Time: 0.045 ms
```
- **Analysis**: The database executes a direct B-Tree index scan in **0.045 ms**, without reading the entire table or executing an in-memory sort buffer.

---

## 3. High-Volume Scaling & Data Growth Architecture

As API Sentinel scales from monitoring 5 APIs to thousands of endpoints generating millions of daily probe pings, the database architecture supports three scaling tiers:

### Tier 1: Declarative Table Partitioning for `health_checks`
Because health check logs are append-only time-series data, the `health_checks` table can be partitioned by range on `checkedAt`:

```sql
-- Declarative Range Partitioning Example
CREATE TABLE health_checks_partitioned (
    id VARCHAR(30) NOT NULL,
    "endpointId" VARCHAR(30) NOT NULL,
    "statusCode" INTEGER,
    latency INTEGER,
    "isHealthy" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    PRIMARY KEY (id, "checkedAt")
) PARTITION BY RANGE ("checkedAt");

-- Monthly Partitions:
CREATE TABLE health_checks_2026_11 PARTITION OF health_checks_partitioned
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

CREATE TABLE health_checks_2026_12 PARTITION OF health_checks_partitioned
    FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
```

#### Scaling Advantages:
- **Instant Partition Pruning**: A query for `checkedAt >= NOW() - INTERVAL '24 hours'` scans only the current month's partition, ignoring older data.
- **Zero-Downtime Data Purging**: Old partitions can be dropped instantly via `DROP TABLE health_checks_2026_01;` in $O(1)$ time, eliminating heavy `DELETE` table bloat.

---

### Tier 2: Connection Pooling with PgBouncer
To support high concurrency from distributed probe workers:
- Implement **PgBouncer** in transaction pooling mode.
- Reduces connection overhead by maintaining a persistent pool of 20–50 PostgreSQL backend connections while serving thousands of ephemeral worker probe requests.

---

### Tier 3: Analytical Read Replicas
- The React dashboard requests aggregations (`P50`, `P95`, `P99`, uptime %) every few seconds.
- By configuring PostgreSQL streaming replication, heavy read traffic is offloaded to read replicas, ensuring the primary database instance dedicates 100% of its I/O to low-latency probe inserts and incident writes.
