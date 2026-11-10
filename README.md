# 🛡️ API Sentinel — Day 1, Commit 1

**API Sentinel** is an API observability, health monitoring, and breaking-change detection platform designed to protect modern microservice ecosystems.

This repository represents **Day 1, Commit 1** of our 5-day development sprint: the foundational frontend and backend architecture with end-to-end communication.

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Current Implementation Scope (Day 1)](#current-implementation-scope-day-1)
3. [Technologies Used](#technologies-used)
4. [Project Structure](#project-structure)
5. [Prerequisites](#prerequisites)
6. [Installation & Setup](#installation--setup)
7. [Starting the Application](#starting-the-application)
8. [Available Backend Routes](#available-backend-routes)
9. [Frontend-Backend Communication Flow](#frontend-backend-communication-flow)
10. [Troubleshooting & Verification](#troubleshooting--verification)

---

## 1. Project Overview

Modern web applications depend on dozens of internal and third-party APIs. When an upstream API changes schemas, fails, or degrades in performance, downstream applications can experience cascading outages.

**API Sentinel** is designed to address this problem by:
- Monitoring registered API endpoints.
- Detecting API failures and recording incidents.
- Comparing API specification versions (OpenAPI/Swagger) to detect breaking changes before deployment.
- Identifying integrations and services potentially affected by schema diffs.
- Exposing diagnostic and remediation tools via MCP (Model Context Protocol).

> **Note on Day 1 Scope:** Today's commit establishes solely the **structural foundation**: a React frontend, an Express backend, a modern developer dashboard, and live HTTP communication between client and server. Database persistence, automated polling, and OpenAPI analysis will be added in subsequent days.

---

## 2. Current Implementation Scope (Day 1)

In this initial commit, we have implemented:
- **Express Backend:**
  - Lightweight HTTP server configured with JSON body parsing and static React serving via `express.static()`.
  - Zero-CORS single-origin architecture: Express serves both the React client UI and API endpoints from a single port.
  - Modular routing structure with dedicated route files (`healthRoutes.js`, `dashboardRoutes.js`).
  - `GET /api/health` health-check endpoint.
  - `GET /api/dashboard/stats` endpoint returning illustrative metrics explicitly tagged with `"dataSource": "demo"`.
  - Global 404 handler and error-handling middleware.
  - Environment variable support with `dotenv` and `PORT` configuration.
- **React Frontend:**
  - Fast, modular client initialized with Vite and pure JavaScript.
  - Modern, dark-navy developer SaaS design system using pure CSS (no Tailwind, Bootstrap, or component libraries).
  - Reusable component architecture: `Sidebar`, `Header`, `StatCard`, and `Dashboard`.
  - Centralized API service layer (`frontend/src/services/api.js`) using native `fetch`.
  - Non-blocking asynchronous data fetching with loading indicators and error states.
  - Resilient error handling: if the Express backend is not running, the frontend displays an informative alert banner without crashing.
  - Visual placeholders for future features in the sidebar navigation.

---

## 3. Technologies Used

### Frontend
- **React 18** (Component-based UI library)
- **JavaScript (ES6+)**
- **Vite** (Next-generation frontend tooling and development server)
- **HTML5 & CSS3** (Custom properties, Flexbox, CSS Grid)

### Backend
- **Node.js** (JavaScript runtime)
- **Express.js** (Web application framework)
- **dotenv** (Environment variable loader)

### Tooling
- **npm** (Node package manager)

---

## 4. Project Structure

```
ad_major_project/
│
├── frontend/                     # React Single Page Application (Vite)
│   ├── src/
│   │   ├── components/
│   │   │   ├── Sidebar.jsx       # Brand logo & navigation links (active + placeholders)
│   │   │   ├── Header.jsx        # Top header, live connection pill & refresh action
│   │   │   └── StatCard.jsx      # Reusable metric card with loading skeletons
│   │   │
│   │   ├── pages/
│   │   │   └── Dashboard.jsx     # Main dashboard view orchestrating data & layout
│   │   │
│   │   ├── services/
│   │   │   └── api.js            # Centralized API service handling all HTTP calls
│   │   │
│   │   ├── App.jsx               # Root layout shell (Sidebar + Dashboard)
│   │   ├── main.jsx              # React DOM entry point
│   │   └── index.css             # Global dark-navy SaaS stylesheet
│   │
│   ├── index.html                # HTML entry template
│   ├── vite.config.js            # Vite configuration (port 5173)
│   └── package.json              # Frontend scripts and dependencies
│
├── backend/                      # Node.js + Express REST API
│   ├── routes/
│   │   ├── healthRoutes.js       # GET /api/health implementation
│   │   └── dashboardRoutes.js    # GET /api/dashboard/stats implementation
│   │
│   ├── server.js                 # Server entry point, middleware, & route mounting
│   ├── package.json              # Backend scripts and dependencies
│   ├── .env.example              # Sample environment configuration template
│   └── .env                      # Local server environment configuration (gitignored)
│
├── .gitignore                    # Git ignore file for dependencies and build artifacts
└── README.md                     # Comprehensive project documentation
```

---

## 5. Prerequisites

Before running this project, ensure you have the following installed on your machine:
- **Node.js**: v18.0.0 or later (Node.js 20+ or 24+ recommended)
- **npm**: v9.0.0 or later

Verify your local versions by running:
```bash
node -v
npm -v
```

---

## 6. Installation & Setup

1. **Clone or navigate to the repository:**
   ```bash
   cd ad_major_project
   ```

2. **Install Backend Dependencies:**
   ```bash
   cd backend
   npm install
   ```

3. **Configure Backend Environment Variables:**
   A sample `.env.example` file is provided. Create your local `.env`:
   ```bash
   cp .env.example .env
   ```
   *(By default, `PORT=5000` is used).*

4. **Install Frontend Dependencies:**
   ```bash
   cd ../frontend
   npm install
   ```

---

## 7. Starting the Application

With our unified **`express.static()`** architecture, you can run the entire full-stack app with **a single command**!

### Start the Unified Server:
```bash
cd backend
npm start
```
* Express starts on **`http://localhost:5001`**.
* Open your browser and navigate to: **[http://localhost:5001](http://localhost:5001)**!
* The React dashboard will load instantly, and all `/api` calls are made to the same server with zero CORS.

### Optional: Frontend Development Mode
If making live UI changes with hot reload:
```bash
cd frontend
npm run dev
```
*(Vite proxies `/api` requests to Express on port 5001).*

---

## 8. Available Backend Routes

| Method | Endpoint | Description | Sample Response |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | API status and endpoint directory | `{"name":"API Sentinel Backend","status":"online"}` |
| `GET` | `/api/health` | Backend health check | `{"success":true,"message":"API Sentinel backend is running"}` |
| `GET` | `/api/dashboard/stats` | Illustrative Day 1 metrics | `{"success":true,"dataSource":"demo","data":{"totalApis":12,"healthyApis":9,"failedApis":3,"averageLatency":"245 ms"}}` |

### Testing with `curl`
You can verify the backend endpoints directly from your command line:

```bash
# Test health route
curl http://localhost:5001/api/health

# Test dashboard statistics route
curl http://localhost:5001/api/dashboard/stats
```

---

## 9. Frontend-Backend Communication Flow

Here is the exact lifecycle of a request in API Sentinel:

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│  React Browser  │       │  Frontend API   │       │ Express Backend │
│ (Dashboard.jsx) │       │   (api.js)      │       │   (server.js)   │
└────────┬────────┘       └────────┬────────┘       └────────┬────────┘
         │                         │                         │
         │  1. Mounts & calls      │                         │
         │  loadDashboardData()    │                         │
         ├────────────────────────>│                         │
         │                         │  2. HTTP GET            │
         │                         │  /api/health            │
         │                         │  /api/dashboard/stats   │
         │                         ├────────────────────────>│
         │                         │                         │ 3. Express Router
         │                         │                         │    executes handler
         │                         │  4. HTTP 200 OK + JSON  │
         │                         │<────────────────────────┤
         │  5. Resolves Promise    │                         │
         │<────────────────────────┤                         │
         │                         │                         │
         │  6. setState() updates: │                         │
         │     - stats             │                         │
         │     - backendStatus     │                         │
         │     - isLoading = false │                         │
         │                         │                         │
         │  7. Virtual DOM reconciles                        │
         │     and re-renders UI   │                         │
         ▼                         ▼                         ▼
```

### Key Error-Resilience Features
1. **Graceful Degradation:** If the Express backend is stopped, `frontend/src/services/api.js` catches the network error without crashing React.
2. **User Guidance:** The dashboard displays a clear banner with the exact command (`cd backend && npm start`) needed to launch the server.
3. **CORS Protected:** Express explicitly permits requests originating from Vite's local dev server (`http://localhost:5173`).

---

## 10. Troubleshooting & Verification

- **Frontend cannot connect to backend:**
  Ensure the backend is running on port 5001 (`curl http://localhost:5001/api/health`).
- **Port 5001 is in use:**
  Update `PORT=5002` in `backend/.env`. In `frontend/src/services/api.js`, set `VITE_API_URL=http://localhost:5002` or create `frontend/.env` with `VITE_API_URL=http://localhost:5002`.
- **CORS Error:**
  Check that the origin header matches the allowed origins in `backend/server.js`.
