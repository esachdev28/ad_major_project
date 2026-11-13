# 🛡️ API Sentinel — API Reliability & Compatibility Intelligence Platform

**Tagline:** *Observe. Detect. Analyze. Diagnose.*

**API Sentinel** is a full-stack API observability, automated health monitoring, OpenAPI breaking-change detection, dependency blast-radius analysis, Model Context Protocol (MCP), and AI-assisted incident investigation platform.

---

## 📋 Table of Contents

1. [Architecture & Technology Stack](#1-architecture--technology-stack)
2. [Implemented Capabilities](#2-implemented-capabilities)
3. [Project Structure](#3-project-structure)
4. [Prerequisites & Local Setup](#4-prerequisites--local-setup)
5. [Docker Background Worker & Redis](#5-docker-background-worker--redis)
6. [Database Schema (Prisma ORM 6)](#6-database-schema-prisma-orm-6)
7. [Backend REST API Reference](#7-backend-rest-api-reference)
8. [Model Context Protocol (MCP) Server](#8-model-context-protocol-mcp-server)
9. [AI-Assisted Diagnostics (NVIDIA NIM)](#9-ai-assisted-diagnostics-nvidia-nim)
10. [Security Protections](#10-security-protections)
11. [Automated Test Suite](#11-automated-test-suite)
12. [Known Limitations](#12-known-limitations)
13. [End-to-End Database Request Flow](#13-end-to-end-database-request-flow)
14. [Quick CLI Verification](#14-quick-cli-verification)
15. [Troubleshooting & Verification](#15-troubleshooting--verification)

---

## 1. Architecture & Technology Stack

- **Frontend:** React 18, Vite 6, JavaScript (ES6+), Custom SaaS Dark-Navy CSS (served statically by Express on port `5001` with zero-CORS unified origin).
- **Backend:** Node.js, Express.js, Prisma ORM 6 (`prisma`, `@prisma/client`), `js-yaml`, `ioredis`, `zod`.
- **Database:** Local PostgreSQL 17 (`api_sentinel`).
- **Background Worker & Queue Broker:** Containerized Docker Compose services (`redis:7-alpine` + Node.js `api-sentinel-worker`).
- **MCP Integration:** Official `@modelcontextprotocol/sdk` over `stdio` transport + HTTP `/api/mcp` bridge.
- **AI Diagnostics:** NVIDIA NIM OpenAI-compatible API (`nvidia/nemotron-3.5-lightning-30b-a3b`) with deterministic rule-based fallback.

---

## 2. Implemented Capabilities

1. **Endpoint Registry & SSRF Guard**: Full CRUD for monitored API endpoints (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`), custom intervals, timeouts, expected HTTP status codes, and on-demand manual probing (`POST /api/endpoints/:id/check`).
2. **Dockerized Background Monitoring Engine**: Periodically evaluates active endpoints using distributed Redis locks (`SET ... NX EX`) and bounded concurrency (`CONCURRENCY_LIMIT = 5`), recording latencies and publishing heartbeats to Redis.
3. **Latency Percentiles & Analytics**: Computes fleet and per-endpoint `P50`, `P95`, `P99` latencies, uptime percentages, error rates, and HTTP status distributions.
4. **Incident Detection & Auto-Recovery**: Opens `CRITICAL`/`HIGH` incidents after configurable consecutive failures (`failureThreshold = 3`), deduplicates repeat failures (`occurrenceCount`), supports `Acknowledge` / `Resolve` workflows, and auto-resolves on recovery.
5. **OpenAPI 3.0/3.1 Contract Management**: Parses and validates JSON and YAML specs safely (`yaml.JSON_SCHEMA`), resolves local `$ref` schemas, extracts operations, and prevents duplicate uploads via SHA-256 `specHash`.
6. **Deterministic Breaking-Change Analyzer**: Compares baseline vs target OpenAPI specs to detect removed paths/methods, removed response properties, incompatible data types, newly required parameters/request properties, enum removals, and authentication changes (`BREAKING`, `POTENTIALLY_BREAKING`, `NON_BREAKING`).
7. **Service Dependency Graph & Blast Radius Engine**: Registers services and directed `Provider -> Consumer` links, computes direct (`depth = 1`) and transitive (`depth >= 2`) impact via cycle-safe BFS, and calculates an explainable `0–100` deterministic Risk Score.
8. **Official MCP Server**: Exposes 7 strictly read-only diagnostic tools over `stdio` and `/api/mcp`.
9. **Evidence-Grounded AI Diagnostics**: Gathers sanitized platform telemetry, incidents, diffs, and blast radius, redacts credentials, and separates **Verified Facts** from **Diagnostic Hypotheses**.

---

## 3. Project Structure

```text
ad_major_project/
├── docker-compose.yml            # Redis 7 Alpine + containerized monitoring worker
├── frontend/                     # React 18 + Vite SPA
│   ├── src/
│   │   ├── components/           # Sidebar, Header, StatCard
│   │   ├── pages/                # Dashboard, Endpoints, Incidents, Contracts, Dependencies, Diagnostics
│   │   └── services/api.js       # Unified REST client
│   └── dist/                     # Compiled static assets served by Express
└── backend/                      # Node.js + Express + Prisma API
    ├── Dockerfile                # Worker/backend container build
    ├── server.js                 # Express entrypoint & static SPA server
    ├── lib/
    │   ├── prisma.js             # PrismaClient singleton
    │   └── redis.js              # ioredis broker client
    ├── prisma/
    │   ├── schema.prisma         # 8 relational models
    │   ├── migrations/           # SQL migration history
    │   └── seed.js               # Sample endpoints, checks, incidents, contracts, services
    ├── utils/
    │   └── urlValidator.js       # SSRF & DNS rebinding protection
    ├── services/
    │   ├── probeService.js       # HTTP probe runner + incident evaluation hook
    │   ├── incidentService.js    # Threshold, deduplication & auto-recovery engine
    │   ├── contractParserService.js
    │   ├── contractDiffService.js
    │   ├── dependencyService.js  # Cycle-safe BFS + deterministic risk scoring
    │   └── aiDiagnosticsService.js
    ├── mcp/
    │   ├── mcpTools.js           # 7 read-only Zod-validated MCP tools
    │   └── mcpServer.js          # Official stdio MCP server
    ├── workers/
    │   └── monitoringWorker.js   # Asynchronous background probe scheduler
    ├── routes/                   # health, dashboard, endpoints, incidents, contracts, dependencies, mcp, diagnostics
    └── tests/                    # Automated verification suites (step2 through step10)
```

---

## 4. Prerequisites & Local Setup

- **Node.js** v18+ (tested on v25.2.1)
- **PostgreSQL** v14+ running locally on port `5432`
- **Docker** (for Redis & background monitoring worker)

### Setup Steps

1. **Create database & configure `backend/.env`** (copy from `backend/.env.example`):
   ```bash
   psql -U $USER -d postgres -c "CREATE DATABASE api_sentinel;"
   cp backend/.env.example backend/.env
   ```
   Set `DATABASE_URL`, `REDIS_URL`, and optionally `NVIDIA_API_KEY` inside `backend/.env`.

2. **Install dependencies, run migrations, and seed sample data:**
   ```bash
   cd backend
   npm install
   npx prisma migrate deploy
   npm run seed
   ```

3. **Build Frontend & Start Express Server:**
   ```bash
   cd ../frontend
   npm install
   npm run build

   cd ../backend
   npm start
   ```
   Open **`http://localhost:5001`** in your browser.

---

## 5. Docker Background Worker & Redis

Start Redis and the asynchronous monitoring worker in Docker:
```bash
docker compose up -d --build
docker logs -f api-sentinel-worker
```
- `api-sentinel-redis`: Runs `redis:7-alpine` on port `6379` with health checks.
- `api-sentinel-worker`: Runs `workers/monitoringWorker.js`, connecting to Redis (`redis://redis:6379`) and host PostgreSQL (`host.docker.internal:5432`).

---

## 6. Database Schema (Prisma ORM 6)

Defined across 8 models in `backend/prisma/schema.prisma`:
- `User`: Developer/team owner record.
- `APIEndpoint`: Monitored HTTP target with `interval`, `timeout`, `expectedStatus`, `failureThreshold`, `isActive`, and `headers`.
- `HealthCheck`: Time-series probe outcomes (`statusCode`, `latency`, `isHealthy`, `errorMessage`, `checkedAt`).
- `Incident`: Tracked outages (`OPEN`, `ACKNOWLEDGED`, `RESOLVED`), `severity`, `occurrenceCount`, `lastFailureAt`, `resolvedAt`.
- `APIVersion`: Validated OpenAPI JSON/YAML specs with SHA-256 `specHash` deduplication.
- `Service`: Registered service node (`criticality`, `ownerTeam`, optional linked `endpointId`).
- `ServiceDependency`: Directed `Provider -> Consumer` integration edge.
- `DiagnosticReport`: Persisted AI & evidence-backed investigation snapshots.

---

## 7. Backend REST API Reference

| Group | Endpoints |
| :--- | :--- |
| **Health** | `GET /api/health`, `GET /api/health/db` |
| **Dashboard** | `GET /api/dashboard/stats`, `GET /api/dashboard/analytics?hours=24` |
| **Authentication** | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/switch-org` |
| **Organizations** | `GET /api/organizations`, `POST /api/organizations`, `GET /api/organizations/:id/members`, `POST /api/organizations/:id/members` |
| **Health** | `GET /api/health`, `GET /api/health/db` |
| **Dashboard** | `GET /api/dashboard/stats`, `GET /api/dashboard/analytics` |
| **Endpoints** | `GET /api/endpoints`, `GET /api/endpoints/:id`, `POST /api/endpoints`, `PUT /api/endpoints/:id`, `DELETE /api/endpoints/:id`, `POST /api/endpoints/:id/check`, `GET /api/endpoints/:id/history` |
| **Incidents** | `GET /api/incidents`, `GET /api/incidents/:id`, `PATCH /api/incidents/:id/acknowledge`, `PATCH /api/incidents/:id/resolve` |
| **Contracts** | `GET /api/contracts`, `GET /api/contracts/endpoint/:endpointId`, `GET /api/contracts/:versionId`, `POST /api/contracts/upload`, `POST /api/contracts/compare`, `DELETE /api/contracts/:versionId` |
| **Dependencies** | `GET /api/dependencies/graph`, `GET /api/dependencies/services`, `POST /api/dependencies/services`, `DELETE /api/dependencies/services/:id`, `POST /api/dependencies/integrations`, `DELETE /api/dependencies/integrations/:id`, `POST /api/dependencies/impact` |
| **MCP Bridge** | `GET /api/mcp/tools`, `POST /api/mcp/invoke` |
| **AI Diagnostics** | `GET /api/diagnostics/status`, `GET /api/diagnostics/history`, `POST /api/diagnostics/investigate` |

---

## 8. Model Context Protocol (MCP) Server

Run the standalone `stdio` MCP server:
```bash
cd backend
npm run mcp
```

Exposed read-only tools:
- `get_endpoint_health`
- `get_recent_incidents`
- `get_incident_details`
- `compare_api_contracts`
- `get_affected_consumers`
- `analyze_api_risk`
- `get_latency_history`

---

## 9. AI-Assisted Diagnostics (NVIDIA NIM)

Configured via `backend/.env`:
```env
NVIDIA_API_KEY="your-key"
NVIDIA_BASE_URL="https://integrate.api.nvidia.com/v1"
NVIDIA_MODEL="nvidia/nemotron-3.5-lightning-30b-a3b"
```
If `NVIDIA_API_KEY` is omitted or the external endpoint is unavailable, the diagnostic engine automatically switches to `deterministic-fallback` (`rule-engine-v1`) using live PostgreSQL evidence.

---

## 10. Security Protections (Phase 13)

- **SSRF & DNS Rebinding Guard (`utils/urlValidator.js`)**: Blocks non-HTTP(S) schemes, `localhost`, `127.0.0.1`, `::1`, RFC 1918 subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local / cloud metadata IPs (`169.254.169.254`, `metadata.google.internal`), and resolves hostnames via DNS before storing or probing.
- **3xx HTTP Redirect SSRF Re-validation (`services/probeService.js`)**: Probes execute with `redirect: 'manual'` and re-evaluate target URLs against the SSRF Guard at every redirect hop (up to 5 hops maximum) to prevent loopback/metadata redirect pivots.
- **AES-256-GCM Encryption at Rest (`utils/encryption.js`)**: Sensitive custom endpoint `headers` (e.g. Bearer tokens, custom API keys) are authenticated and encrypted with AES-256-GCM before saving to PostgreSQL, with transparent backwards compatibility for legacy records.
- **Express Rate Limiting (`middleware/rateLimiter.js`)**: Global IP-based rate limiting on `/api` routes (1000 req / 15 min) and strict burst limiting on manual probe executions (`/api/endpoints/:id/check`, 60 probes / min) to prevent denial-of-service and probe flooding.
- **Credential Redaction**: Endpoint custom `headers` are stripped from MCP outputs and AI evidence snapshots; `Bearer` tokens, passwords, and `nvapi-` keys are masked in diagnostic reports and never exposed on `/api/diagnostics/status`.
- **Safe YAML Parsing**: Uses `js-yaml` with `yaml.JSON_SCHEMA` and a 2 MB size cap.
- **Read-Only MCP Boundary**: MCP tools enforce Zod argument validation and perform strictly read-only Prisma queries.

---

## 11. Automated Test Suite

Run all 11 backend verification suites (covering JWT auth & RBAC, SSRF, worker probing, incident lifecycle, OpenAPI validation, breaking-change diffing, cycle-safe dependency traversal, real MCP `stdio` client-server calls, NVIDIA AI diagnostics, full 8-step E2E demo scenario, and Phase 13 security hardening):
```bash
cd backend
npm test
```

---

## 12. Known Limitations

## 12. Known Limitations

- **Frontend Automated Tests**: Verification relies on Vite production builds (`npm run build`) and comprehensive backend API/integration tests (`npm test`); standalone browser/React component unit tests (e.g. Vitest/Playwright) were not added.
- **Local Network Monitoring**: Because SSRF protection blocks `127.0.0.1` and private subnets, internal intranet endpoints cannot be probed unless explicitly deployed outside blocked ranges.

---

## 13. End-to-End Database Request Flow

```
┌──────────────────┐
│  React Browser   │
│ (Dashboard.jsx)  │
└────────┬─────────┘
         │
         │ 1. useEffect triggers getDashboardStats()
         ▼
┌──────────────────┐
│  Frontend Client │
│     (api.js)     │
└────────┬─────────┘
         │
         │ 2. HTTP GET /api/dashboard/stats
         ▼
┌──────────────────┐
│  Express Server  │
│(dashboardRoutes) │
└────────┬─────────┘
         │
         │ 3. Invokes queries via reusable client
         ▼
┌──────────────────┐
│  Prisma Client   │
│  (lib/prisma.js) │
└────────┬─────────┘
         │
         │ 4. Executes SQL queries:
         │    - count() on APIEndpoint
         │    - findMany() with nested latest HealthCheck
         │    - aggregate() for average latency
         ▼
┌──────────────────┐
│    PostgreSQL    │
│  (api_sentinel)  │
└────────┬─────────┘
         │
         │ 5. Returns SQL result rows
         ▼
┌──────────────────┐
│  Prisma Client   │
└────────┬─────────┘
         │
         │ 6. Deserializes rows into JavaScript objects
         ▼
┌──────────────────┐
│  Express Server  │
└────────┬─────────┘
         │
         │ 7. Responds with JSON: { success: true, dataSource: "database", data: {...} }
         ▼
┌──────────────────┐
│  React Browser   │
└──────────────────┘
         │ 8. setStats(data) -> Virtual DOM reconciliation -> UI updates!
```

---

## 14. Quick CLI Verification

```bash
# 1. Test server and database health
curl http://localhost:5001/api/health
curl http://localhost:5001/api/health/db

# 2. Test dashboard statistics
curl http://localhost:5001/api/dashboard/stats

# 3. List monitored endpoints
curl http://localhost:5001/api/endpoints

# 4. Trigger active failure probe on an endpoint
curl -X POST http://localhost:5001/api/endpoints/<ENDPOINT_ID>/probe

# 5. Discover MCP diagnostic tools
curl http://localhost:5001/api/mcp/tools
```

---

## 15. Troubleshooting & Verification

- **Database Connection Failed (`/api/health/db` returns 503):**
  - Check that PostgreSQL is running: `pg_isready`
  - Verify your `DATABASE_URL` credentials in `backend/.env`.
- **Prisma Client Out of Sync:**
  - If you modify `schema.prisma`, run `npx prisma generate` to re-generate the client.
- **Database Tables Empty:**
  - If no endpoints are registered yet, the API returns zero values (`totalApis: 0, averageLatency: "0 ms"`). The dashboard displays these cleanly without crashing.
