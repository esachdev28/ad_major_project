/**
 * api.js
 *
 * 1. Why this file exists:
 *    Centralizes all HTTP communication between the React frontend and Express backend.
 *    By placing network requests here, we prevent hardcoding API URLs across multiple
 *    components and maintain a single source of truth for backend endpoints.
 *
 * 2. What its responsibilities are:
 *    - Define the backend Base URL (configurable via Vite env variables or fallback).
 *    - Execute HTTP GET requests to `/api/health` and `/api/dashboard/stats`.
 *    - Handle network errors gracefully (e.g. backend down / connection refused).
 *    - Parse JSON responses and return structured data to calling components.
 *
 * 3. Which functions it contains:
 *    - `checkHealth()`: Checks backend server connectivity and returns health status.
 *    - `checkDbHealth()`: Checks PostgreSQL database connectivity via Prisma.
 *    - `getDashboardStats()`: Fetches live database statistics from Express.
 *
 * 4. How it communicates with other files:
 *    - Imported by `Dashboard.jsx` (or other pages/components) to fetch data.
 *    - Communicates over HTTP with Express routes running on `http://localhost:5001`.
 *
 * 5. Why this chosen approach is appropriate:
 *    - Native `fetch` is built into modern browsers; no extra library (like Axios) needed.
 *    - Clean async/await syntax is easy for a first-year student to understand and explain.
 *    - Centralized error handling prevents unhandled promise rejections and UI crashes.
 */

// Base URL for the API Sentinel backend.
// In our unified, zero-CORS architecture, API calls use relative paths ('') by default
// because the React app and Express API are served from the exact same origin!
// Can still be overridden with VITE_API_URL if connecting to a separate host.
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

/**
 * Helper to execute a fetch request with timeout and friendly error formatting.
 * Handles the scenario where the Express server is not running at all.
 *
 * @param {string} endpoint - The path to fetch (e.g. '/api/health')
 * @param {RequestInit} [options={}] - Standard fetch options (method, headers, body)
 * @returns {Promise<any>} - Parsed JSON response
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;

  const defaultHeaders = {
    'Content-Type': 'application/json',
  };

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        ...defaultHeaders,
        ...(options.headers || {})
      },
      body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined
    });

    if (!response.ok) {
      // Try to parse the backend's JSON error response to extract custom error message
      let errorMessage = `Server responded with status ${response.status}: ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData && errorData.message) {
          errorMessage = errorData.message;
        }
      } catch (_) {
        // Fallback to HTTP status message if response is not JSON
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    // If fetch failed due to network / connection refused (e.g. backend offline)
    if (error.name === 'TypeError') {
      const host = API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5001');
      throw new Error(`Cannot connect to backend at ${host}. Ensure Express is running.`);
    }
    // Re-throw with original or enhanced message
    throw error;
  }
}

/**
 * Checks the health status of the Express backend.
 * Calls: GET /api/health
 *
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function checkHealth() {
  return await apiRequest('/api/health');
}

/**
 * Checks the database connectivity status of PostgreSQL via Prisma.
 * Calls: GET /api/health/db
 *
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function checkDbHealth() {
  return await apiRequest('/api/health/db');
}

/**
 * Fetches dashboard operational metrics from Express.
 * Calls: GET /api/dashboard/stats
 *
 * @returns {Promise<{success: boolean, dataSource: string, data: {totalApis: number, healthyApis: number, failedApis: number, averageLatency: string}}>}
 */
export async function getDashboardStats() {
  return await apiRequest('/api/dashboard/stats');
}

/**
 * Endpoints API: Lists all registered endpoints with latest check and open incident status
 * Calls: GET /api/endpoints
 */
export async function getEndpoints() {
  return await apiRequest('/api/endpoints');
}

/**
 * Endpoints API: Registers a new endpoint for monitoring
 * Calls: POST /api/endpoints
 */
export async function createEndpoint(endpointData) {
  return await apiRequest('/api/endpoints', {
    method: 'POST',
    body: endpointData
  });
}

/**
 * Endpoints API: Executes active failure detection probe on an endpoint
 * Calls: POST /api/endpoints/:id/probe
 */
export async function probeEndpoint(id) {
  return await apiRequest(`/api/endpoints/${id}/probe`, {
    method: 'POST'
  });
}

/**
 * Endpoints API: Deletes an endpoint
 * Calls: DELETE /api/endpoints/:id
 */
export async function deleteEndpoint(id) {
  return await apiRequest(`/api/endpoints/${id}`, {
    method: 'DELETE'
  });
}

/**
 * Incidents API: Lists operational incidents
 * Calls: GET /api/incidents
 */
export async function getIncidents(status = '') {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return await apiRequest(`/api/incidents${query}`);
}

/**
 * Incidents API: Updates incident status (e.g. RESOLVED)
 * Calls: PATCH /api/incidents/:id
 */
export async function updateIncidentStatus(id, status) {
  return await apiRequest(`/api/incidents/${id}`, {
    method: 'PATCH',
    body: { status }
  });
}

/**
 * Breaking-Change Engine: Compares two OpenAPI specs for breaking changes
 * Calls: POST /api/versions/diff
 */
export async function diffSpecifications(diffPayload) {
  return await apiRequest('/api/versions/diff', {
    method: 'POST',
    body: diffPayload
  });
}

/**
 * Impact Assessment Engine: Computes blast radius and lists affected consumers
 * Calls: GET /api/integrations/impact/:endpointId
 */
export async function getImpactAssessment(endpointId) {
  return await apiRequest(`/api/integrations/impact/${endpointId}`);
}

/**
 * MCP Diagnostics: Lists available tools
 * Calls: GET /api/mcp/tools
 */
export async function getMcpTools() {
  return await apiRequest('/api/mcp/tools');
}

/**
 * MCP Diagnostics: Invokes an MCP diagnostic tool
 * Calls: POST /api/mcp/tools/call
 */
export async function callMcpTool(name, args = {}) {
  return await apiRequest('/api/mcp/tools/call', {
    method: 'POST',
    body: { name, arguments: args }
  });
}

export { API_BASE_URL };
