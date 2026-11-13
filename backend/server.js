/**
 * server.js
 * 
 * 1. Why this file exists:
 *    The main entry point for the API Sentinel full-stack Express application. It initializes
 *    the Express server, registers core middleware (JSON parsing, static assets), mounts API routes,
 *    manages database connections with Prisma, and begins listening on a single unified port.
 * 
 * 2. What its responsibilities are:
 *    - Load environment variables from `.env` using dotenv.
 *    - Parse incoming JSON payloads using `express.json()`.
 *    - Serve React frontend static build files using built-in `express.static()`.
 *    - Mount route modules (`healthRoutes` and `dashboardRoutes`).
 *    - Provide graceful process shutdown to disconnect Prisma when terminating.
 *    - Fallback 404 handler for API routes and wildcard SPA fallback for client routes.
 *    - Centralized error-handling middleware.
 *    - Start the HTTP server on configurable PORT.
 * 
 * 3. Which functions/handlers it contains:
 *    - Express application initialization (`const app = express()`).
 *    - Route mounting (`/api/health`, `/api/dashboard`).
 *    - Graceful shutdown handlers (`shutdown(signal)` for SIGINT/SIGTERM).
 *    - Server startup listener (`app.listen(...)`).
 * 
 * 4. How it communicates with other files:
 *    - Imports `prisma` from `./lib/prisma` for connection teardown.
 *    - Imports `healthRoutes.js` and mounts it at `/api/health`.
 *    - Imports `dashboardRoutes.js` and mounts it at `/api/dashboard`.
 *    - Serves `frontend/dist` directly to the client browser.
 *    - Reads PORT from `process.env` (configured via `.env` or defaults to 5001).
 * 
 * 5. Database Request Flow:
 *    React Dashboard -> Express Route -> Prisma Client -> PostgreSQL
 *    -> Prisma Response -> Express JSON Response -> React State -> UI Update.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const prisma = require('./lib/prisma');

// Import route modules
const healthRoutes = require('./routes/healthRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const endpointRoutes = require('./routes/endpointRoutes');
const incidentRoutes = require('./routes/incidentRoutes');
const versionRoutes = require('./routes/versionRoutes');
const integrationRoutes = require('./routes/integrationRoutes');
const contractRoutes = require('./routes/contractRoutes');
const dependencyRoutes = require('./routes/dependencyRoutes');
const mcpRoutes = require('./routes/mcpRoutes');
const diagnosticsRoutes = require('./routes/diagnosticsRoutes');
const authRoutes = require('./routes/authRoutes');
const orgRoutes = require('./routes/orgRoutes');
const { apiLimiter } = require('./middleware/rateLimiter');

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

// Global API rate limiting (Phase 13 Security Hardening)
app.use('/api', apiLimiter);

// Mount dedicated API routers
app.use('/api/auth', authRoutes);
app.use('/api/organizations', orgRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/endpoints', endpointRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/versions', versionRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/dependencies', dependencyRoutes);
app.use('/api/mcp', mcpRoutes);
app.use('/api/diagnostics', diagnosticsRoutes);

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
          dbHealth: '/api/health/db',
          stats: '/api/dashboard/stats',
          endpoints: '/api/endpoints',
          incidents: '/api/incidents',
          versions: '/api/versions',
          integrations: '/api/integrations',
          mcpTools: '/api/mcp/tools'
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
  if (err instanceof SyntaxError && err.status === 400 && Object.hasOwn(err, 'body')) {
    return res.status(400).json({ success: false, message: 'Request body contains invalid JSON.' });
  }
  console.error('Unhandled server error:', err.stack || err.message);
  res.status(500).json({
    success: false,
    message: 'Internal server error occurred in API Sentinel backend'
  });
});

// ==========================================
// Graceful Process Termination
// ==========================================
// Ensures Prisma disconnects properly when Node.js process is stopped (Ctrl+C / SIGTERM)
const handleShutdown = async (signal) => {
  console.log(`\n[${new Date().toISOString()}] Received ${signal}. Disconnecting Prisma client...`);
  try {
    await prisma.$disconnect();
    console.log('🛡️  Prisma client disconnected gracefully.');
  } catch (error) {
    console.error('Error during Prisma disconnect:', error.message);
  } finally {
    process.exit(0);
  }
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

// ==========================================
// Start Server
// ==========================================
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`🛡️  API Sentinel Unified Server with PostgreSQL & Prisma`);
    console.log(`🚀 Unified Web & API Server: http://localhost:${PORT}`);
    console.log(`🩺 Server Health check:     http://localhost:${PORT}/api/health`);
    console.log(`🗄️  Database Health check:   http://localhost:${PORT}/api/health/db`);
    console.log(`📊 Dashboard stats endpoint: http://localhost:${PORT}/api/dashboard/stats`);
    console.log(`🌐 Endpoints & Probing:      http://localhost:${PORT}/api/endpoints`);
    console.log(`🚨 Incidents audit log:      http://localhost:${PORT}/api/incidents`);
    console.log(`📐 Versioning & Diff Engine: http://localhost:${PORT}/api/versions`);
    console.log(`🔗 Consumer Integrations:    http://localhost:${PORT}/api/integrations`);
    console.log(`🤖 MCP Diagnostic Server:    http://localhost:${PORT}/api/mcp/tools`);
    console.log(`===============================================`);
  });
}

// Export app for testing purposes
module.exports = app;
