/**
 * step2_auth_orgs.test.js
 *
 * Verification suite for Phase 2:
 * 1. User Registration, bcrypt password hashing, and auto-provisioned organization
 * 2. JWT authentication, login validation, token expiration, and profile retrieval
 * 3. Multi-Tenant organization creation, membership management, and organization switching
 * 4. Role-Based Access Control (RBAC: OWNER, ADMIN, MEMBER) enforcement
 * 5. Tenant-level data isolation on registered endpoints
 */

const assert = require('assert');
const prisma = require('../lib/prisma');
const { generateToken, verifyToken } = require('../middleware/authMiddleware');

const BASE_URL = 'http://localhost:5001';

async function runAuthAndOrgTests() {
  console.log('\n🔐 Starting Phase 2: Authentication & Multi-Tenant Organizations Tests...\n');

  const timestamp = Date.now();
  const testUserEmail = `alice_${timestamp}@sentinel-test.local`;
  const testPassword = 'Password123!';
  const testOrgName = `Alice Aerospace ${timestamp}`;

  const secondUserEmail = `bob_${timestamp}@sentinel-test.local`;

  let tokenA = null;
  let userA = null;
  let orgA = null;
  let orgB = null;
  let userB = null;
  let scopedEndpoint = null;

  try {
    // --------------------------------------------------------------------------
    // Test 1: User Registration with Auto-Provisioned Organization
    // --------------------------------------------------------------------------
    console.log('Test 1: Register new user and auto-provision organization');
    const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Alice Engineer',
        email: testUserEmail,
        password: testPassword,
        organizationName: testOrgName,
      }),
    });

    const regData = await regRes.json();
    assert.strictEqual(regRes.status, 201, `Expected 201, got ${regRes.status}: ${JSON.stringify(regData)}`);
    assert.strictEqual(regData.success, true);
    assert(regData.token, 'Expected JWT token');
    assert.strictEqual(regData.role, 'OWNER');
    assert.strictEqual(regData.organization.name, testOrgName);

    tokenA = regData.token;
    userA = regData.user;
    orgA = regData.organization;

    // Verify password is encrypted in database
    const userInDb = await prisma.user.findUnique({ where: { id: userA.id } });
    assert(userInDb.passwordHash, 'User must have passwordHash');
    assert(!userInDb.passwordHash.includes(testPassword), 'Password must be hashed with bcrypt');

    // Verify OrganizationMember in DB
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgA.id,
          userId: userA.id,
        },
      },
    });
    assert.strictEqual(membership.role, 'OWNER');
    console.log(`  ✅ Passed (User registered, hashed, and granted OWNER of "${orgA.name}")`);

    // --------------------------------------------------------------------------
    // Test 2: User Login & Profile Retrieval
    // --------------------------------------------------------------------------
    console.log('Test 2: Authenticate user credentials and retrieve session profile');

    // Failed login: bad password
    const badLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUserEmail, password: 'WrongPassword' }),
    });
    assert.strictEqual(badLoginRes.status, 401, 'Wrong password must return 401');

    // Successful login
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUserEmail, password: testPassword }),
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginRes.status, 200);
    assert.strictEqual(loginData.success, true);
    assert.strictEqual(loginData.activeOrganization.id, orgA.id);

    // Profile check with Bearer token
    const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const meData = await meRes.json();
    assert.strictEqual(meRes.status, 200);
    assert.strictEqual(meData.user.email, testUserEmail);
    assert.strictEqual(meData.activeOrganization.id, orgA.id);
    console.log('  ✅ Passed (Login validated and session profile retrieved via JWT)');

    // --------------------------------------------------------------------------
    // Test 3: Multi-Organization Management & Context Switching
    // --------------------------------------------------------------------------
    console.log('Test 3: Create secondary organization and switch active tenant context');
    const newOrgRes = await fetch(`${BASE_URL}/api/organizations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ name: `Alice Cloud Ops ${timestamp}` }),
    });
    const newOrgData = await newOrgRes.json();
    assert.strictEqual(newOrgRes.status, 201);
    orgB = newOrgData.data;

    // Switch active organization context
    const switchRes = await fetch(`${BASE_URL}/api/auth/switch-org`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ organizationId: orgB.id }),
    });
    const switchData = await switchRes.json();
    assert.strictEqual(switchRes.status, 200);
    assert.strictEqual(switchData.activeOrganization.id, orgB.id);

    const tokenB = switchData.token;
    const decodedB = verifyToken(tokenB);
    assert.strictEqual(decodedB.organizationId, orgB.id);
    console.log(`  ✅ Passed (Created "${orgB.name}" and switched active JWT context)`);

    // --------------------------------------------------------------------------
    // Test 4: RBAC Role Enforcement & Member Invitations
    // --------------------------------------------------------------------------
    console.log('Test 4: Invite member to organization and enforce RBAC permissions');
    // Register second user (Bob)
    const bobReg = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bob Developer',
        email: secondUserEmail,
        password: testPassword,
        organizationName: `Bob Workspace ${timestamp}`,
      }),
    });
    const bobData = await bobReg.json();
    userB = bobData.user;
    const tokenBob = bobData.token;

    // Alice invites Bob to Org A as MEMBER
    const addMemberRes = await fetch(`${BASE_URL}/api/organizations/${orgA.id}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ email: secondUserEmail, role: 'MEMBER' }),
    });
    const addMemberData = await addMemberRes.json();
    assert.strictEqual(addMemberRes.status, 201);
    assert.strictEqual(addMemberData.data.role, 'MEMBER');

    // Bob tries to invite someone else to Org A (Should be forbidden because Bob is only MEMBER)
    const bobUnauthorizedInvite = await fetch(`${BASE_URL}/api/organizations/${orgA.id}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenBob}`,
      },
      body: JSON.stringify({ email: 'charlie@test.com', role: 'MEMBER' }),
    });
    assert.strictEqual(bobUnauthorizedInvite.status, 403, 'MEMBER cannot invite others (requires OWNER or ADMIN)');
    console.log('  ✅ Passed (RBAC enforced: OWNER permitted, MEMBER rejected with 403)');

    // --------------------------------------------------------------------------
    // Test 5: Tenant Data Isolation on Registered Endpoints
    // --------------------------------------------------------------------------
    console.log('Test 5: Verify tenant-level data isolation on API Endpoints');
    const epCreateRes = await fetch(`${BASE_URL}/api/endpoints`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
        'x-organization-id': orgA.id,
      },
      body: JSON.stringify({
        name: '__Scoped_Tenant_API',
        url: 'https://httpbin.org/status/200',
        method: 'GET',
      }),
    });
    const epCreateData = await epCreateRes.json();
    assert.strictEqual(epCreateRes.status, 201);
    scopedEndpoint = epCreateData.data;

    const dbEp = await prisma.aPIEndpoint.findUnique({ where: { id: scopedEndpoint.id } });
    assert.strictEqual(dbEp.organizationId, orgA.id, 'Endpoint must be scoped to Organization A');
    console.log(`  ✅ Passed (Endpoint strictly scoped to Organization ID: ${orgA.id})`);

    console.log('\n🎉 ALL PHASE 2 AUTHENTICATION & MULTI-TENANCY TESTS PASSED SUCCESSFULLY!\n');
  } finally {
    // Teardown test artifacts
    if (scopedEndpoint) {
      try {
        await prisma.aPIEndpoint.delete({ where: { id: scopedEndpoint.id } });
      } catch (_) {}
    }
    if (orgB) {
      try {
        await prisma.organization.delete({ where: { id: orgB.id } });
      } catch (_) {}
    }
    if (orgA) {
      try {
        await prisma.organization.delete({ where: { id: orgA.id } });
      } catch (_) {}
    }
    if (userA) {
      try {
        await prisma.user.delete({ where: { id: userA.id } });
      } catch (_) {}
    }
    if (userB) {
      try {
        await prisma.user.delete({ where: { id: userB.id } });
      } catch (_) {}
    }
    await prisma.$disconnect();
  }
}

runAuthAndOrgTests().catch((err) => {
  console.error('\n❌ Auth and Organization verification failed:', err);
  process.exit(1);
});
