-- ==============================================================================
-- seed_data.sql — Realistic Sample Dataset for API Sentinel
-- 
-- Subject: Data Engineering (DE) Capstone Integrated Project
-- Populates: Organizations, Users, Endpoints, Probes, Incidents, Specs, Services, Graph Edges
-- ==============================================================================

-- 1. Users
INSERT INTO users (id, name, email, "passwordHash", "createdAt", "updatedAt") VALUES
('usr_core_01', 'Alice Developer', 'alice@apisentinel.local', '$2a$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', NOW(), NOW()),
('usr_ops_02', 'Bob SRE Lead', 'bob.sre@apisentinel.local', '$2a$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', NOW(), NOW())
ON CONFLICT (email) DO NOTHING;

-- 2. Organizations
INSERT INTO organizations (id, name, slug, "createdAt", "updatedAt") VALUES
('org_sentinel_01', 'Sentinel Core Enterprise', 'sentinel-core', NOW(), NOW()),
('org_fintech_02', 'Fintech Payments Platform', 'fintech-payments', NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;

-- 3. Organization Memberships
INSERT INTO organization_members (id, "organizationId", "userId", role, "createdAt") VALUES
('mem_01', 'org_sentinel_01', 'usr_core_01', 'OWNER', NOW()),
('mem_02', 'org_sentinel_01', 'usr_ops_02', 'ADMIN', NOW())
ON CONFLICT ("organizationId", "userId") DO NOTHING;

-- 4. API Endpoints
INSERT INTO api_endpoints (id, name, url, method, description, "isActive", interval, timeout, "expectedStatus", "failureThreshold", headers, "organizationId", "userId", "createdAt", "updatedAt") VALUES
('ep_auth_01', 'User Authentication Service', 'https://httpbin.org/status/200', 'GET', 'Handles JWT verification and session issuance', true, 30, 5000, 200, 3, null, 'org_sentinel_01', 'usr_core_01', NOW(), NOW()),
('ep_order_02', 'Order Processing Service', 'https://httpbin.org/json', 'GET', 'Customer cart checkout and order validation', true, 60, 5000, 200, 3, null, 'org_sentinel_01', 'usr_core_01', NOW(), NOW()),
('ep_inventory_03', 'Inventory Warehouse API', 'https://httpbin.org/delay/1', 'GET', 'Real-time stock level synchronization', true, 60, 5000, 200, 3, null, 'org_sentinel_01', 'usr_core_01', NOW(), NOW()),
('ep_payment_04', 'Payment Processing Gateway', 'https://httpbin.org/status/500', 'POST', 'Third-party credit card settlement endpoint', true, 30, 5000, 200, 3, null, 'org_sentinel_01', 'usr_core_01', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 5. Baseline Health Checks (Time-Series Probes)
INSERT INTO health_checks (id, "endpointId", "statusCode", latency, "isHealthy", "errorMessage", "checkedAt") VALUES
('chk_01', 'ep_auth_01', 200, 245, true, null, NOW() - INTERVAL '15 minutes'),
('chk_02', 'ep_auth_01', 200, 210, true, null, NOW() - INTERVAL '10 minutes'),
('chk_03', 'ep_auth_01', 200, 230, true, null, NOW() - INTERVAL '5 minutes'),
('chk_04', 'ep_order_02', 200, 420, true, null, NOW() - INTERVAL '15 minutes'),
('chk_05', 'ep_order_02', 200, 390, true, null, NOW() - INTERVAL '10 minutes'),
('chk_06', 'ep_inventory_03', 200, 1150, true, null, NOW() - INTERVAL '15 minutes'),
('chk_07', 'ep_inventory_03', 200, 1240, true, null, NOW() - INTERVAL '10 minutes'),
('chk_08', 'ep_payment_04', 500, 850, false, 'Expected HTTP 200, but remote server returned 500', NOW() - INTERVAL '15 minutes'),
('chk_09', 'ep_payment_04', 500, 890, false, 'Expected HTTP 200, but remote server returned 500', NOW() - INTERVAL '10 minutes'),
('chk_10', 'ep_payment_04', 500, 920, false, 'Expected HTTP 200, but remote server returned 500', NOW() - INTERVAL '5 minutes')
ON CONFLICT (id) DO NOTHING;

-- 6. Operational Incidents
INSERT INTO incidents (id, "endpointId", title, description, status, severity, "occurrenceCount", "lastFailureAt", "acknowledgedAt", "createdAt", "resolvedAt") VALUES
('inc_pay_01', 'ep_payment_04', 'HTTP 500 Outage on Payment Processing Gateway', 'Payment gateway failed 3 consecutive health probes with status 500. Settlement transactions interrupted.', 'OPEN', 'CRITICAL', 3, NOW() - INTERVAL '5 minutes', null, NOW() - INTERVAL '15 minutes', null)
ON CONFLICT (id) DO NOTHING;

-- 7. OpenAPI Contract Specifications
INSERT INTO api_versions (id, "endpointId", version, title, format, "specHash", specification, "createdAt") VALUES
('ver_order_v1', 'ep_order_02', 'v1.0.0', 'Order Service Contract v1', 'JSON', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', '{"openapi": "3.0.0", "info": {"title": "Order Service", "version": "1.0.0"}, "paths": {"/orders": {"get": {"responses": {"200": {"description": "List orders"}}}}}}', NOW() - INTERVAL '7 days')
ON CONFLICT (id) DO NOTHING;

-- 8. Downstream Consumer Integrations
INSERT INTO integrations (id, "endpointId", "consumerName", "serviceType", "contactEmail", environment, criticality, "createdAt", "updatedAt") VALUES
('int_checkout_web', 'ep_payment_04', 'Web Checkout Portal', 'frontend', 'frontend-oncall@apisentinel.local', 'production', 'CRITICAL', NOW(), NOW()),
('int_mobile_ios', 'ep_payment_04', 'iOS Mobile App', 'mobile', 'mobile-leads@apisentinel.local', 'production', 'CRITICAL', NOW(), NOW()),
('int_billing_worker', 'ep_order_02', 'Invoice Worker Service', 'microservice', 'billing-dev@apisentinel.local', 'production', 'HIGH', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 9. Microservices & Directed Dependency Graph
INSERT INTO services (id, name, description, criticality, "ownerTeam", "endpointId", "organizationId", "createdAt", "updatedAt") VALUES
('srv_pay_01', 'Payment Gateway', 'Card transaction gateway', 'CRITICAL', 'Payments Team', 'ep_payment_04', 'org_sentinel_01', NOW(), NOW()),
('srv_order_02', 'Order Service', 'Order placement workflow', 'HIGH', 'Checkout Squad', 'ep_order_02', 'org_sentinel_01', NOW(), NOW()),
('srv_mobile_03', 'Mobile Client', 'iOS/Android customer app', 'CRITICAL', 'Mobile Engineering', null, 'org_sentinel_01', NOW(), NOW()),
('srv_analytics_04', 'Analytics Service', 'Business metrics and reporting', 'MEDIUM', 'Data Science', null, 'org_sentinel_01', NOW(), NOW())
ON CONFLICT (name) DO NOTHING;

-- Directed Graph Edges: Provider -> Consumer
INSERT INTO service_dependencies (id, "providerId", "consumerId", "contractVersion", notes, "createdAt") VALUES
('dep_01', 'srv_pay_01', 'srv_mobile_03', '1.0.0', 'Mobile app initiates direct checkout authorization', NOW()),
('dep_02', 'srv_order_02', 'srv_pay_01', '1.0.0', 'Order placement requires payment token capture', NOW()),
('dep_03', 'srv_order_02', 'srv_analytics_04', '1.0.0', 'Order events streamed to analytical data warehouse', NOW())
ON CONFLICT ("providerId", "consumerId") DO NOTHING;

-- 10. AI Diagnostic Investigation Report
INSERT INTO diagnostic_reports (id, "endpointId", "incidentId", query, provider, model, summary, "verifiedFacts", "hypotheses", "recommendations", "evidenceContext", "createdAt") VALUES
('diag_rep_01', 'ep_payment_04', 'inc_pay_01', 'Investigate active critical outage on Payment Processing Gateway', 'nvidia-nim', 'nvidia/nemotron-3.5-lightning-30b-a3b', 'Payment Processing Gateway is failing with HTTP 500 Internal Server Errors affecting 2 critical downstream consumer applications.', '["HTTP 500 status observed on 3 consecutive probes","Uptime dropped to 0% over last 15 minutes","Downstream blast radius affects Web Checkout and iOS Mobile App"]', '["Upstream bank acquiring partner network failure","Database connection pool exhaustion on payment microservice"]', '["Inspect payment provider status page","Scale payment container replicas","Enable circuit breaker on Order Service"]', '{"endpoint": "Payment Processing Gateway", "activeIncidents": 1, "severity": "CRITICAL"}', NOW())
ON CONFLICT (id) DO NOTHING;
