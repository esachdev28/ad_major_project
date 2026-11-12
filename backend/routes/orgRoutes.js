/**
 * routes/orgRoutes.js
 *
 * Multi-Tenant Organization management routes:
 * - Listing and creating organizations
 * - Managing organization memberships and assigning RBAC roles
 */

const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

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
 * GET /api/organizations
 * Lists all organizations the authenticated user belongs to.
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const memberships = await prisma.organizationMember.findMany({
      where: { userId: req.user.id },
      include: {
        organization: {
          include: {
            _count: {
              select: { endpoints: true, members: true, services: true },
            },
          },
        },
      },
    });

    const orgs = memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      role: m.role,
      counts: m.organization._count,
      createdAt: m.organization.createdAt,
    }));

    res.json({ success: true, data: orgs });
  } catch (error) {
    console.error('List organizations error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve organizations.' });
  }
});

/**
 * POST /api/organizations
 * Creates a new organization with the calling user as OWNER.
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Organization name is required.' });
    }

    const orgName = name.trim();
    let baseSlug = slugify(orgName);
    let finalSlug = baseSlug;
    let count = 1;
    while (await prisma.organization.findUnique({ where: { slug: finalSlug } })) {
      finalSlug = `${baseSlug}-${count++}`;
    }

    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: orgName,
          slug: finalSlug,
        },
      });

      const member = await tx.organizationMember.create({
        data: {
          organizationId: org.id,
          userId: req.user.id,
          role: 'OWNER',
        },
      });

      return { org, member };
    });

    res.status(201).json({
      success: true,
      data: result.org,
      message: 'Organization created successfully.',
    });
  } catch (error) {
    console.error('Create organization error:', error);
    res.status(500).json({ success: false, message: 'Failed to create organization.' });
  }
});

/**
 * GET /api/organizations/:id/members
 * Retrieves members of an organization.
 */
router.get('/:id/members', requireAuth, async (req, res) => {
  try {
    const orgId = req.params.id;

    // Verify caller is a member
    const callerMember = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: req.user.id,
        },
      },
    });

    if (!callerMember) {
      return res.status(403).json({ success: false, message: 'You are not a member of this organization.' });
    }

    const members = await prisma.organizationMember.findMany({
      where: { organizationId: orgId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      success: true,
      data: members.map((m) => ({
        id: m.id,
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        joinedAt: m.createdAt,
      })),
    });
  } catch (error) {
    console.error('List members error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve members.' });
  }
});

/**
 * POST /api/organizations/:id/members
 * Invites / adds an existing user to the organization by email.
 * Requires OWNER or ADMIN role.
 */
router.post('/:id/members', requireAuth, async (req, res) => {
  try {
    const orgId = req.params.id;
    const { email, role = 'MEMBER' } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ success: false, message: 'User email is required.' });
    }
    const allowedRoles = ['OWNER', 'ADMIN', 'MEMBER'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'Role must be OWNER, ADMIN, or MEMBER.' });
    }

    // Verify caller has OWNER or ADMIN role
    const caller = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: req.user.id,
        },
      },
    });

    if (!caller || (caller.role !== 'OWNER' && caller.role !== 'ADMIN')) {
      return res.status(403).json({ success: false, message: 'Only organization Owners or Admins can add members.' });
    }

    const targetUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'No registered user found with that email.' });
    }

    const existingMember = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: targetUser.id,
        },
      },
    });

    if (existingMember) {
      return res.status(409).json({ success: false, message: 'User is already a member of this organization.' });
    }

    const newMember = await prisma.organizationMember.create({
      data: {
        organizationId: orgId,
        userId: targetUser.id,
        role,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    res.status(201).json({
      success: true,
      message: `User ${targetUser.email} added as ${role}.`,
      data: {
        id: newMember.id,
        userId: newMember.user.id,
        name: newMember.user.name,
        email: newMember.user.email,
        role: newMember.role,
      },
    });
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({ success: false, message: 'Failed to add member.' });
  }
});

module.exports = router;
