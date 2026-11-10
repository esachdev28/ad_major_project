/**
 * server.js
 * 
 * 1. Why this file exists:
 *    The main entry point for the API Sentinel full-stack Express application. It initializes
 *    the Express server, registers core middleware (JSON parsing, static assets), mounts API routes,
 *    and begins listening for incoming HTTP connections on a single unified port.
 * 
 * 2. What its responsibilities are:
 *    - Load environment variables from `.env` using dotenv.
 *    - Parse incoming JSON payloads using `express.json()`.
 *    - Serve the React frontend static build files using built-in `express.static()`.
 *      (By serving frontend and backend from the same port, CORS is completely bypassed naturally!)
 *    - Mount route modules (`healthRoutes` and `dashboardRoutes`).
 *    - Provide a fallback 404 handler for unknown API routes.
 *    - Provide a wildcard SPA fallback for React client routing.
 *    - Centralized error handling middleware.
 *    - Start the HTTP server on a configurable port.
 * 
 * 3. Which functions/handlers it contains:
 *    - Express application initialization (`const app = express()`).
 *    - Middleware configuration calls (`app.use(...)`).
 *    - API router mounting (`/api/health`, `/api/dashboard`).
 *    - Static file serving (`express.static(...)`).
 *    - Global error handler middleware (`(err, req, res, next) => ...`).
 *    - Server startup listener (`app.listen(...)`).
 * 
 * 4. How it communicates with other files:
 *    - Imports `healthRoutes.js` and mounts it at `/api/health`.
 *    - Imports `dashboardRoutes.js` and mounts it at `/api/dashboard`.
 *    - Serves `frontend/dist` directly to the client browser.
 *    - Reads PORT from `process.env` (configured via `.env` or defaults to 5001).
 * 
 * 5. Why this chosen approach is appropriate:
 *    - 100% compliant with standard first-year B.Tech syllabus (core Express & Node.js).
 *    - Eliminates the need for external `cors` libraries: both client UI and API endpoints
 *      share the EXACT same origin (protocol, domain, port).
 *    - Clean, elegant, and very easy to defend in college viva examination.
 */

// Load environment variables from .env file (if present)
require('dotenv').config();

const express = require('express');
const path = require('path');

// Import route modules
const healthRoutes = require('./routes/healthRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');

const app = express();

// Determine port from environment or fallback to 5001
const PORT = process.env.PORT || 5001;

// ==========================================
// Middleware Configuration
// ==========================================

// Parse incoming requests with JSON payloads (core Express middleware)
app.use(express.json());

// Request logging middleware (shows incoming requests in terminal for debugging)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// ==========================================
// Static File Serving (Core Express Syllabus)
// ==========================================
// By serving the compiled React frontend directly from Express, both the frontend
// and API live on the exact same port (e.g. 5001).
// Result: SAME ORIGIN = ZERO CORS REQUIRED!
const distPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(distPath));

// ==========================================
// API Route Mounts
// ==========================================

// Mount dedicated API routers
app.use('/api/health', healthRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Fallback for unmatched /api requests (returns clean JSON 404)
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint not found: ${req.method} ${req.originalUrl}`
  });
});

// For any other request, serve React's index.html (SPA Fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) {
      // If frontend hasn't been built yet, provide friendly developer guidance
      res.status(200).json({
        name: 'API Sentinel Backend',
        status: 'online',
        notice: 'React frontend build not found. Run "cd frontend && npm run build" to serve the UI here.',
        endpoints: {
          health: '/api/health',
          stats: '/api/dashboard/stats'
        }
      });
    }
  });
});

// ==========================================
// Error Handling
// ==========================================

// Centralized error-handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err.stack || err.message);
  res.status(500).json({
    success: false,
    message: 'Internal server error occurred in API Sentinel backend'
  });
});

// ==========================================
// Start Server
// ==========================================
app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🛡️  API Sentinel Unified Server (Zero-CORS Architecture)`);
  console.log(`🚀 Unified Web & API Server: http://localhost:${PORT}`);
  console.log(`🩺 Health check endpoint:   http://localhost:${PORT}/api/health`);
  console.log(`📊 Dashboard stats endpoint: http://localhost:${PORT}/api/dashboard/stats`);
  console.log(`===============================================`);
});

// Export app for testing purposes
module.exports = app;
