/**
 * dashboardRoutes.js
 * 
 * 1. Why this file exists:
 *    Serves dashboard-related endpoints for API Sentinel, specifically providing
 *    high-level operational statistics for display on the frontend dashboard.
 * 
 * 2. What its responsibilities are:
 *    - Handle GET requests for `/api/dashboard/stats`.
 *    - Return the four illustrative Day 1 statistics with a clear "dataSource": "demo"
 *      flag so demo data is never confused with live production monitoring.
 * 
 * 3. Which functions/handlers it contains:
 *    - GET /stats handler: Returns total APIs, healthy APIs, failed APIs, and average latency.
 * 
 * 4. How it communicates with other files:
 *    - Creates an Express Router (`express.Router()`).
 *    - Exported via `module.exports` and mounted in `server.js` under `/api/dashboard`.
 *    - Consumed by the frontend service `frontend/src/services/api.js`.
 * 
 * 5. Why this chosen approach is appropriate:
 *    - Directly returning clean JSON meets the project's Day 1 requirements without
 *      over-engineering a database repository or complex service layer before Day 2.
 *    - Keeps statistics decoupled from the health check endpoint.
 */

const express = require('express');
const router = express.Router();

// GET /api/dashboard/stats
// Returns the illustrative Day 1 statistics
router.get('/stats', (req, res) => {
  res.status(200).json({
    success: true,
    dataSource: 'demo',
    data: {
      totalApis: 12,
      healthyApis: 9,
      failedApis: 3,
      averageLatency: '245 ms'
    },
    message: 'Illustrative demo statistics for Day 1 dashboard foundation'
  });
});

module.exports = router;
