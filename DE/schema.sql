-- ==============================================================================
-- schema.sql — PostgreSQL 17 Relational Database Schema for API Sentinel
-- 
-- Subject: Data Engineering (DE) Capstone Integrated Project
-- Standard: Normalized to Third Normal Form (3NF)
-- Features: Strong Foreign Keys, Cascading Rules, Check Constraints, B-Tree Indexes
-- ==============================================================================

-- Clean slate (optional for automated deployment)
DROP TABLE IF EXISTS diagnostic_reports CASCADE;
DROP TABLE IF EXISTS service_dependencies CASCADE;
DROP TABLE IF EXISTS services CASCADE;
DROP TABLE IF EXISTS integrations CASCADE;
DROP TABLE IF EXISTS api_versions CASCADE;
DROP TABLE IF EXISTS incidents CASCADE;
DROP TABLE IF EXISTS health_checks CASCADE;
DROP TABLE IF EXISTS api_endpoints CASCADE;
DROP TABLE IF EXISTS organization_members CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ------------------------------------------------------------------------------
-- 1. Identity & Multi-Tenant Isolation
-- ------------------------------------------------------------------------------

-- Table: users (Platform developers and team owners)
CREATE TABLE users (
    id VARCHAR(30) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    "passwordHash" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table: organizations (Multi-tenant workspaces)
CREATE TABLE organizations (
    id VARCHAR(30) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table: organization_members (N:M Junction table with RBAC roles)
CREATE TABLE organization_members (
    id VARCHAR(30) PRIMARY KEY,
    "organizationId" VARCHAR(30) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    "userId" VARCHAR(30) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER')),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_org_user UNIQUE ("organizationId", "userId")
);

-- ------------------------------------------------------------------------------
-- 2. API Observability & Telemetry Models
-- ------------------------------------------------------------------------------

-- Table: api_endpoints (Monitored HTTP target services)
CREATE TABLE api_endpoints (
    id VARCHAR(30) PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    url VARCHAR(2048) NOT NULL,
    method VARCHAR(10) NOT NULL DEFAULT 'GET' CHECK (method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS')),
    description TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    interval INTEGER NOT NULL DEFAULT 60 CHECK (interval >= 5 AND interval <= 86400),
    timeout INTEGER NOT NULL DEFAULT 5000 CHECK (timeout >= 100 AND timeout <= 60000),
    "expectedStatus" INTEGER NOT NULL DEFAULT 200 CHECK ("expectedStatus" >= 100 AND "expectedStatus" <= 599),
    "failureThreshold" INTEGER NOT NULL DEFAULT 3 CHECK ("failureThreshold" >= 1 AND "failureThreshold" <= 20),
    headers TEXT, -- AES-256-GCM encrypted custom headers
    "organizationId" VARCHAR(30) REFERENCES organizations(id) ON DELETE CASCADE,
    "userId" VARCHAR(30) REFERENCES users(id) ON DELETE SET NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table: health_checks (High-velocity time-series probe logs)
CREATE TABLE health_checks (
    id VARCHAR(30) PRIMARY KEY,
    "endpointId" VARCHAR(30) NOT NULL REFERENCES api_endpoints(id) ON DELETE CASCADE,
    "statusCode" INTEGER CHECK ("statusCode" IS NULL OR ("statusCode" >= 100 AND "statusCode" <= 599)),
    latency INTEGER CHECK (latency IS NULL OR latency >= 0),
    "isHealthy" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table: incidents (Tracked operational disruptions and outages)
CREATE TABLE incidents (
    id VARCHAR(30) PRIMARY KEY,
    "endpointId" VARCHAR(30) NOT NULL REFERENCES api_endpoints(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
    severity VARCHAR(20) NOT NULL DEFAULT 'HIGH' CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1 CHECK ("occurrenceCount" >= 1),
    "lastFailureAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3)
);

-- ------------------------------------------------------------------------------
-- 3. Contracts, Downstream Consumers & Dependency Graph
-- ------------------------------------------------------------------------------

-- Table: api_versions (OpenAPI contract specifications with SHA-256 deduplication)
CREATE TABLE api_versions (
    id VARCHAR(30) PRIMARY KEY,
    "endpointId" VARCHAR(30) NOT NULL REFERENCES api_endpoints(id) ON DELETE CASCADE,
    version VARCHAR(50) NOT NULL,
    title VARCHAR(150),
    format VARCHAR(10) NOT NULL DEFAULT 'JSON' CHECK (format IN ('JSON', 'YAML')),
    "specHash" VARCHAR(64),
    specification TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table: integrations (Downstream applications and consumers mapped to endpoints)
CREATE TABLE integrations (
    id VARCHAR(30) PRIMARY KEY,
    "endpointId" VARCHAR(30) NOT NULL REFERENCES api_endpoints(id) ON DELETE CASCADE,
    "consumerName" VARCHAR(150) NOT NULL,
    "serviceType" VARCHAR(50) NOT NULL DEFAULT 'frontend' CHECK ("serviceType" IN ('frontend', 'microservice', 'mobile', 'third-party')),
    "contactEmail" VARCHAR(255),
    environment VARCHAR(50) NOT NULL DEFAULT 'production' CHECK (environment IN ('production', 'staging', 'development')),
    criticality VARCHAR(20) NOT NULL DEFAULT 'HIGH' CHECK (criticality IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table: services (Microservice topology nodes)
CREATE TABLE services (
    id VARCHAR(30) PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    criticality VARCHAR(20) NOT NULL DEFAULT 'MEDIUM' CHECK (criticality IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    "ownerTeam" VARCHAR(100),
    "endpointId" VARCHAR(30) REFERENCES api_endpoints(id) ON DELETE SET NULL,
    "organizationId" VARCHAR(30) REFERENCES organizations(id) ON DELETE CASCADE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table: service_dependencies (Directed Provider -> Consumer dependency edges)
CREATE TABLE service_dependencies (
    id VARCHAR(30) PRIMARY KEY,
    "providerId" VARCHAR(30) NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    "consumerId" VARCHAR(30) NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    "contractVersion" VARCHAR(50),
    notes TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_provider_consumer UNIQUE ("providerId", "consumerId"),
    CONSTRAINT chk_no_self_dependency CHECK ("providerId" <> "consumerId")
);

-- Table: diagnostic_reports (Evidence-grounded AI incident triage reports)
CREATE TABLE diagnostic_reports (
    id VARCHAR(30) PRIMARY KEY,
    "endpointId" VARCHAR(30) REFERENCES api_endpoints(id) ON DELETE SET NULL,
    "incidentId" VARCHAR(30),
    query TEXT NOT NULL,
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    summary TEXT NOT NULL,
    "verifiedFacts" TEXT NOT NULL,
    "hypotheses" TEXT NOT NULL,
    "recommendations" TEXT NOT NULL,
    "evidenceContext" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 4. Performance Indexes (B-Tree)
-- ------------------------------------------------------------------------------

-- Indexing Multi-Tenant Isolation:
CREATE INDEX idx_organization_members_org ON organization_members("organizationId");
CREATE INDEX idx_organization_members_user ON organization_members("userId");
CREATE INDEX idx_api_endpoints_org ON api_endpoints("organizationId");
CREATE INDEX idx_api_endpoints_user ON api_endpoints("userId");
CREATE INDEX idx_api_endpoints_url ON api_endpoints(url);

-- Indexing Time-Series Probes & Historical Range Queries:
CREATE INDEX idx_health_checks_endpoint ON health_checks("endpointId");
CREATE INDEX idx_health_checks_time ON health_checks("checkedAt");
CREATE INDEX idx_health_checks_composite ON health_checks("endpointId", "checkedAt" DESC);

-- Indexing Incidents by Endpoint and Lifecycle Status:
CREATE INDEX idx_incidents_endpoint ON incidents("endpointId");
CREATE INDEX idx_incidents_status ON incidents(status);

-- Indexing Contracts & Deduplication:
CREATE INDEX idx_api_versions_endpoint ON api_versions("endpointId");
CREATE INDEX idx_api_versions_spechash ON api_versions("specHash");

-- Indexing Integrations:
CREATE INDEX idx_integrations_endpoint ON integrations("endpointId");

-- Indexing Microservice Topology Graph Edges:
CREATE INDEX idx_services_org ON services("organizationId");
CREATE INDEX idx_services_endpoint ON services("endpointId");
CREATE INDEX idx_dependencies_provider ON service_dependencies("providerId");
CREATE INDEX idx_dependencies_consumer ON service_dependencies("consumerId");

-- Indexing AI Diagnostic Reports:
CREATE INDEX idx_reports_endpoint ON diagnostic_reports("endpointId");
CREATE INDEX idx_reports_time ON diagnostic_reports("createdAt");
