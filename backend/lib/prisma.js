/**
 * lib/prisma.js
 *
 * 1. Why this file exists:
 *    Centralizes the Prisma Client initialization for API Sentinel into a single,
 *    reusable singleton instance.
 *
 * 2. What its responsibilities are:
 *    - Instantiate the PrismaClient.
 *    - Prevent multiple database connection pool instances from being spawned
 *      in development environments during hot-reloads.
 *    - Export the single shared `prisma` instance across all Express routes.
 *
 * 3. Which functions/objects it contains:
 *    - `prisma`: Standard PrismaClient instance.
 *
 * 4. How it communicates with other files:
 *    - Imported by `routes/healthRoutes.js` and `routes/dashboardRoutes.js` to run queries.
 *    - Imported by `server.js` for graceful shutdown connection teardown.
 *
 * 5. Why this chosen approach is appropriate:
 *    - Follows the official Prisma singleton pattern for Node.js applications.
 *    - Simple, beginner-friendly CommonJS export that avoids connection exhaustion.
 *
 * 6. Database Request Flow:
 *    React Dashboard -> Express Route -> Prisma Client -> PostgreSQL
 *    -> Prisma Response -> Express JSON Response -> React State -> UI Update.
 */

const { PrismaClient } = require('@prisma/client');

// In development, Node.js hot-reloads can create duplicate client instances.
// We store the client on the global object in non-production environments to reuse it.
const globalForPrisma = global;

const prisma = globalForPrisma.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;
