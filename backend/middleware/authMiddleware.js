/**
 * middleware/authMiddleware.js
 *
 * JWT authentication and Role-Based Access Control (RBAC) middleware for API Sentinel.
 * Enforces user authentication, extracts organization tenant context, and verifies permissions.
 */

const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'api-sentinel-jwt-secure-default-secret-2026';
const TOKEN_EXPIRY = '7d';

/**
 * Generates a signed JWT payload for an authenticated user and active organization.
 */
function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

/**
 * Verifies and decodes a JWT token.
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

/**
 * Middleware: Requires a valid JWT token.
 * Attaches req.user, req.organizationId, and req.userRole to the request object.
 */
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : req.headers['x-auth-token'];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please log in.',
    });
  }

  const decoded = verifyToken(token);
  if (!decoded || !decoded.userId) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired authentication token.',
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        memberships: {
          include: { organization: true },
        },
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User account not found.',
      });
    }

    // Determine active organization context
    const requestedOrgId = req.headers['x-organization-id'] || decoded.organizationId;
    let activeMembership = null;

    if (requestedOrgId) {
      activeMembership = user.memberships.find((m) => m.organizationId === requestedOrgId);
    }
    if (!activeMembership && user.memberships.length > 0) {
      activeMembership = user.memberships[0];
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
    };
    req.organizationId = activeMembership ? activeMembership.organizationId : null;
    req.organization = activeMembership ? activeMembership.organization : null;
    req.userRole = activeMembership ? activeMembership.role : 'MEMBER';

    next();
  } catch (err) {
    console.error('[Auth Middleware] Database error:', err.message);
    res.status(500).json({ success: false, message: 'Internal server error verifying authentication.' });
  }
}

/**
 * Middleware: Optional authentication.
 * If token is present, populates req.user and req.organizationId, but does not block unauthenticated calls.
 */
async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : req.headers['x-auth-token'];

  if (!token) {
    return next();
  }

  const decoded = verifyToken(token);
  if (decoded && decoded.userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: {
          memberships: {
            include: { organization: true },
          },
        },
      });

      if (user) {
        const requestedOrgId = req.headers['x-organization-id'] || decoded.organizationId;
        const activeMembership = user.memberships.find((m) => m.organizationId === requestedOrgId) || user.memberships[0];

        req.user = { id: user.id, name: user.name, email: user.email };
        req.organizationId = activeMembership ? activeMembership.organizationId : null;
        req.organization = activeMembership ? activeMembership.organization : null;
        req.userRole = activeMembership ? activeMembership.role : 'MEMBER';
      }
    } catch (_) {}
  }

  next();
}

/**
 * Middleware: Enforces specific Organization roles (e.g. ['OWNER', 'ADMIN']).
 */
function requireRole(allowedRoles = ['OWNER', 'ADMIN']) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    if (!req.userRole || !allowedRoles.includes(req.userRole)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: This action requires one of the following roles: ${allowedRoles.join(', ')}.`,
      });
    }
    next();
  };
}

module.exports = {
  generateToken,
  verifyToken,
  requireAuth,
  optionalAuth,
  requireRole,
};
