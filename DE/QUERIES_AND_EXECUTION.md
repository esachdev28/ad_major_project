# Project-Specific SQL Queries and Live Execution Report

## Overview
As mandated by Section 2.E of the Data Engineering (DE) guidelines, this document presents **10 meaningful, project-specific database operations** executed directly against API Sentinel's live **PostgreSQL 17** database.

Each query addresses an actual operational workflow of the platform (probing, alerting, incident deduplication, contract evolution, blast-radius calculation, and SLA reporting) rather than generic textbook examples. Every query includes:
1. **Business Requirement & Use Case**
2. **Database Concepts Covered**
3. **Full SQL Implementation**
4. **Detailed Technical Explanation (Joins, Indexing, Complexity)**
5. **Verified Live Execution Output from PostgreSQL**

---

### Query 1: INSERT with Safe Return Values (Endpoint Onboarding)

#### 1. Business Use Case:
When an engineering squad onboards a new microservice onto API Sentinel, the system must register the endpoint with its target URL, HTTP method, check interval, timeout limit, expected status code, and failure threshold, returning the newly generated identifier for immediate scheduling by the background probe worker.

#### 2. Concepts Covered:
- `INSERT INTO ... VALUES`
- Random Surrogate Key Generation with String Concatenation (`md5(random()::text)`)
- `RETURNING` clause to eliminate round-trip `SELECT` calls.

#### 3. SQL Query:
```sql
INSERT INTO api_endpoints (
    id, name, url, method, interval, timeout, "expectedStatus", 
    "failureThreshold", "isActive", "createdAt", "updatedAt"
)
VALUES (
    'test_ep_' || substr(md5(random()::text), 1, 8),
    'Synthetic Verification API',
    'https://httpbin.org/status/200',
    'GET',
    30,
    5000,
    200,
    3,
    true,
    NOW(),
    NOW()
)
RETURNING id, name, url, method, "expectedStatus";
```

#### 4. Technical Explanation:
The `RETURNING` clause instructs PostgreSQL to project the newly created row directly from the write operation buffer. This prevents the application from making an additional `SELECT` query, cutting latency by 50% and guaranteeing atomic access to generated default values.

#### 5. Live Execution Output:
```json
[
  {
    "id": "test_ep_5bdfcddb",
    "name": "Synthetic Verification API",
    "url": "https://httpbin.org/status/200",
    "method": "GET",
    "expectedStatus": 200
  }
]
```

---

### Query 2: UPDATE with Incident Lifecycle State Transition

#### 1. Business Use Case:
When an on-call Site Reliability Engineer (SRE) receives an alert regarding an active outage and acknowledges it on the incident dashboard, the system transitions all matching `OPEN` incidents to `ACKNOWLEDGED`, captures the exact acknowledgment timestamp (`NOW()`), and preserves the failure counter.

#### 2. Concepts Covered:
- `UPDATE ... SET`
- Filtering on indexed state column (`status = 'OPEN'`)
- Dynamic current timestamp injection (`NOW()`)
- `RETURNING` clause for UI state synchronization.

#### 3. SQL Query:
```sql
UPDATE incidents 
SET status = 'ACKNOWLEDGED', "acknowledgedAt" = NOW()
WHERE status = 'OPEN'
RETURNING id, "endpointId", title, status, severity, "occurrenceCount", "acknowledgedAt";
```

#### 4. Technical Explanation:
The update targets rows filtered by `status = 'OPEN'`. In API Sentinel, `incidents(status)` is backed by a B-Tree index (`idx_incidents_status`), allowing PostgreSQL to locate open outages via an Index Scan without scanning closed historical records.

#### 5. Live Execution Output:
```json
[
  {
    "id": "cmwdiput2001mgod68nstj71s",
    "endpointId": "cmwdipusj0008god68m6zw82h",
    "title": "HTTP 500 Internal Server Error on Payment Gateway",
    "status": "ACKNOWLEDGED",
    "severity": "HIGH",
    "occurrenceCount": 2552,
    "acknowledgedAt": "2026-11-22T17:16:27.554Z"
  }
]
```

---

### Query 3: DELETE with Referential Integrity & Cascade Verification

#### 1. Business Use Case:
When a deprecated service is decommissioned from the platform, the platform administrator deletes the endpoint. The database must clean up the endpoint while the foreign key `ON DELETE CASCADE` rule automatically cleans up all associated historical health checks and incident logs.

#### 2. Concepts Covered:
- `DELETE FROM ... WHERE`
- Parameterized ID filtering
- Foreign Key Referential Integrity enforcement.

#### 3. SQL Query:
```sql
DELETE FROM api_endpoints 
WHERE id = 'test_ep_5bdfcddb'
RETURNING id, name;
```

#### 4. Technical Explanation:
PostgreSQL checks all foreign key constraints referencing `api_endpoints(id)`. Because `health_checks`, `incidents`, `api_versions`, and `integrations` are declared with `ON DELETE CASCADE`, PostgreSQL issues internal cascading delete triggers, preventing orphaned child records.

#### 5. Live Execution Output:
```json
[
  {
    "id": "test_ep_5bdfcddb",
    "name": "Synthetic Verification API"
  }
]
```

---

### Query 4: SELECT with Multi-Condition Filtering, Latency Threshold & Sorting

#### 1. Business Use Case:
The SRE dashboard displays a live feed of severely degraded or failed probes. The query retrieves recent health checks where the target server either returned an error code (`isHealthy = false`) OR exhibited extreme latency (> 2000 ms), sorted chronologically descending.

#### 2. Concepts Covered:
- `SELECT ... WHERE (Condition A OR Condition B)`
- Boolean and range comparison operators (`= false`, `> 2000`)
- Multi-column ordering (`ORDER BY checkedAt DESC`)
- Bounded result sets (`LIMIT 5`).

#### 3. SQL Query:
```sql
SELECT id, "endpointId", "statusCode", latency, "isHealthy", "errorMessage", "checkedAt"
FROM health_checks
WHERE "isHealthy" = false OR latency > 2000
ORDER BY "checkedAt" DESC
LIMIT 5;
```

#### 4. Technical Explanation:
The query evaluates both error conditions and latency spikes. PostgreSQL utilizes the index on `checkedAt` to perform a backward index scan, quickly retrieving the latest failures without sorting the entire 10,000+ row table in memory.

#### 5. Live Execution Output:
```json
[
  {
    "id": "cmwo1xj780cxzli01lkklqllq",
    "endpointId": "cmwdipusj0008god68m6zw82h",
    "statusCode": 500,
    "latency": 687,
    "isHealthy": false,
    "errorMessage": "Expected HTTP 200, but remote server returned 500",
    "checkedAt": "2026-11-19T21:17:57.237Z"
  },
  {
    "id": "cmwo1w12w0cxnli0153uctm5k",
    "endpointId": "cmwdipusj0008god68m6zw82h",
    "statusCode": 500,
    "latency": 650,
    "isHealthy": false,
    "errorMessage": "Expected HTTP 200, but remote server returned 500",
    "checkedAt": "2026-11-19T21:16:47.097Z"
  },
  {
    "id": "cmwo1uj110cxjli01u17q4gzq",
    "endpointId": "cmwdipusj0008god68m6zw82h",
    "statusCode": 500,
    "latency": 669,
    "isHealthy": false,
    "errorMessage": "Expected HTTP 200, but remote server returned 500",
    "checkedAt": "2026-11-19T21:15:37.045Z"
  },
  {
    "id": "cmwo1t0y00cxbli01976f3ikx",
    "endpointId": "cmwdipusj0008god68m6zw82h",
    "statusCode": 500,
    "latency": 680,
    "isHealthy": false,
    "errorMessage": "Expected HTTP 200, but remote server returned 500",
    "checkedAt": "2026-11-19T21:14:26.953Z"
  },
  {
    "id": "cmwo1riwp0cx3li01kv4q5ha2",
    "endpointId": "cmwdipusj0008god68m6zw82h",
    "statusCode": 500,
    "latency": 701,
    "isHealthy": false,
    "errorMessage": "Expected HTTP 200, but remote server returned 500",
    "checkedAt": "2026-11-19T21:13:16.921Z"
  }
]
```

---

### Query 5: Fleet-Wide Aggregate Telemetry (Uptime % and Latency Metrics)

#### 1. Business Use Case:
The main executive dashboard displays overall system health across all monitored services, including total checks performed, minimum and maximum observed latencies, average fleet response time, and global uptime percentage.

#### 2. Concepts Covered:
- Aggregate functions: `COUNT(*)`, `MIN()`, `MAX()`, `AVG()`
- Filtered aggregation: `COUNT(*) FILTER (WHERE "isHealthy" = true)`
- Division-by-zero protection via `NULLIF()`
- Numerical rounding: `ROUND(..., 2)`.

#### 3. SQL Query:
```sql
SELECT 
    COUNT(*) AS total_probes,
    MIN(latency) AS min_latency_ms,
    MAX(latency) AS max_latency_ms,
    ROUND(AVG(latency), 2) AS avg_latency_ms,
    ROUND(100.0 * COUNT(*) FILTER (WHERE "isHealthy" = true) / NULLIF(COUNT(*), 0), 2) AS uptime_percentage
FROM health_checks;
```

#### 4. Technical Explanation:
Rather than running multiple passes over the table, PostgreSQL computes min, max, average, and conditional count in a single sequential heap scan using vectorized aggregation accumulators.

#### 5. Live Execution Output:
```json
[
  {
    "total_probes": 10698,
    "min_latency_ms": 0,
    "max_latency_ms": 11150,
    "avg_latency_ms": 1314.68,
    "uptime_percentage": 62.46
  }
]
```

---

### Query 6: GROUP BY with HAVING & Latency Degradation Analysis

#### 1. Business Use Case:
Identifies chronic failure hotspots by aggregating health check results per endpoint, calculating individual average latencies, and filtering only endpoints with sufficient sample size (`HAVING COUNT(h.id) > 10`), sorted by highest latency.

#### 2. Concepts Covered:
- `JOIN` between parent and child table
- `GROUP BY` multiple columns (`e.id, e.name, e.method`)
- Conditional counting (`COUNT(CASE WHEN ... THEN 1 END)`)
- Group-level filtering via `HAVING` clause.

#### 3. SQL Query:
```sql
SELECT 
    e.id AS endpoint_id,
    e.name AS endpoint_name,
    e.method,
    COUNT(h.id) AS total_checks,
    ROUND(AVG(h.latency), 2) AS avg_latency_ms,
    COUNT(CASE WHEN h."isHealthy" = false THEN 1 END) AS failure_count
FROM api_endpoints e
JOIN health_checks h ON e.id = h."endpointId"
GROUP BY e.id, e.name, e.method
HAVING COUNT(h.id) > 10
ORDER BY avg_latency_ms DESC;
```

#### 4. Technical Explanation:
PostgreSQL joins `api_endpoints` with `health_checks` using a Hash Join on `e.id = h.endpointId`, groups the resulting tuples into an in-memory HashAggregate buffer, filters groups failing the `HAVING` threshold, and sorts the final groups using quicksort.

#### 5. Live Execution Output:
```json
[
  {
    "endpoint_id": "cmwdipush0006god61xfxgvc1",
    "endpoint_name": "Inventory Warehouse API",
    "method": "GET",
    "total_checks": 2675,
    "avg_latency_ms": 1952.4,
    "failure_count": 462
  },
  {
    "endpoint_id": "cmwdipusj0008god68m6zw82h",
    "endpoint_name": "Payment Processing Gateway",
    "method": "POST",
    "total_checks": 2675,
    "avg_latency_ms": 1105.68,
    "failure_count": 2673
  },
  {
    "endpoint_id": "cmwdipuse0002god61qi4tte3",
    "endpoint_name": "User Authentication Service",
    "method": "GET",
    "total_checks": 2674,
    "avg_latency_ms": 1101.47,
    "failure_count": 439
  },
  {
    "endpoint_id": "cmwdipusg0004god6tqci478e",
    "endpoint_name": "Order Processing Service",
    "method": "GET",
    "total_checks": 2674,
    "avg_latency_ms": 1099.02,
    "failure_count": 442
  }
]
```

---

### Query 7: Multi-Table JOIN (Tenant Isolation & Incident Dashboard)

#### 1. Business Use Case:
Produces an organizational incident triage report by joining `organizations`, `api_endpoints`, and `incidents`. It reveals which workspace owns which service, how many total outages have occurred, and how many incidents are actively open right now.

#### 2. Concepts Covered:
- Multi-table `LEFT OUTER JOIN` (preserving endpoints with 0 incidents or unassigned organizations)
- `COALESCE()` for handling nullable foreign keys
- Multi-column aggregation and sorting.

#### 3. SQL Query:
```sql
SELECT 
    e.id AS endpoint_id,
    e.name AS endpoint_name,
    COALESCE(o.name, 'Unassigned Tenant') AS organization_name,
    COUNT(i.id) AS total_incidents,
    COUNT(CASE WHEN i.status = 'OPEN' THEN 1 END) AS active_incidents,
    MAX(i."lastFailureAt") AS latest_incident_at
FROM api_endpoints e
LEFT JOIN organizations o ON e."organizationId" = o.id
LEFT JOIN incidents i ON e.id = i."endpointId"
GROUP BY e.id, e.name, o.name
ORDER BY active_incidents DESC, total_incidents DESC;
```

#### 4. Technical Explanation:
The query uses `LEFT JOIN` to guarantee that endpoints without active incidents still appear with a count of 0 rather than being excluded from the dashboard. `COALESCE` provides a clean fallback for endpoints created prior to organization assignment.

#### 5. Live Execution Output:
```json
[
  {
    "endpoint_id": "cmwdipuse0002god61qi4tte3",
    "endpoint_name": "User Authentication Service",
    "organization_name": "Unassigned Tenant",
    "total_incidents": 30,
    "active_incidents": 0,
    "latest_incident_at": "2026-11-17T21:20:28.266Z"
  },
  {
    "endpoint_id": "cmwdipusg0004god6tqci478e",
    "endpoint_name": "Order Processing Service",
    "organization_name": "Unassigned Tenant",
    "total_incidents": 26,
    "active_incidents": 0,
    "latest_incident_at": "2026-11-17T21:20:28.266Z"
  },
  {
    "endpoint_id": "cmwdipush0006god61xfxgvc1",
    "endpoint_name": "Inventory Warehouse API",
    "organization_name": "Unassigned Tenant",
    "total_incidents": 24,
    "active_incidents": 0,
    "latest_incident_at": "2026-11-18T02:26:18.875Z"
  },
  {
    "endpoint_id": "cmwdipusj0008god68m6zw82h",
    "endpoint_name": "Payment Processing Gateway",
    "organization_name": "Unassigned Tenant",
    "total_incidents": 1,
    "active_incidents": 0,
    "latest_incident_at": "2026-11-19T21:17:57.237Z"
  }
]
```

---

### Query 8: Window Function (Latest Probe Extraction per Endpoint)

#### 1. Business Use Case:
The fleet monitoring UI requires the latest health status and response time for every registered endpoint without executing $N+1$ queries.

#### 2. Concepts Covered:
- Common Table Expression (`WITH ... AS`)
- Window Function: `ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ... DESC)`
- Filter on window projection (`WHERE rank = 1`).

#### 3. SQL Query:
```sql
WITH RankedChecks AS (
    SELECT 
        h.id,
        h."endpointId",
        e.name AS endpoint_name,
        h."statusCode",
        h.latency,
        h."isHealthy",
        h."checkedAt",
        ROW_NUMBER() OVER (
            PARTITION BY h."endpointId" 
            ORDER BY h."checkedAt" DESC
        ) as rank
    FROM health_checks h
    JOIN api_endpoints e ON h."endpointId" = e.id
)
SELECT "endpointId", endpoint_name, "statusCode", latency, "isHealthy", "checkedAt"
FROM RankedChecks
WHERE rank = 1
ORDER BY "checkedAt" DESC;
```

#### 4. Technical Explanation:
The `PARTITION BY h."endpointId"` clause partitions health check tuples into independent windows by endpoint, while `ORDER BY h."checkedAt" DESC` ranks rows within each partition. Filtering on `rank = 1` extracts precisely the latest probe per service in $O(N \log K)$ time.

#### 5. Live Execution Output:
```json
[
  {
    "endpointId": "cmwdipush0006god61xfxgvc1",
    "endpoint_name": "Inventory Warehouse API",
    "statusCode": 200,
    "latency": 1647,
    "isHealthy": true,
    "checkedAt": "2026-11-19T21:17:58.198Z"
  },
  {
    "endpointId": "cmwdipusj0008god68m6zw82h",
    "endpoint_name": "Payment Processing Gateway",
    "statusCode": 500,
    "latency": 687,
    "isHealthy": false,
    "checkedAt": "2026-11-19T21:17:57.237Z"
  },
  {
    "endpointId": "cmwdipusg0004god6tqci478e",
    "endpoint_name": "Order Processing Service",
    "statusCode": 200,
    "latency": 649,
    "isHealthy": true,
    "checkedAt": "2026-11-19T21:17:57.193Z"
  },
  {
    "endpointId": "cmwdipuse0002god61qi4tte3",
    "endpoint_name": "User Authentication Service",
    "statusCode": 200,
    "latency": 628,
    "isHealthy": true,
    "checkedAt": "2026-11-19T21:17:57.176Z"
  }
]
```

---

### Query 9: Correlated Subquery & Set Operations (High-Risk Anomaly Filter)

#### 1. Business Use Case:
Identifies critical risk endpoints that have had severe operational outages (`severity = 'CRITICAL'`) AND have experienced latency exceeding the global fleet average response time.

#### 2. Concepts Covered:
- Correlated Subquery with `EXISTS`
- Uncorrelated Subquery with Scalar Aggregate (`SELECT AVG(latency) FROM health_checks`)
- Set membership operator `IN (...)`.

#### 3. SQL Query:
```sql
SELECT 
    e.id, 
    e.name, 
    e.url, 
    e."failureThreshold"
FROM api_endpoints e
WHERE EXISTS (
    SELECT 1 FROM incidents i 
    WHERE i."endpointId" = e.id 
    AND i.severity = 'CRITICAL'
)
AND e.id IN (
    SELECT DISTINCT "endpointId" 
    FROM health_checks 
    WHERE latency > (SELECT AVG(latency) FROM health_checks)
);
```

#### 4. Technical Explanation:
The `EXISTS` clause performs an index probe on `incidents(endpointId)` and short-circuits as soon as a single matching `CRITICAL` record is found. The `IN` clause evaluates the scalar average latency ($1,314.68\text{ ms}$) once and filters endpoints possessing outlier spikes.

#### 5. Live Execution Output:
```json
[
  {
    "id": "cmwdipuse0002god61qi4tte3",
    "name": "User Authentication Service",
    "url": "https://httpbin.org/status/200",
    "failureThreshold": 3
  },
  {
    "id": "cmwdipusg0004god6tqci478e",
    "name": "Order Processing Service",
    "url": "https://httpbin.org/json",
    "failureThreshold": 3
  },
  {
    "id": "cmwdipush0006god61xfxgvc1",
    "name": "Inventory Warehouse API",
    "url": "https://httpbin.org/delay/1",
    "failureThreshold": 3
  }
]
```

---

### Query 10: Microservice Dependency Blast Radius & Alert Routing

#### 1. Business Use Case:
When an upstream provider service suffers an outage or deploys a breaking API change, this query performs dependency graph traversal across `services` and `service_dependencies`, returning all affected downstream consumer microservices, their criticality tier, and the engineering squad to notify.

#### 2. Concepts Covered:
- Self-referential graph join on `services` (Provider) and `services` (Consumer)
- Junction table join on `service_dependencies`
- Custom conditional ordering via `CASE WHEN ... THEN`.

#### 3. SQL Query:
```sql
SELECT 
    p.name AS provider_service,
    p.criticality AS provider_criticality,
    c.name AS consumer_service,
    c.criticality AS consumer_criticality,
    c."ownerTeam" AS alerting_team,
    sd."contractVersion",
    sd.notes
FROM service_dependencies sd
JOIN services p ON sd."providerId" = p.id
JOIN services c ON sd."consumerId" = c.id
ORDER BY 
    CASE c.criticality 
        WHEN 'CRITICAL' THEN 1 
        WHEN 'HIGH' THEN 2 
        WHEN 'MEDIUM' THEN 3 
        ELSE 4 
    END ASC;
```

#### 4. Technical Explanation:
The query implements relational graph edge traversal. Joining `service_dependencies` against `services` twice aliases the table as `p` (upstream provider) and `c` (downstream consumer). The `CASE` statement ensures high-priority consumer applications appear first in incident triage notifications.

#### 5. Live Execution Output:
```json
[
  {
    "provider_service": "Payment Processing Gateway",
    "provider_criticality": "CRITICAL",
    "consumer_service": "Mobile Application",
    "consumer_criticality": "CRITICAL",
    "alerting_team": "Mobile Engineering",
    "contractVersion": "1.0.0",
    "notes": "Initiates client checkout"
  },
  {
    "provider_service": "Payment Processing Gateway",
    "provider_criticality": "CRITICAL",
    "consumer_service": "Billing Service",
    "consumer_criticality": "HIGH",
    "alerting_team": "Finance Platform",
    "contractVersion": "1.0.0",
    "notes": "Captures settlement receipts"
  },
  {
    "provider_service": "Order Processing Service",
    "provider_criticality": "HIGH",
    "consumer_service": "Billing Service",
    "consumer_criticality": "HIGH",
    "alerting_team": "Finance Platform",
    "contractVersion": "1.0.0",
    "notes": "Reads finalized order totals"
  },
  {
    "provider_service": "Billing Service",
    "provider_criticality": "HIGH",
    "consumer_service": "Analytics Service",
    "consumer_criticality": "MEDIUM",
    "alerting_team": "Data Science",
    "contractVersion": "1.0.0",
    "notes": "Streams invoice metrics (transitive)"
  }
]
```
