/**
 * healthRoutes.js
 * 
 * 1. Why this file exists:
 *    Provides dedicated health-check routing for API Sentinel. A health route allows
 *    the frontend and external monitoring tools to verify whether the backend server
 *    is actively running and capable of responding to HTTP requests.
 * 
 * 2. What its responsibilities are:
 *    - Listen for GET requests on the root path of this router ('/').
 *    - Return a lightweight, standard JSON response with HTTP 200 OK status.
 * 
 * 3. Which functions/handlers it contains:
 *    - GET / handler: Sends `{ success: true, message: "API Sentinel backend is running" }`.
 * 
 * 4. How it communicates with other files:
 *    - Uses Express Router (`express.Router()`).
 *    - Exported via `module.exports` and mounted in `server.js` under the `/api/health` path.
 * 
 * 5. Why this chosen approach is appropriate:
 *    - Separating routes into individual files keeps `server.js` clean and manageable.
 *    - It avoids monolithic route definitions while remaining simple and beginner-friendly,
 *      without introducing redundant controllers or service layers for a simple endpoint.
 */

const express = require('express');
const router = express.Router();

// GET /api/health
// Returns server health confirmation
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API Sentinel backend is running'
  });
});

module.exports = router;
