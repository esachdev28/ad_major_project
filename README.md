# 🛡️ API Sentinel — API Reliability & Compatibility Intelligence Platform

> **Observe. Detect. Analyze. Diagnose.**  
> A unified platform for automated API health monitoring, OpenAPI breaking-change detection, dependency blast-radius analysis, and AI-assisted diagnostics via the Model Context Protocol (MCP).

---

## 🌟 What is API Sentinel in Simple Words?

Imagine modern companies like Netflix, Uber, or Amazon. They run hundreds of independent software services (APIs) talking to each other. When an API breaks or changes unexpectedly, mobile apps fail, payments stop, and users get errors. 

**API Sentinel solves this problem with a 4-part automated defense system:**

1. **Continuous Health Monitoring (The Sentry)**: Automatically pings your registered APIs at regular intervals (e.g., every 30 seconds). It records response time (latency), HTTP status codes (200 OK, 500 Error), and uptime percentages. If an API is slow or fails, it catches it immediately.
2. **Automated Incident Management**: If an API fails 3 consecutive times, API Sentinel automatically opens a high-priority **Incident**, alerts developers with exact error traces, deduplicates repeat failures, and automatically resolves the incident when the API heals.
3. **OpenAPI Contract & Breaking-Change Detector**: When developers release a new version of their API, they upload the OpenAPI/Swagger contract. API Sentinel compares the old version and the new version side-by-side. It flags breaking changes (e.g., removed fields, changed data types, new required fields) before bad code breaks consumers in production.
4. **Dependency Graph & Blast-Radius Calculation**: Maps out which mobile apps, websites, and microservices depend on which APIs. When an API goes down, it calculates an explainable **Risk Score (0–100)** and reveals the exact downstream blast radius (which teams and apps are affected).
5. **Model Context Protocol (MCP) & AI Diagnostics**: Exposes read-only diagnostic tools using Anthropic's **Model Context Protocol (MCP)** standard. Compatible AI agents (like Claude or NVIDIA NIM LLMs) can inspect live health metrics, query incidents, analyze contract diffs, and generate evidence-grounded incident triage reports without leaking sensitive API keys or passwords.

---

## 📋 Table of Contents

1. [Architecture & Technology Stack](#1-architecture--technology-stack)
2. [What You See in the User Interface (6 Core Screens)](#2-what-you-see-in-the-user-interface-6-core-screens)
3. [Project Structure](#3-project-structure)
4. [Prerequisites & Local Quickstart](#4-prerequisites--local-quickstart)
5. [Docker Background Worker & Redis Queue](#5-docker-background-worker--redis-queue)
6. [Database Schema (Prisma ORM 6)](#6-database-schema-prisma-orm-6)
7. [Complete REST API Reference](#7-complete-rest-api-reference)
8. [Model Context Protocol (MCP) Server](#8-model-context-protocol-mcp-server)
9. [AI-Assisted Diagnostics (NVIDIA NIM)](#9-ai-assisted-diagnostics-nvidia-nim)
10. [Enterprise Security Hardening (Phase 13)](#10-enterprise-security-hardening-phase-13)
11. [Automated Verification Test Suite (11/11 Passing)](#11-automated-verification-test-suite-1111-passing)
12. [Cloud Deployment Guide (Render / Railway / Cloudflare)](#12-cloud-deployment-guide-render--railway--cloudflare)
13. [Project Evaluation & Viva Defense Cheatsheet](#13-project-evaluation--viva-defense-cheatsheet)
14. [Data Engineering (DE) Integrated Deliverables](#14-data-engineering-de-integrated-deliverables)

---

## 1. Architecture & Technology Stack

```text
┌────────────────────────────────────────────────────────────────────────┐
│                          USER INTERFACE                                │
│       React 18 + Vite SPA (SaaS Dark-Navy Theme, Responsive)           │
│   Dashboard │ Endpoints │ Incidents │ Contracts │ Graph │ Diagnostics  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP REST / JSON
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        EXPRESS.JS BACKEND (5001)                       │
│  - JWT Auth & Multi-Tenant Organizations (RBAC: OWNER, ADMIN, MEMBER)  │
│  - SSRF & DNS Rebinding Guard (Blocks loopback, RFC1918, metadata IPs) │
│  - 3xx HTTP Redirect SSRF Re-validation (Up to 5 hops)                 │
│  - AES-256-GCM Encrypted Endpoint Headers at Rest                      │
│  - Express Rate Limiting (1000 req/15min global, 60 probes/min)        │
│  - Static SPA Single-Origin Server (Zero-CORS setup)                   │
└──────────────┬────────────────────┬────────────────────┬───────────────┘
               │                    │                    │
               ▼                    ▼                    ▼
     ┌───────────────────┐┌──────────────────┐┌──────────────────────────┐
     │   PostgreSQL 17   ││  Redis 7 Alpine  ││  Model Context Protocol  │
     │    (Prisma ORM)   ││  (Lock & Queue)  ││       (MCP Server)       │
     │ 8 Relational Models││  Distributed     ││ 7 Read-Only Diagnostic  │
     │ Endpoints, Checks,││  concurrency     ││ Tools over stdio / HTTP  │
     │ Incidents, Diff,  ││  Worker heartbeat││ Zod-validated input      │
     │ Services, Deps    ││  Auto-probing    ││ Redacted credentials     │
     └───────────────────┘└─────────┬────────┘└─────────────┬────────────┘
                                    │                       │
                                    ▼                       ▼
                         ┌────────────────────┐   ┌──────────────────────┐
                         │ Background Worker  │   │  AI Diagnostics LLM  │
                         │ (Docker Container) │   │ (NVIDIA NIM Nemotron │
                         │ Bounded concurrency│   │  or Rule-Based Engine│
                         └────────────────────┘   └──────────────────────┘
```

- **Frontend**: React 18, Vite 6, Custom SaaS Dark-Navy Design System (accessible, screen-reader friendly).
- **Backend API**: Node.js, Express.js, Prisma ORM 6 (`@prisma/client`), `js-yaml`, `ioredis`, `zod`, `jsonwebtoken`, `bcryptjs`.
- **Database**: PostgreSQL 17 relational database.
- **Queue & Distributed Locks**: Redis 7 Alpine (`SET ... NX EX` distributed lock to avoid redundant probes).
- **Worker**: Containerized background probe runner executing periodic HTTP health evaluations.
- **Protocol**: Anthropic's Model Context Protocol (MCP) via `@modelcontextprotocol/sdk` over `stdio` + HTTP `/api/mcp` bridge.
- **AI Engine**: NVIDIA NIM OpenAI-compatible API (`nvidia/nemotron-3.5-lightning-30b-a3b`) with deterministic rule-based fallback.

---

## 2. What You See in the User Interface (6 Core Screens)

1. **Dashboard (`/`)**:
   - High-level telemetry at a glance: Total Monitored APIs, Fleet Uptime %, Average Latency, and Active Incidents.
   - 24-hour latency percentiles (`P50`, `P95`, `P99`).
   - Real-time probe stream and quick-action buttons.
2. **Endpoint Registry (`/endpoints`)**:
   - Register any HTTP(S) endpoint with custom HTTP method, headers, check interval, timeout, and expected HTTP status codes.
   - Built-in **SSRF Protection** rejects private IPs, loopback (`localhost`), and cloud metadata (`169.254.169.254`).
   - Sensitive headers (e.g., Bearer tokens) are encrypted with **AES-256-GCM** before saving to PostgreSQL.
   - Manual **"Check Now"** button for immediate probe verification.
3. **Incidents Hub (`/incidents`)**:
   - Displays all operational disruptions.
   - Tracks consecutive failure occurrences, time to detection, and current severity (`CRITICAL`, `HIGH`, `MEDIUM`).
   - One-click **"Acknowledge"** and **"Resolve"** lifecycle state transitions.
   - Automatically marks incidents resolved as soon as an endpoint responds healthy!
4. **Contracts & Breaking Changes (`/contracts`)**:
   - Upload OpenAPI 3.0/3.1 specifications in JSON or YAML.
   - Deduplicates identical specs using canonical SHA-256 hashing.
   - Side-by-side **Breaking-Change Comparison**: highlights removed endpoints, missing fields, type changes, and new required query/body parameters.
5. **Dependency & Blast Radius Graph (`/dependencies`)**:
   - Interactive dependency matrix mapping upstream Provider services to downstream Consumer apps.
   - Automatic cycle-safe Breadth-First Search (BFS) graph traversal.
   - Calculates a deterministic **Risk Score (0–100)**: low, medium, high, or critical blast radius.
6. **MCP & AI Diagnostics (`/diagnostics`)**:
   - Live AI incident triage workspace.
   - Pulls live database telemetry via 7 MCP tools (health telemetry, incident logs, contract diffs, consumer blast radius).
   - Generates an evidence-backed triage report dividing output into **Verified Facts** vs **Diagnostic Hypotheses**.
   - Redacts all secrets and credentials to ensure zero sensitive data leakage.

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
│   └── dist/                     # Compiled production static bundle
└── backend/                      # Node.js + Express + Prisma API
    ├── Dockerfile                # Worker/backend container build
    ├── server.js                 # Express entrypoint & static SPA server
    ├── lib/
    │   ├── prisma.js             # PrismaClient singleton
    │   └── redis.js              # ioredis broker client
    ├── prisma/
    │   ├── schema.prisma         # Relational database models
    │   ├── migrations/           # SQL migration history
    │   └── seed.js               # Sample endpoints, checks, incidents, contracts, services
    ├── utils/
    │   ├── urlValidator.js       # SSRF & DNS rebinding protection
    │   └── encryption.js         # AES-256-GCM authenticated cipher
    ├── middleware/
    │   ├── auth.js               # JWT auth & organization RBAC
    │   └── rateLimiter.js        # Express rate limiting
    ├── services/
    │   ├── probeService.js       # HTTP probe runner + redirect SSRF guard
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
    ├── routes/                   # auth, orgs, endpoints, incidents, contracts, versions, integrations, mcp, diagnostics
    └── tests/                    # 11 Automated verification suites (step2 through step13)
```

---

## 4. Prerequisites & Local Quickstart

### Prerequisites
- **Node.js**: v18+ (tested on Node.js v20 and v25)
- **PostgreSQL**: v14+ running locally on port `5432`
- **Docker & Docker Compose**: (for Redis & the background monitoring worker)

### 3-Step Setup

1. **Configure Environment Variables**:
   ```bash
   cp backend/.env.example backend/.env
   ```
   Ensure `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/api_sentinel?schema=public"` and `REDIS_URL="redis://localhost:6379"`.

2. **Run Migrations & Seed Sample Data**:
   ```bash
   cd backend
   npm install
   npx prisma db push
   npm run seed
   ```

3. **Build Frontend & Start Server**:
   ```bash
   # In frontend/
   cd ../frontend
   npm install
   npm run build

   # In backend/
   cd ../backend
   npm start
   ```
   Open your browser to: **`http://localhost:5001`**

---

## 5. Docker Background Worker & Redis Queue

Start the Redis queue and containerized monitoring worker in Docker:
```bash
docker compose up -d --build
```
Verify worker logs:
```bash
docker logs -f api-sentinel-worker
```
- `api-sentinel-redis`: Redis 7 Alpine caching probe locks and publishing telemetry heartbeats.
- `api-sentinel-worker`: Executes periodic scheduled probes using distributed Redis locks (`SET ... NX EX`) and bounded concurrency (`CONCURRENCY_LIMIT = 5`).

---

## 6. Database Schema (Prisma ORM 6)

Defined across 8 relational models in `backend/prisma/schema.prisma`:
1. `User`: User accounts with bcrypt hashed passwords.
2. `Organization` & `OrganizationMember`: Multi-tenant workspace isolation with role-based access control (`OWNER`, `ADMIN`, `MEMBER`).
3. `APIEndpoint`: Monitored target URL, method, interval, timeout, expected status, encrypted headers, and organization scoping.
4. `HealthCheck`: Time-series probe outcome records (`statusCode`, `latency`, `isHealthy`, `errorMessage`, `checkedAt`).
5. `Incident`: Operational outage logs with status (`OPEN`, `ACKNOWLEDGED`, `RESOLVED`), `severity`, and repeat `occurrenceCount`.
6. `APIVersion`: Stored OpenAPI/Swagger specifications with canonical SHA-256 `specHash` deduplication.
7. `Integration`: Downstream consumer applications mapped to endpoints for blast radius assessment.
8. `Service` & `ServiceDependency`: Directed `Provider -> Consumer` dependency edges for cycle-safe BFS risk scoring.
9. `DiagnosticReport`: Persisted AI investigation snapshots and audit history.

---

## 7. Complete REST API Reference

| Domain | Method & Route | Description |
| :--- | :--- | :--- |
| **System** | `GET /api/health` | Backend and Redis heartbeat status |
| **System** | `GET /api/health/db` | PostgreSQL connection verification |
| **Auth** | `POST /api/auth/register` | Register new user + auto-provision default organization |
| **Auth** | `POST /api/auth/login` | Authenticate user credentials & issue JWT token |
| **Auth** | `GET /api/auth/me` | Fetch active user profile, tenant organization, and role |
| **Auth** | `POST /api/auth/switch-org` | Switch active tenant organization context |
| **Organizations**| `GET /api/organizations` | List organizations user belongs to |
| **Organizations**| `POST /api/organizations` | Create secondary organization |
| **Organizations**| `POST /api/organizations/:id/members` | Invite organization member with RBAC role |
| **Dashboard** | `GET /api/dashboard/stats` | Aggregated fleet counts, uptime %, and active incidents |
| **Dashboard** | `GET /api/dashboard/analytics?hours=24` | 24-hr P50, P95, P99 latencies and status code distribution |
| **Endpoints** | `GET /api/endpoints` | List all monitored API endpoints |
| **Endpoints** | `POST /api/endpoints` | Register new endpoint with SSRF check & AES-256 header encryption |
| **Endpoints** | `GET /api/endpoints/:id` | Get specific endpoint details and recent health checks |
| **Endpoints** | `PUT /api/endpoints/:id` | Update endpoint configuration |
| **Endpoints** | `DELETE /api/endpoints/:id` | Delete endpoint and cascade cleanup |
| **Endpoints** | `POST /api/endpoints/:id/check` | Trigger immediate manual probe |
| **Endpoints** | `GET /api/endpoints/:id/history` | Historical latency distribution and uptime breakdown |
| **Incidents** | `GET /api/incidents` | List all operational incidents (filterable by status) |
| **Incidents** | `GET /api/incidents/:id` | Inspect incident details, cause, and timeline |
| **Incidents** | `PATCH /api/incidents/:id/acknowledge`| Acknowledge active incident |
| **Incidents** | `PATCH /api/incidents/:id/resolve`| Manually resolve incident |
| **Contracts** | `GET /api/contracts` | List all stored OpenAPI contracts |
| **Contracts** | `POST /api/contracts/upload` | Upload & parse OpenAPI 3.0/3.1 JSON or YAML spec |
| **Contracts** | `POST /api/contracts/compare` | Compare two contract versions for breaking changes |
| **Versions** | `GET /api/versions/endpoint/:endpointId` | List version history for an endpoint |
| **Versions** | `POST /api/versions/diff` | Semantic breaking-change diff report |
| **Dependencies**| `GET /api/dependencies/graph` | Directed dependency graph nodes & edges |
| **Dependencies**| `POST /api/dependencies/services` | Register microservice node |
| **Dependencies**| `POST /api/dependencies/integrations`| Link Provider -> Consumer dependency edge |
| **Dependencies**| `POST /api/dependencies/impact` | Cycle-safe BFS blast radius & deterministic Risk Score |
| **Integrations**| `GET /api/integrations` | List registered consumer dependencies |
| **Integrations**| `POST /api/integrations` | Register new downstream consumer for an API |
| **Integrations**| `GET /api/integrations/impact/:endpointId`| Calculate blast radius and consumer notification list |
| **MCP Bridge** | `GET /api/mcp/tools` | Discover 7 registered Model Context Protocol tools |
| **MCP Bridge** | `POST /api/mcp/invoke` | Execute MCP diagnostic tool with Zod schema validation |
| **Diagnostics** | `GET /api/diagnostics/status` | AI engine status (NVIDIA NIM or deterministic fallback) |
| **Diagnostics** | `POST /api/diagnostics/investigate` | Run AI diagnostic investigation on an incident |

---

## 8. Model Context Protocol (MCP) Server

API Sentinel implements an official Model Context Protocol (MCP) server conforming to Anthropic's specification.

### Run MCP Server via stdio
```bash
cd backend
npm run mcp
```

### Registered Read-Only Diagnostic Tools
1. `get_endpoint_health`: Returns real-time latency, uptime %, and recent probe outcomes.
2. `get_recent_incidents`: Fetches operational outages and failure causes.
3. `get_incident_details`: Retrieves deep root-cause context for a specific incident.
4. `compare_api_contracts`: Performs semantic OpenAPI comparison between baseline and target versions.
5. `get_affected_consumers`: Queries downstream microservices and mobile consumers affected by an endpoint.
6. `analyze_api_risk`: Computes deterministic 0–100 composite risk score.
7. `get_latency_history`: Retrieves historical P50, P95, and P99 latency distribution.

*Security Assurance: All MCP tools enforce strict Zod argument validation, execute read-only database queries, and sanitize/redact all credentials.*

---

## 9. AI-Assisted Diagnostics (NVIDIA NIM)

Configured via `backend/.env`:
```env
NVIDIA_API_KEY="your-nvapi-key"
NVIDIA_BASE_URL="https://integrate.api.nvidia.com/v1"
NVIDIA_MODEL="nvidia/nemotron-3.5-lightning-30b-a3b"
```

- When an incident is selected, API Sentinel gathers telemetry, recent probe error traces, breaking-change diffs, and downstream dependency links.
- Endpoint custom headers and passwords are completely redacted.
- The prompt enforces a strict scientific diagnostic format:
  - **Verified Facts**: Definite signals from database records.
  - **Diagnostic Hypotheses**: Probable root causes based on HTTP status codes and contract changes.
  - **Remediation Plan**: Actionable steps for engineering on-call responders.
- **Offline / Fallback Mode**: If `NVIDIA_API_KEY` is not provided or the network is unreachable, API Sentinel seamlessly falls back to a deterministic rule-based diagnostic engine (`rule-engine-v1`), ensuring 100% operational uptime.

---

## 10. Enterprise Security Hardening (Phase 13)

- **SSRF & DNS Rebinding Guard**: Validates all URLs before storing or probing. Prohibits `localhost`, loopback IPs (`127.0.0.0/8`), private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local IPs (`169.254.169.254`), and cloud internal metadata hostnames.
- **3xx HTTP Redirect SSRF Re-validation**: Probe requests use `redirect: 'manual'` and re-evaluate target URLs against the SSRF Guard at every redirect hop (up to 5 hops maximum) to prevent loopback/metadata redirect pivots.
- **AES-256-GCM Encryption at Rest**: Sensitive endpoint headers (e.g., authorization tokens) are encrypted with AES-256-GCM authenticated cipher before saving to PostgreSQL.
- **Express Rate Limiting**: Global rate limiting (1000 req / 15 min) and probe burst limiting (60 probes / min) to prevent denial of service.
- **Safe YAML Parser**: Limits YAML upload payload to 2 MB and strictly uses `yaml.JSON_SCHEMA` to prevent prototype pollution or arbitrary code execution.

---

## 11. Automated Verification Test Suite (11/11 Passing)

API Sentinel includes an exhaustive automated test suite covering all functionality from database models to real AI inference.

Run the full test suite:
```bash
cd backend
npm test
```

### Verified Test Suites:
1. `step2_auth_orgs.test.js` — User registration, bcrypt hashing, JWT issuance, organization auto-provisioning, role switching, and multi-tenant data isolation.
2. `step2_endpoints.test.js` — Endpoint CRUD, SSRF blocklist (loopback, private subnets, AWS/GCP metadata), safe URL allowance, and manual probing.
3. `step3_monitoring.test.js` — Redis heartbeat verification, P50/P95/P99 latency calculations, and uptime analytics.
4. `step4_incidents.test.js` — 3-failure threshold detection, incident deduplication, acknowledgment, and auto-resolution on healthy probe.
5. `step5_contracts.test.js` — OpenAPI 3.0/3.1 JSON/YAML parsing, local `$ref` resolution, and SHA-256 deduplication.
6. `step6_diff.test.js` — Semantic breaking-change detection (path removals, field removals, incompatible types, newly required fields).
7. `step7_dependencies.test.js` — Cycle-safe BFS dependency graph traversal, blast-radius calculation, and deterministic Risk Score (0–100).
8. `step8_mcp.test.js` — Official `@modelcontextprotocol/sdk` stdio client-server connection, 7 read-only tool discovery, secret redaction, and HTTP bridge validation.
9. `step9_diagnostics.test.js` — Secret redaction, live NVIDIA NIM LLM inference, and deterministic fallback.
10. `step10_e2e_demo.test.js` — Full 8-step end-to-end integration scenario (Payment API registration, v1/v2 contract upload, breaking change detection, simulated 503 outage, MCP investigation, and auto-recovery).
11. `step13_security.test.js` — AES-256-GCM encryption/decryption at rest, 3xx redirect SSRF re-validation, and Express rate limiting.

**Result: 11 / 11 Test Suites Passed with 0 Failures.**

---

## 12. Cloud Deployment Guide (Render / Railway / Cloudflare)

### Option A: 1-Minute Live Demo via Cloudflare Tunnel (Zero Cost, No Setup)
If you want an immediate live HTTPS public URL pointing to your running local project for submission:
```bash
npx cloudflared tunnel --url http://localhost:5001
```
This instantly outputs a public HTTPS link (e.g., `https://rapid-alpha-sentinel.trycloudflare.com`) with full database and background worker functionality!

### Option B: Deploy on Render
1. **Create PostgreSQL Database on Render**:
   - Go to [dashboard.render.com](https://dashboard.render.com/) -> **New** -> **PostgreSQL**.
   - Name: `api-sentinel-db`.
   - Region: Singapore (Southeast Asia).
   - Click **Create Database**.
   - Copy the **Internal Database URL** (e.g., `postgresql://user:pass@host/db`).
2. **Create Redis Service on Render**:
   - Click **New** -> **Redis**.
   - Name: `api-sentinel-redis`.
   - Copy the **Internal Redis URL**.
3. **Deploy Web Service**:
   - Click **New** -> **Web Service** -> Connect this GitHub repository (`ad_major_project`).
   - Root Directory: `ad_major_project` (or root).
   - Build Command: `cd frontend && npm install && npm run build && cd ../backend && npm install && npx prisma db push`
   - Start Command: `cd backend && npm start`
   - Environment Variables:
     - `DATABASE_URL` = `<your-render-internal-database-url>`
     - `REDIS_URL` = `<your-render-internal-redis-url>`
     - `PORT` = `5001`
     - `NODE_ENV` = `production`
     - `ENCRYPTION_KEY` = `fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210`
     - `JWT_SECRET` = `api-sentinel-jwt-secret-key-production-2026`
     - `NVIDIA_API_KEY` = `<your-nvidia-api-key>` (optional)

---

## 13. Project Evaluation & Viva Defense Cheatsheet

| Question | Your Answer |
| :--- | :--- |
| **What makes API Sentinel unique?** | It combines API monitoring, contract diffing, dependency blast-radius tracking, and Anthropic's Model Context Protocol (MCP) into one unified platform with zero third-party agent dependencies. |
| **How does it prevent SSRF attacks?** | Our `urlValidator` checks the hostname and resolved IP address against RFC1918 private subnets, loopback, and cloud metadata (`169.254.169.254`). Probes re-validate target IPs at every 3xx redirect hop. |
| **How is breaking-change detection handled?** | Our contract diff engine resolves local `$ref` schemas in OpenAPI 3.0/3.1 specs, compares paths, methods, request bodies, query params, and response schemas, and classifies changes into `BREAKING`, `POTENTIALLY_BREAKING`, or `NON_BREAKING`. |
| **How is cyclic dependency handled in the service graph?** | We use a cycle-safe Breadth-First Search (BFS) with a `visited` Set to track visited service IDs, preventing infinite loops while calculating blast-radius depth. |
| **What is Model Context Protocol (MCP)?** | MCP is an open standard that allows AI models to safely invoke backend tools. We implement 7 read-only diagnostic tools using `@modelcontextprotocol/sdk` over `stdio` and HTTP bridge, with strict Zod validation and credential redaction. |

---

## 14. Data Engineering (DE) Integrated Deliverables

All mandatory deliverables for the **Data Engineering (DE)** component have been structured into the dedicated [`DE/`](DE/) directory:

- 📊 **[Database Selection & Justification](DE/DATABASE_SELECTION.md)**: Architectural comparison of PostgreSQL 17 vs MongoDB, ACID guarantees, relational integrity, and time-series suitability.
- 📐 **[ER Diagram & Data Modeling](DE/ER_DIAGRAM.md)**: Crow's Foot ER Diagram (Mermaid), primary/foreign keys, 1:1, 1:N, and N:M cardinalities, and complete Data Dictionary.
- 🔍 **[Database Normalization (1NF, 2NF, 3NF)](DE/NORMALIZATION.md)**: Step-by-step transformation from 0NF to 3NF, functional dependency mappings, and anomaly elimination proofs.
- 💾 **[Complete SQL Schema DDL](DE/schema.sql)**: Pure PostgreSQL DDL script with tables, cascading foreign keys, check constraints, and B-Tree indexes.
- 🌱 **[Sample Dataset DML](DE/seed_data.sql)**: Realistic initial data populating all 9 relational entities.
- ⚡ **[10 Project-Specific Queries & Verified Outputs](DE/QUERIES_AND_EXECUTION.md)**: Minimum 10 real queries covering INSERT, UPDATE, DELETE, multi-table JOINs, GROUP BY/HAVING, subqueries, CTEs, Window functions, and graph blast radius with **verified live execution outputs** from PostgreSQL.
- 🔗 **[Database & Application Integration](DE/DATABASE_INTEGRATION.md)**: Prisma ORM integration, connection pooling, prepared statements, and Express.js request lifecycles.
- 🛡️ **[Data Integrity & High-Volume Scaling](DE/DATA_INTEGRITY_AND_SCALING.md)**: Domain constraints, index performance plans, and table partitioning architecture.

For full details, open the **[Data Engineering Master Report (DE/README.md)](DE/README.md)**.

---

## 📄 License
MIT License. Developed for Academic Major Project / Capstone Evaluation.
