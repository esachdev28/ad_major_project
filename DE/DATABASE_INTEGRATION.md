# Database and Backend Application Integration

## 1. Integration Architecture Overview

API Sentinel achieves high-performance data persistence and relational integrity by coupling an **Express.js** application layer with **PostgreSQL 17** via **Prisma ORM 6** (`@prisma/client`).

```text
┌─────────────────────────┐
│     React 18 SPA        │  (User Interface & Operations Dashboard)
└────────────┬────────────┘
             │ HTTP REST / JSON
             ▼
┌─────────────────────────┐
│     Express Server      │  (Routing, Rate Limiting, Authentication, SSRF Guard)
└────────────┬────────────┘
             │ JavaScript Calls
             ▼
┌─────────────────────────┐
│    Prisma ORM Client    │  (Type-Safe Query Builder & Connection Pool)
│    (lib/prisma.js)      │
└────────────┬────────────┘
             │ PostgreSQL Wire Protocol (libpq / TCP)
             ▼
┌─────────────────────────┐
│      PostgreSQL 17      │  (Relational Storage, B-Tree Indexes, ACID Transactions)
└─────────────────────────┘
```

---

## 2. Prisma Client Singleton & Connection Management

To avoid exhausting PostgreSQL database connections under high probe concurrency or serverless scaling, API Sentinel instantiates a single `PrismaClient` instance managed via `backend/lib/prisma.js`:

```javascript
// backend/lib/prisma.js
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  errorFormat: 'minimal',
});

module.exports = prisma;
```

### Key Architectural Benefits:
1. **Connection Pooling**: Prisma maintains an internal connection pool (default: $\text{num\_physical\_cpus} \times 2 + 1$), reusing active database connections across concurrent HTTP requests.
2. **Prepared Statements**: All Prisma queries are compiled into parameterized prepared statements, preventing SQL injection vulnerabilities by design.
3. **Graceful Teardown**: Upon server shutdown, `prisma.$disconnect()` is invoked to release open sockets cleanly.

---

## 3. Concrete Application CRUD Integration Evidence

The following production code extracts demonstrate how API Sentinel translates business logic into verified database operations:

### A. Insert Operation: Health Check Probe Recording
Every probe executed by the monitoring worker or manual user test persists a time-series record into `health_checks`:

```javascript
// backend/services/probeService.js
const check = await prisma.healthCheck.create({
  data: {
    endpointId: endpoint.id,
    statusCode,
    latency,
    isHealthy,
    errorMessage,
    checkedAt: new Date(),
  },
});
```
- **Underlying SQL Executed**:
  ```sql
  INSERT INTO "health_checks" ("id", "endpointId", "statusCode", "latency", "isHealthy", "errorMessage", "checkedAt")
  VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING "id", "checkedAt";
  ```

---

### B. Update Operation: Deduplicated Incident Lifecycle
When consecutive probe failures reach `failureThreshold`, the incident engine atomically updates or creates incidents:

```javascript
// backend/services/incidentService.js
if (existingIncident) {
  // Deduplicate repeat failures: Increment counter and update timestamp
  return await prisma.incident.update({
    where: { id: existingIncident.id },
    data: {
      occurrenceCount: { increment: 1 },
      lastFailureAt: new Date(),
      description: `${existingIncident.description}\n[${new Date().toISOString()}] Repeat failure: ${errorMessage || 'Probe failed'}`,
    },
  });
}
```
- **Underlying SQL Executed**:
  ```sql
  UPDATE "incidents" 
  SET "occurrenceCount" = "occurrenceCount" + 1, "lastFailureAt" = $1, "description" = $2
  WHERE "id" = $3;
  ```

---

### C. Automated Resolution on Healthy Recovery
When a previously failing service returns a successful HTTP probe, the system automatically marks open incidents as resolved:

```javascript
// backend/services/incidentService.js
await prisma.incident.updateMany({
  where: {
    endpointId,
    status: { in: ['OPEN', 'ACKNOWLEDGED'] },
  },
  data: {
    status: 'RESOLVED',
    resolvedAt: new Date(),
  },
});
```
- **Underlying SQL Executed**:
  ```sql
  UPDATE "incidents"
  SET "status" = 'RESOLVED', "resolvedAt" = NOW()
  WHERE "endpointId" = $1 AND "status" IN ('OPEN', 'ACKNOWLEDGED');
  ```

---

### D. Complex Read Operation: 24-Hour Latency Analytics
The dashboard computes `P50`, `P95`, `P99` percentiles and HTTP status distributions by querying time-windowed check logs:

```javascript
// backend/routes/dashboardRoutes.js
const checks = await prisma.healthCheck.findMany({
  where: {
    checkedAt: { gte: sinceDate },
  },
  select: {
    latency: true,
    statusCode: true,
    isHealthy: true,
    checkedAt: true,
  },
  orderBy: { checkedAt: 'asc' },
});
```

---

### E. Cascading Delete Operation: Clean Service Removal
When an endpoint is deleted, Prisma and PostgreSQL's foreign key integrity constraints delete all child health checks, versions, incidents, and integrations in a single atomic transaction:

```javascript
// backend/routes/endpointRoutes.js
await prisma.aPIEndpoint.delete({
  where: { id: req.params.id },
});
```
- **Relational Integrity Guarantees**:
  - `health_checks`: Deleted via `ON DELETE CASCADE`.
  - `incidents`: Deleted via `ON DELETE CASCADE`.
  - `api_versions`: Deleted via `ON DELETE CASCADE`.
  - `services.endpointId`: Safely set to `NULL` via `ON DELETE SET NULL` so microservice topology remains intact.

---

## 4. End-to-End Database Request Flow (Visual Trace)

```text
1. User clicks "Check Now" on React Endpoints UI
   │
   ▼
2. HTTP POST /api/endpoints/:id/check
   │
   ▼
3. Express router invokes runProbe(endpointId)
   │
   ▼
4. urlValidator executes SSRF DNS lookup against target URL
   │
   ▼
5. fetch() executes HTTP probe and measures response latency (e.g. 240 ms, 200 OK)
   │
   ▼
6. prisma.healthCheck.create() writes row to PostgreSQL
   │
   ▼
7. evaluateIncident(endpoint, isHealthy) checks if open incident needs auto-resolution
   │
   ▼
8. Express responds with JSON payload
   │
   ▼
9. React state re-renders latency badge and green health indicator!
```
