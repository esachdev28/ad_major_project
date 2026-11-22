# Database Normalization Documentation (1NF, 2NF, and 3NF)

## 1. Overview of Normalization Objectives

Database normalization is the systematic technique of organizing relational database tables to:
1. **Minimize Data Redundancy**: Ensure every fact is stored exactly once.
2. **Prevent Update, Insertion, and Deletion Anomalies**: Eliminate side-effects where modifying one record leaves the database inconsistent.
3. **Enforce Referential Integrity**: Ensure functional dependencies reflect the true business constraints of the domain.

API Sentinel's database schema has been designed, decomposed, and verified to satisfy **Third Normal Form (3NF)**.

---

## 2. Functional Dependencies (FDs) Analysis

Let the universe of attributes across API Sentinel be analyzed for functional dependencies:

### Core Identity & Tenancy:
- $FD_1: \text{userId} \rightarrow \{\text{name}, \text{email}, \text{passwordHash}, \text{createdAt}, \text{updatedAt}\}$
- $FD_2: \text{email} \rightarrow \{\text{userId}, \text{name}, \text{passwordHash}\}$ *(Candidate Key)*
- $FD_3: \text{organizationId} \rightarrow \{\text{name}, \text{slug}, \text{createdAt}, \text{updatedAt}\}$
- $FD_4: \text{slug} \rightarrow \{\text{organizationId}, \text{name}\}$ *(Candidate Key)*
- $FD_5: (\text{organizationId}, \text{userId}) \rightarrow \{\text{memberId}, \text{role}, \text{createdAt}\}$ *(Junction Candidate Key)*

### API Observability & Telemetry:
- $FD_6: \text{endpointId} \rightarrow \{\text{name}, \text{url}, \text{method}, \text{description}, \text{isActive}, \text{interval}, \text{timeout}, \text{expectedStatus}, \text{failureThreshold}, \text{headers}, \text{organizationId}, \text{userId}\}$
- $FD_7: \text{checkId} \rightarrow \{\text{endpointId}, \text{statusCode}, \text{latency}, \text{isHealthy}, \text{errorMessage}, \text{checkedAt}\}$
- $FD_8: \text{incidentId} \rightarrow \{\text{endpointId}, \text{title}, \text{description}, \text{status}, \text{severity}, \text{occurrenceCount}, \text{lastFailureAt}, \text{acknowledgedAt}, \text{createdAt}, \text{resolvedAt}\}$

### Contracts, Topology & Reports:
- $FD_9: \text{versionId} \rightarrow \{\text{endpointId}, \text{version}, \text{title}, \text{format}, \text{specHash}, \text{specification}, \text{createdAt}\}$
- $FD_{10}: \text{integrationId} \rightarrow \{\text{endpointId}, \text{consumerName}, \text{serviceType}, \text{contactEmail}, \text{environment}, \text{criticality}, \text{createdAt}, \text{updatedAt}\}$
- $FD_{11}: \text{serviceId} \rightarrow \{\text{name}, \text{description}, \text{criticality}, \text{ownerTeam}, \text{endpointId}, \text{organizationId}\}$
- $FD_{12}: (\text{providerId}, \text{consumerId}) \rightarrow \{\text{dependencyId}, \text{contractVersion}, \text{notes}, \text{createdAt}\}$
- $FD_{13}: \text{reportId} \rightarrow \{\text{endpointId}, \text{incidentId}, \text{query}, \text{provider}, \text{model}, \text{summary}, \text{verifiedFacts}, \text{hypotheses}, \text{recommendations}, \text{evidenceContext}, \text{createdAt}\}$

---

## 3. Step-by-Step Normalization Process

### Step 0: The Unnormalized Form (0NF)
Consider a naive, monolithic representation where all monitoring data is placed into a single unnormalized relation:

```text
UNNORMALIZED_ENDPOINT (
    endpoint_id, endpoint_name, endpoint_url, http_method,
    org_name, org_slug,
    user_name, user_email,
    [ health_check_id, status_code, latency, is_healthy, checked_at ]*,
    [ incident_id, incident_title, incident_status, incident_severity ]*,
    [ version_id, semver, spec_content ]*,
    [ consumer_service_name, consumer_criticality, contact_email ]*
)
```

#### Anomalies Present in 0NF:
1. **Repeating Groups**: Multiple health checks, incidents, versions, and consumers form variable-length arrays nested inside a single row.
2. **Insertion Anomaly**: An organization or user cannot be registered without simultaneously creating an API endpoint.
3. **Deletion Anomaly**: Deleting an endpoint accidentally destroys the user account and organization history.
4. **Update Anomaly**: If a user updates their email or an organization updates its name, hundreds of endpoint rows must be updated; otherwise data becomes inconsistent.

---

### Step 1: Transformation to First Normal Form (1NF)

#### Rule:
> A relation is in 1NF if and only if all attribute values are atomic (no multi-valued attributes, no repeating groups), and each table has a defined primary key.

#### Actions Taken:
1. Extracted all repeating groups into distinct standalone relations with foreign key linkages:
   - Nested health checks $\rightarrow$ `health_checks`
   - Nested incidents $\rightarrow$ `incidents`
   - Nested contract versions $\rightarrow$ `api_versions`
   - Nested consumer integrations $\rightarrow$ `integrations`
2. Defined unique, immutable surrogate primary keys (`id` CUID strings) for each relation.
3. Every attribute holds a single atomic scalar value (e.g. `latency` is an `INTEGER`, `isHealthy` is a `BOOLEAN`, `checkedAt` is an atomic `TIMESTAMP`).

#### Resulting 1NF Schema:
- `users(id, name, email, passwordHash, createdAt, updatedAt)`
- `organizations(id, name, slug, createdAt, updatedAt)`
- `api_endpoints(id, name, url, method, interval, timeout, expectedStatus, failureThreshold, organizationId, userId, createdAt, updatedAt)`
- `health_checks(id, endpointId, statusCode, latency, isHealthy, errorMessage, checkedAt)`
- `incidents(id, endpointId, title, description, status, severity, occurrenceCount, createdAt)`
- `api_versions(id, endpointId, version, format, specHash, specification, createdAt)`
- `integrations(id, endpointId, consumerName, serviceType, contactEmail, environment, criticality)`

---

### Step 2: Transformation to Second Normal Form (2NF)

#### Rule:
> A relation is in 2NF if it is in 1NF and **every non-prime attribute is fully functionally dependent on the entire primary key** (no partial functional dependencies on composite candidate keys).

#### Analysis of Composite Keys in API Sentinel:
In API Sentinel, two relations feature composite business candidate keys:
1. `organization_members`: Maps `(organizationId, userId)` $\rightarrow$ `role`
2. `service_dependencies`: Maps `(providerId, consumerId)` $\rightarrow$ `(contractVersion, notes)`

#### Verification of 2NF Compliance:
- In `organization_members`, the non-prime attribute `role` depends strictly on the combination of `(organizationId, userId)`:
  $$\{\text{organizationId}, \text{userId}\} \rightarrow \text{role}$$
  Neither `organizationId` alone nor `userId` alone determines the role. A user can be an `OWNER` in Organization A, but a read-only `MEMBER` in Organization B. Thus, there is **zero partial dependency**.
- In `service_dependencies`, `contractVersion` and `notes` describe the specific directed integration link between the two services:
  $$\{\text{providerId}, \text{consumerId}\} \rightarrow \text{contractVersion}$$
  Neither service alone dictates the contract version of the link.
- All single-key tables (`api_endpoints`, `health_checks`, `incidents`, `users`, `services`) trivially satisfy 2NF because their primary keys consist of a single column, making partial dependency mathematically impossible.

---

### Step 3: Transformation to Third Normal Form (3NF)

#### Rule:
> A relation is in 3NF if it is in 2NF and **no non-prime attribute is transitively dependent on the primary key** (for every functional dependency $X \rightarrow Y$, either $X$ is a superkey, or $Y$ is a prime attribute).

#### Analysis of Potential Transitive Dependencies:

##### Case A: Organization and User Details inside APIEndpoint
- **Bad Design**: `api_endpoints(id, name, url, org_name, org_slug, user_name, user_email)`
  - Transitive Dependency: $\text{id} \rightarrow \text{org\_id} \rightarrow \text{org\_name}$
  - Update Anomaly: Changing the organization name requires finding and updating every endpoint owned by that organization.
- **3NF Resolution**: Decompose into:
  - `organizations(id, name, slug)`
  - `api_endpoints(id, name, url, ..., organizationId FK)`
  - The non-key attribute `name` depends strictly on `organizations.id`. `api_endpoints` stores only the foreign key `organizationId`.

##### Case B: Health Check Outcomes vs Incident State
- **Bad Design**: Storing `incident_status` inside `health_checks`.
  - Transitive Dependency: $\text{checkId} \rightarrow \text{endpointId} \rightarrow \text{incident_status}$
  - Redundancy: If 500 failing checks are recorded during an outage, the incident title and status would be duplicated 500 times.
- **3NF Resolution**: Decompose into:
  - `health_checks(id, endpointId, statusCode, latency, isHealthy, checkedAt)`
  - `incidents(id, endpointId, title, status, severity, occurrenceCount)`
  - Each relation models its own independent lifecycle. Health checks are immutable time-series logs; incidents are mutable state machines.

##### Case C: Microservice Topology vs Endpoint Target
- **Bad Design**: Merging service consumer dependency metadata into `api_endpoints`.
  - Transitive Dependency: An endpoint URL can exist without being a formal microservice node, and a consumer microservice depends on the provider service logical identity, not raw HTTP URLs.
- **3NF Resolution**: Decompose into independent `services` and `service_dependencies` tables.

---

## 4. Final 3NF Normalized Relational Schema

```text
users (
    id [PK], name, email [UK], passwordHash, createdAt, updatedAt
)

organizations (
    id [PK], name, slug [UK], createdAt, updatedAt
)

organization_members (
    id [PK], organizationId [FK], userId [FK], role, createdAt,
    UNIQUE(organizationId, userId)
)

api_endpoints (
    id [PK], name, url, method, description, isActive, interval,
    timeout, expectedStatus, failureThreshold, headers,
    organizationId [FK], userId [FK], createdAt, updatedAt
)

health_checks (
    id [PK], endpointId [FK], statusCode, latency, isHealthy, errorMessage, checkedAt
)

incidents (
    id [PK], endpointId [FK], title, description, status, severity,
    occurrenceCount, lastFailureAt, acknowledgedAt, createdAt, resolvedAt
)

api_versions (
    id [PK], endpointId [FK], version, title, format, specHash, specification, createdAt
)

integrations (
    id [PK], endpointId [FK], consumerName, serviceType, contactEmail,
    environment, criticality, createdAt, updatedAt
)

services (
    id [PK], name [UK], description, criticality, ownerTeam,
    endpointId [FK], organizationId [FK], createdAt, updatedAt
)

service_dependencies (
    id [PK], providerId [FK], consumerId [FK], contractVersion, notes, createdAt,
    UNIQUE(providerId, consumerId)
)

diagnostic_reports (
    id [PK], endpointId [FK], incidentId, query, provider, model, summary,
    verifiedFacts, hypotheses, recommendations, evidenceContext, createdAt
)
```

---

## 5. Justification of Intentional Pragmatic Denormalization

In production software architecture, strict relational normalization is balanced with practical performance and data isolation requirements. API Sentinel employs three intentional, well-reasoned choices:

1. **Encrypted Custom Headers as JSON (`api_endpoints.headers`)**:
   - Rather than creating a separate `endpoint_headers(id, endpointId, header_key, header_value)` table, custom headers are encrypted using **AES-256-GCM** and stored as an authenticated ciphertext string.
   - *Rationale*: Headers are never queried independently; they are always fetched as an atomic block when the monitoring engine dispatches an HTTP probe. Encrypting the entire JSON payload prevents credential leaks and simplifies key rotation.

2. **Full OpenAPI Specification as Text (`api_versions.specification`)**:
   - Rather than deconstructing OpenAPI specifications into dozens of normalized tables (`paths`, `operations`, `parameters`, `responses`, `schemas`), the entire JSON/YAML contract is stored intact alongside its canonical SHA-256 `specHash`.
   - *Rationale*: Semantic diffing algorithms (`contractDiffService.js`) require the entire JSON AST. Reconstructing an OpenAPI schema from 15 normalized tables would cause catastrophic join overhead without adding value.

3. **Telemetry Snapshot Context (`diagnostic_reports.evidenceContext`)**:
   - When an AI diagnostic report is generated, a sanitized snapshot of recent health checks, active incidents, and contract diffs is saved within the report row.
   - *Rationale*: Provides an immutable audit trail. Even if historical health checks are purged by a retention policy, the historical evidence backing an AI diagnosis remains preserved.
