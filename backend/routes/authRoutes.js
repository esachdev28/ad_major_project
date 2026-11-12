/**
 * routes/authRoutes.js
 *
 * Authentication routes for API Sentinel:
 * - User registration with automated default organization provisioning
 * - User login with bcrypt password verification and JWT token issuance
 * - Current authenticated user / session profile retrieval
 * - Active organization workspace switching
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { generateToken, requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || `org-${Date.now()}`;
}

/**
 * POST /api/auth/register
 * Registers a new user and creates their primary organization.
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, organizationName } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Full name is required.' });
    }
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ success: false, message: 'Valid email address is required.' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const orgName = (organizationName && organizationName.trim()) || `${name.trim()}'s Team`;

    let baseSlug = slugify(orgName);
    let finalSlug = baseSlug;
    let count = 1;
    while (await prisma.organization.findUnique({ where: { slug: finalSlug } })) {
      finalSlug = `${baseSlug}-${count++}`;
    }

    // Atomically create User, Organization, and Owner Membership
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: name.trim(),
          email: normalizedEmail,
          passwordHash,
        },
      });

      const org = await tx.organization.create({
        data: {
          name: orgName,
          slug: finalSlug,
        },
      });

      const member = await tx.organizationMember.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          role: 'OWNER',
        },
      });

      return { user, org, member };
    });

    const token = generateToken({
      userId: result.user.id,
      email: result.user.email,
      organizationId: result.org.id,
      role: 'OWNER',
    });

    res.status(201).json({
      success: true,
      message: 'Account registered successfully.',
      token,
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
      },
      organization: result.org,
      role: 'OWNER',
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: 'Failed to create user account.' });
  }
});

/**
 * POST /api/auth/login
 * Authenticates user credentials and returns JWT token with tenant organizations.
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        memberships: {
          include: { organization: true },
        },
      },
    });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // If user has no passwordHash (e.g. legacy seed account), reject or require password
    if (!user.passwordHash) {
      return res.status(401).json({
        success: false,
        message: 'This account was created without a password. Please register a new account.',
      });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const primaryMembership = user.memberships[0] || null;
    const organizationId = primaryMembership ? primaryMembership.organizationId : null;
    const role = primaryMembership ? primaryMembership.role : 'MEMBER';

    const token = generateToken({
      userId: user.id,
      email: user.email,
      organizationId,
      role,
    });

    res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      activeOrganization: primaryMembership ? primaryMembership.organization : null,
      role,
      organizations: user.memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        role: m.role,
      })),
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Failed to authenticate user.' });
  }
});

/**
 * GET /api/auth/me
 * Retrieves profile of currently authenticated user.
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        memberships: {
          include: { organization: true },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      activeOrganization: req.organization,
      role: req.userRole,
      organizations: user.memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        role: m.role,
      })),
    });
  } catch (error) {
    console.error('Fetch me error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve profile.' });
  }
});

/**
 * POST /api/auth/switch-org
 * Switches active organization context and returns a newly scoped JWT token.
 */
router.post('/switch-org', requireAuth, async (req, res) => {
  try {
    const { organizationId } = req.body;
    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'Organization ID is required.' });
    }

    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: req.user.id,
        },
      },
      include: { organization: true },
    });

    if (!membership) {
      return res.status(403).json({ success: false, message: 'You are not a member of this organization.' });
    }

    const token = generateToken({
      userId: req.user.id,
      email: req.user.email,
      organizationId: membership.organizationId,
      role: membership.role,
    });

    res.json({
      success: true,
      token,
      activeOrganization: membership.organization,
      role: membership.role,
      message: `Switched to organization: ${membership.organization.name}`,
    });
  } catch (error) {
    console.error('Switch organization error:', error);
    res.status(500).json({ success: false, message: 'Failed to switch organization.' });
  }
});

module.exports = router;
