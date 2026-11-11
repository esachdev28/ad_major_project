# 🛡️ API Sentinel — Day 1, Commit 2

**API Sentinel** is an API observability, health monitoring, and breaking-change detection platform designed to protect modern microservice ecosystems.

This repository represents **Day 1, Commit 2** of our 5-day development sprint: extending our foundation with a robust relational database layer powered by **PostgreSQL** and **Prisma ORM 6**.

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Current Implementation Scope (Commit 2)](#current-implementation-scope-commit-2)
3. [Technologies Used](#technologies-used)
4. [Project Structure](#project-structure)
5. [Prerequisites](#prerequisites)
6. [Database Setup & Configuration](#database-setup--configuration)
7. [Database Schema & Models](#database-schema--models)
8. [Prisma Commands Reference](#prisma-commands-reference)
9. [Starting the Application](#starting-the-application)
10. [Available Backend Routes](#available-backend-routes)
11. [End-to-End Database Request Flow](#end-to-end-database-request-flow)
12. [Troubleshooting & Verification](#troubleshooting--verification)

---

## 1. Project Overview

Modern web applications depend on dozens of internal and third-party APIs. When an upstream API changes schemas, fails, or degrades in performance, downstream applications can experience cascading outages.

**API Sentinel** is designed to address this problem by:
- Monitoring registered API endpoints.
- Detecting API failures and recording incidents.
- Comparing API specification versions (OpenAPI/Swagger) to detect breaking changes before deployment.
- Identifying integrations and services potentially affected by schema diffs.
- Exposing diagnostic and remediation tools via MCP (Model Context Protocol).

> **Current Scope (Commit 2):** In this commit, we established our database foundation with PostgreSQL and Prisma ORM 6, replacing the previous static demo metrics with live database queries and introducing a database health-check probe. Automated polling, OAuth, and OpenAPI diff engines will be added in subsequent days.

---

## 2. Current Implementation Scope (Commit 2)

- **PostgreSQL Database:**
  - Relational database schema with 5 dedicated models: `User`, `APIEndpoint`, `HealthCheck`, `Incident`, and `APIVersion`.
  - Referential integrity: Foreign keys, cascade deletes, and query indexes.
- **Prisma ORM 6 Integration:**
  - `prisma@6` and `@prisma/client@6` installed and configured.
  - Reusable singleton Prisma Client instance (`backend/lib/prisma.js`).
  - Graceful process termination with `prisma.$disconnect()` on `SIGINT` / `SIGTERM`.
  - Initial migration executed (`prisma/migrations/20261111074314_init`).
- **Express Backend Updates:**
  - **New Endpoint:** `GET /api/health/db` checks live database connectivity with `SELECT 1`.
  - **Dynamic Statistics:** `GET /api/dashboard/stats` now calculates metrics directly from PostgreSQL via Prisma aggregates and counts, returning `"dataSource": "database"`.
  - Safe error handling: If tables are empty or database is down, the API returns safe fallback values without crashing.
- **React Frontend:**
  - Updated API service layer (`frontend/src/services/api.js`) with `checkDbHealth()`.
  - Dynamic UI badge displaying `DATABASE MODE` when live database statistics are returned.

---

## 3. Technologies Used

### Frontend
- **React 18** (Component-based UI library)
- **JavaScript (ES6+)**
- **Vite** (Build tool & development server)
- **HTML5 & CSS3** (Pure CSS, custom dark-navy theme)

### Backend
- **Node.js** (JavaScript runtime)
- **Express.js** (Web application framework)
- **Prisma ORM 6** (`prisma@6`, `@prisma/client@6`)
- **PostgreSQL** (Relational Database Management System)
- **dotenv** (Environment variable management)

---

## 4. Project Structure

```
ad_major_project/
│
├── frontend/                     # React Single Page Application (Vite)
│   ├── src/
│   │   ├── components/
│   │   │   ├── Sidebar.jsx       # Brand navigation & feature placeholders
│   │   │   ├── Header.jsx        # Header with connection status pill & refresh
│   │   │   └── StatCard.jsx      # Metric cards with loading skeletons
│   │   │
│   │   ├── pages/
│   │   │   └── Dashboard.jsx     # Main dashboard view orchestrating data & layout
│   │   │
│   │   ├── services/
│   │   │   └── api.js            # Centralized API service (health, db, stats)
│   │   │
│   │   ├── App.jsx               # Root layout shell (Sidebar + Dashboard)
│   │   ├── main.jsx              # React DOM entry point
│   │   └── index.css             # Global dark-navy SaaS stylesheet
│   │
│   ├── dist/                     # Production build served by Express
│   ├── index.html                # HTML entry template
│   ├── vite.config.js            # Vite configuration with /api proxy
│   └── package.json              # Frontend scripts and dependencies
│
├── backend/                      # Node.js + Express REST API
│   ├── lib/
│   │   └── prisma.js             # Reusable PrismaClient singleton instance
│   │
│   ├── prisma/
│   │   ├── schema.prisma         # Prisma schema definition (5 models)
│   │   └── migrations/           # Version-controlled SQL migration history
│   │
│   ├── routes/
│   │   ├── healthRoutes.js       # GET /api/health & GET /api/health/db
│   │   └── dashboardRoutes.js    # GET /api/dashboard/stats (Prisma database queries)
│   │
│   ├── server.js                 # Server entry point, middleware & shutdown hooks
│   ├── package.json              # Backend scripts and dependencies
│   ├── .env.example              # Sample environment configuration template
│   └── .env                      # Local server configuration (gitignored)
│
├── .gitignore                    # Excludes node_modules, credentials, dist
└── README.md                     # Comprehensive project documentation
```

---

## 5. Prerequisites

- **Node.js**: v18.0.0 or later (v20+ or v24+ recommended)
- **npm**: v9.0.0 or later
- **PostgreSQL**: v14, v15, or v16 running locally on port `5432`

Verify your local tools:
```bash
node -v
npm -v
psql --version
pg_isready
```

---

## 6. Database Setup & Configuration

### 1. Create the Database
Ensure PostgreSQL is running, then create the `api_sentinel` database:
```bash
psql -U postgres -c "CREATE DATABASE api_sentinel;"
```
*(On macOS with Homebrew, you can use your local username instead of `postgres`).*

### 2. Configure Environment Variables
Inside `backend/.env`, set your connection URL:
```env
PORT=5001
DATABASE_URL="postgresql://USERNAME:PASSWORD@localhost:5432/api_sentinel?schema=public"
```
*(If your local PostgreSQL user has no password, use `postgresql://USERNAME@localhost:5432/api_sentinel?schema=public`).*

---

## 7. Database Schema & Models

Our schema is defined in [backend/prisma/schema.prisma](file:///Users/vedantsmac/ad_major_project/backend/prisma/schema.prisma) across 5 core models:

### 1. `User`
- **Purpose:** Represents developers or teams who own and monitor endpoints (foundation for future authentication).
- **Fields:** `id` (cuid), `name`, `email` (unique), `createdAt`, `updatedAt`.
- **Relationship:** One User has many `APIEndpoint` records (`1-to-N`).

### 2. `APIEndpoint`
- **Purpose:** Represents an external or internal HTTP API registered for observability.
- **Fields:** `id` (cuid), `name`, `url`, `method` (default "GET"), `description` (optional), `userId` (optional), `createdAt`, `updatedAt`.
- **Relationships:**
  - Belongs to optional `User` (`onDelete: SetNull`).
  - Has many `HealthCheck` records (`onDelete: Cascade`).
  - Has many `Incident` records (`onDelete: Cascade`).
  - Has many `APIVersion` records (`onDelete: Cascade`).

### 3. `HealthCheck`
- **Purpose:** Records individual probe results, latency, and status codes.
- **Fields:** `id` (cuid), `endpointId`, `statusCode`, `latency` (ms), `isHealthy` (boolean), `errorMessage`, `checkedAt`.
- **Relationship:** Belongs to `APIEndpoint`.

### 4. `Incident`
- **Purpose:** Tracks outages, timeouts, and unexpected status codes.
- **Fields:** `id` (cuid), `endpointId`, `title`, `description`, `status` (default "OPEN"), `createdAt`, `resolvedAt`.
- **Relationship:** Belongs to `APIEndpoint`.

### 5. `APIVersion`
- **Purpose:** Stores OpenAPI/Swagger specification contracts for future diffing.
- **Fields:** `id` (cuid), `endpointId`, `version`, `specification` (text), `createdAt`.
- **Relationship:** Belongs to `APIEndpoint`.

---

## 8. Prisma Commands Reference

All Prisma commands are run inside the `backend/` directory:

```bash
cd backend

# 1. Validate schema syntax
npx prisma validate

# 2. Generate Prisma Client JavaScript code
npx prisma generate

# 3. Create and apply new migrations in development
npx prisma migrate dev --name init

# 4. View and edit database records visually via Prisma Studio
npx prisma studio
```

---

## 9. Starting the Application

With our unified **`express.static()`** architecture, you can run the entire full-stack app with a single command:

```bash
cd backend
npm start
```

* Express starts on **`http://localhost:5001`**.
* Open your browser and navigate to: **[http://localhost:5001](http://localhost:5001)**.
* The React dashboard will load instantly, reading live metrics directly from PostgreSQL!

---

## 10. Available Backend Routes

| Method | Endpoint | Description | Sample Response |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Server health check | `{"success":true,"message":"API Sentinel backend is running"}` |
| `GET` | `/api/health/db` | Database health check (`SELECT 1`) | `{"success":true,"message":"Database connection successful"}` |
| `GET` | `/api/dashboard/stats` | Dynamic database metrics | `{"success":true,"dataSource":"database","data":{"totalApis":0,"healthyApis":0,"failedApis":0,"averageLatency":"0 ms"}}` |

### Testing Endpoints via Command Line
```bash
# Test server health
curl http://localhost:5001/api/health

# Test database connection
curl http://localhost:5001/api/health/db

# Test dashboard statistics
curl http://localhost:5001/api/dashboard/stats
```

---

## 11. End-to-End Database Request Flow

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

## 12. Troubleshooting & Verification

- **Database Connection Failed (`/api/health/db` returns 503):**
  - Check that PostgreSQL is running: `pg_isready`
  - Verify your `DATABASE_URL` credentials in `backend/.env`.
- **Prisma Client Out of Sync:**
  - If you modify `schema.prisma`, run `npx prisma generate` to re-generate the client.
- **Database Tables Empty:**
  - If no endpoints are registered yet, the API returns zero values (`totalApis: 0, averageLatency: "0 ms"`). The dashboard displays these cleanly without crashing.
