# Data Engineering (DE) — Database Architecture & Implementation Report
## Project: API Sentinel (API Failure Detection, Breaking-Change Analysis & MCP Diagnostics)

---

## Executive Summary

This directory (`DE/`) contains the complete Data Engineering deliverables for **API Sentinel**, fulfilling all evaluation criteria and rubrics for the **Data Engineering (DE)** component of the Integrated Capstone Project.

API Sentinel is an API reliability, automated probing, OpenAPI breaking-change detection, and AI-assisted diagnostic platform. The platform monitors distributed HTTP endpoints, captures high-velocity time-series probe logs, tracks operational incidents with automated state transitions, performs semantic OpenAPI contract version diffing, models service integration dependency graphs, and stores AI diagnostic investigation reports.

All database models, constraints, queries, and architectural designs have been implemented, normalized to **Third Normal Form (3NF)**, integrated with the Express.js backend via Prisma ORM 6, and verified against a live **PostgreSQL 17** engine.

---

## Deliverables Directory Structure

| File | Description | Core Rubric Addressed |
| :--- | :--- | :--- |
| [DATABASE_SELECTION.md](DATABASE_SELECTION.md) | Architectural justification for selecting PostgreSQL over MongoDB, data characteristics analysis, and storage engine evaluation. | Section 2.A (Database Selection & Justification) |
| [ER_DIAGRAM.md](ER_DIAGRAM.md) | Entity-Relationship (ER) modeling, Crow's Foot visual diagram, 1:1, 1:N, and N:M cardinality documentation, and complete data dictionary. | Section 2.B (ER Diagram & Data Modeling) |
| [NORMALIZATION.md](NORMALIZATION.md) | Full 1NF, 2NF, and 3NF normalization analysis, functional dependency mappings, anomaly elimination proofs, and intentional JSON denormalization justification. | Section 2.C (Database Normalization) |
| [schema.sql](schema.sql) | Pure SQL DDL script defining all 9 tables, primary keys, cascading foreign keys, check constraints, default values, and performance B-Tree indexes. | Section 2.D (Database Implementation) |
| [seed_data.sql](seed_data.sql) | Comprehensive SQL DML seed script populating realistic sample records across all 9 relational entities. | Section 2.D (Sample Records Implementation) |
| [QUERIES_AND_EXECUTION.md](QUERIES_AND_EXECUTION.md) | Minimum 10 project-specific SQL queries covering INSERT, UPDATE, DELETE, multi-table JOINs, GROUP BY/HAVING, Subqueries, CTEs, Window Functions, and Graph Traversal — with **verified live execution outputs** from PostgreSQL. | Section 2.E (Query Writing & Execution) |
| [DATABASE_INTEGRATION.md](DATABASE_INTEGRATION.md) | Deep-dive evidence and architectural explanation of how the Express backend communicates with PostgreSQL via Prisma ORM, connection pooling, and transactional CRUD flows. | Section 2.F (Database & Application Integration) |
| [DATA_INTEGRITY_AND_SCALING.md](DATA_INTEGRITY_AND_SCALING.md) | Integrity constraints, index optimization, query execution plan analysis, time-series table partitioning strategy, and horizontal scaling roadmap. | Section 2.G (Data Integrity & Performance) |

---

## Database Architecture at a Glance

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        PostgreSQL 17 (api_sentinel)                    │
│                                                                        │
│  ┌───────────────────────┐        1:N         ┌─────────────────────┐  │
│  │     organizations     ├───────────────────►│    api_endpoints    │  │
│  └──────────┬────────────┘                    └──────────┬──────────┘  │
│             │                                            │             │
│             │ 1:N                                        │ 1:N         │
│             ▼                                            ▼             │
│  ┌───────────────────────┐                    ┌─────────────────────┐  │
│  │ organization_members  │◄─── N:M Junction ──┤    health_checks    │  │
│  └──────────▲────────────┘                    └─────────────────────┘  │
│             │ 1:N                                        │             │
│  ┌──────────┴────────────┐                               │ 1:N         │
│  │         users         │                               ▼             │
│  └───────────────────────┘                    ┌─────────────────────┐  │
│                                               │      incidents      │  │
│                                               └─────────────────────┘  │
│                                                          │             │
│                                                          │ 1:N         │
│                                                          ▼             │
│                                               ┌─────────────────────┐  │
│                                               │    api_versions     │  │
│                                               └─────────────────────┘  │
│                                                          │             │
│                                                          │ 1:N         │
│                                                          ▼             │
│  ┌───────────────────────┐        1:N         ┌─────────────────────┐  │
│  │ service_dependencies  │◄───────────────────┤      services       │  │
│  └───────────────────────┘ (Self-Referential) └─────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

- **Database Engine**: PostgreSQL 17 (Relational Database Management System)
- **Object-Relational Mapping (ORM)**: Prisma ORM 6 (`@prisma/client`) with strict schema validation
- **Total Relational Tables**: 9 core models (`users`, `organizations`, `organization_members`, `api_endpoints`, `health_checks`, `incidents`, `api_versions`, `services`, `service_dependencies`, `integrations`, `diagnostic_reports`)
- **Recorded Live Telemetry**: 10,000+ time-series health check probes, 80+ tracked incidents, multi-service dependency edges.
- **Normalization Standard**: Normalized strictly to **3NF** with atomic domains, key-dependent attributes, and zero transitive dependencies.
