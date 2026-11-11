/**
 * seed.js — Database Seed Script for API Sentinel
 *
 * Populates PostgreSQL with realistic initial data:
 * - Default Developer User
 * - Registered API Endpoints
 * - Baseline Health Check logs (with realistic latencies & statuses)
 * - An initial open Incident
 * - Baseline OpenAPI 3.0 specification contract
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting API Sentinel database seeding...');

  // 1. Create or upsert default user
  const user = await prisma.user.upsert({
    where: { email: 'dev@apisentinel.local' },
    update: {},
    create: {
      name: 'Sentinel Core Team',
      email: 'dev@apisentinel.local',
    },
  });
  console.log(`👤 User verified: ${user.name} (${user.id})`);

  // 2. Clear existing sample data for clean re-seed
  await prisma.healthCheck.deleteMany({});
  await prisma.incident.deleteMany({});
  await prisma.aPIVersion.deleteMany({});
  await prisma.aPIEndpoint.deleteMany({});

  // 3. Create Sample Endpoints
  const endpointsData = [
    {
      name: 'User Authentication Service',
      url: 'https://httpbin.org/status/200',
      method: 'GET',
      description: 'Handles token verification and user session authentication',
      userId: user.id,
    },
    {
      name: 'Order Processing Service',
      url: 'https://httpbin.org/json',
      method: 'GET',
      description: 'REST API for customer order placement and status queries',
      userId: user.id,
    },
    {
      name: 'Inventory Warehouse API',
      url: 'https://httpbin.org/delay/1',
      method: 'GET',
      description: 'Inventory management and stock level synchronization',
      userId: user.id,
    },
    {
      name: 'Payment Processing Gateway',
      url: 'https://httpbin.org/status/500',
      method: 'POST',
      description: 'Third-party payment processor integration for transaction capture',
      userId: user.id,
    },
  ];

  const createdEndpoints = [];
  for (const ep of endpointsData) {
    const created = await prisma.aPIEndpoint.create({ data: ep });
    createdEndpoints.push(created);
    console.log(`🔗 Registered endpoint: ${created.name} [${created.method} ${created.url}]`);
  }

  // 4. Seed Health Checks for each endpoint
  const now = new Date();
  
  // Endpoint 1: Auth Service (Healthy, fast)
  for (let i = 5; i >= 0; i--) {
    await prisma.healthCheck.create({
      data: {
        endpointId: createdEndpoints[0].id,
        statusCode: 200,
        latency: 35 + Math.floor(Math.random() * 20),
        isHealthy: true,
        checkedAt: new Date(now.getTime() - i * 60000),
      },
    });
  }

  // Endpoint 2: Order Service (Healthy, normal)
  for (let i = 5; i >= 0; i--) {
    await prisma.healthCheck.create({
      data: {
        endpointId: createdEndpoints[1].id,
        statusCode: 200,
        latency: 80 + Math.floor(Math.random() * 30),
        isHealthy: true,
        checkedAt: new Date(now.getTime() - i * 60000),
      },
    });
  }

  // Endpoint 3: Inventory API (Healthy, moderate latency)
  for (let i = 5; i >= 0; i--) {
    await prisma.healthCheck.create({
      data: {
        endpointId: createdEndpoints[2].id,
        statusCode: 200,
        latency: 220 + Math.floor(Math.random() * 50),
        isHealthy: true,
        checkedAt: new Date(now.getTime() - i * 60000),
      },
    });
  }

  // Endpoint 4: Payment Gateway (Failing with HTTP 500)
  for (let i = 5; i >= 0; i--) {
    const isOldHealthy = i > 3;
    await prisma.healthCheck.create({
      data: {
        endpointId: createdEndpoints[3].id,
        statusCode: isOldHealthy ? 200 : 500,
        latency: isOldHealthy ? 140 : 1250,
        isHealthy: isOldHealthy,
        errorMessage: isOldHealthy ? null : 'HTTP 500 Internal Server Error returned by remote host',
        checkedAt: new Date(now.getTime() - i * 60000),
      },
    });
  }

  console.log('📊 Generated realistic HealthCheck logs');

  // 5. Seed an active Incident for Payment Gateway
  const incident = await prisma.incident.create({
    data: {
      endpointId: createdEndpoints[3].id,
      title: 'HTTP 500 Internal Server Error on Payment Gateway',
      description: 'Endpoint returned status code 500 for 3 consecutive automated probes.',
      status: 'OPEN',
      createdAt: new Date(now.getTime() - 180000),
    },
  });
  console.log(`🚨 Seeded active incident: "${incident.title}"`);

  // 6. Seed OpenAPI Contract Version for Order Processing Service
  const sampleOpenApiV1 = JSON.stringify({
    openapi: '3.0.3',
    info: {
      title: 'Order Processing API',
      version: '1.0.0',
      description: 'API for managing customer orders and shipments',
    },
    paths: {
      '/orders': {
        get: {
          summary: 'List customer orders',
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer' }, required: false },
          ],
          responses: {
            '200': {
              description: 'Successful list of orders',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        amount: { type: 'number' },
                        status: { type: 'string' },
                      },
                      required: ['id', 'amount'],
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          summary: 'Create a new order',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    productId: { type: 'string' },
                    quantity: { type: 'integer' },
                  },
                  required: ['productId', 'quantity'],
                },
              },
            },
          },
          responses: {
            '201': { description: 'Order created' },
          },
        },
      },
    },
  }, null, 2);

  await prisma.aPIVersion.create({
    data: {
      endpointId: createdEndpoints[1].id,
      version: '1.0.0',
      specification: sampleOpenApiV1,
    },
  });
  console.log('📄 Seeded OpenAPI specification v1.0.0 for Order Processing Service');

  console.log('✅ Database seeding finished successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
