/**
 * healthRoutes.js
 * 
 * 1. Why this file exists:
 *    Provides dedicated health-check routing for API Sentinel. A health route allows
 *    the frontend and external monitoring tools to verify whether the backend server
 *    and the PostgreSQL database are actively running and capable of responding to queries.
 * 
 * 2. What its responsibilities are:
 *    - Listen for GET requests on '/' (/api/health) to verify the Express server is online.
 *    - Listen for GET requests on '/db' (/api/health/db) to verify PostgreSQL connectivity using Prisma.
 *    - Return lightweight, standard JSON responses with safe, non-leaking error handling.
 * 
 * 3. Which functions/handlers it contains:
 *    - GET / : Server health confirmation (`{ success: true, message: "API Sentinel backend is running" }`).
 *    - GET /db : Database connectivity check (`{ success: true, message: "Database connection successful" }`).
 * 
 * 4. How it communicates with other files:
 *    - Uses Express Router (`express.Router()`).
 *    - Imports `prisma` singleton from `../lib/prisma`.
 *    - Exported via `module.exports` and mounted in `server.js` under the `/api/health` path.
 * 
 * 5. Database Request Flow:
 *    React Dashboard -> Express Route (/api/health/db) -> Prisma Client (prisma.$queryRaw`SELECT 1`)
 *    -> PostgreSQL Server -> Prisma Response -> Express JSON Response -> React State -> UI Update.
 */

const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

// GET /api/health
// Returns server health confirmation
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API Sentinel backend is running'
  });
});

// GET /api/health/db
// Verifies active connection to the PostgreSQL database via Prisma
router.get('/db', async (req, res) => {
  try {
    // Perform a lightweight probe query to verify DB connection
    await prisma.$queryRaw`SELECT 1`;

    return res.status(200).json({
      success: true,
      message: 'Database connection successful'
    });
  } catch (error) {
    // Safe error logging on the server without leaking DB credentials to the client
    console.error('Database health check failed:', error.message);

    return res.status(503).json({
      success: false,
      message: 'Database connection failed. PostgreSQL is unreachable.'
    });
  }
});

module.exports = router;
