# Sections

This file defines all sections, their ordering, impact levels, and descriptions.
The section ID (in parentheses) is the filename prefix used to group rules.

Note: Sections 2 (`module-`) and 3 (`relations-`) also host **module-resolution rules**
(how modules connect to and resolve each other at runtime — e.g. circular-dependency
resolution), not only directory-structure rules. See the design spec §2.1.

---

## 1. Application Structure (struct-)

**Impact:** CRITICAL
**Description:** The canonical place for every file in a NestJS GraphQL app — the base map plus placement rules.

## 2. Modules & Bootstrap (module-)

**Impact:** CRITICAL
**Description:** How the app is composed: the feature module file, the bootstrap, and module-resolution concerns such as circular dependencies.

## 3. Relations & Cross-Module (relations-)

**Impact:** CRITICAL
**Description:** How modules connect to resolve fields and relations, and how to resolve connection problems (DataLoader, cross-module services, events, circular dependencies).

## 4. Services (service-)

**Impact:** HIGH
**Description:** Domain logic lives in focused, single-responsibility services under each module's services/ folder.

## 5. GraphQL Resolvers (resolver-)

**Impact:** HIGH
**Description:** GraphQL entry points split by role (query/mutation/field) and kept thin, delegating to services.

## 6. GraphQL Types & Inputs (type-)

**Impact:** HIGH
**Description:** Where object types, inputs, and args live and how they are shaped (code-first).

## 7. Data Access (data-)

**Impact:** MEDIUM-HIGH
**Description:** Persistence: entities, repositories, and the models/mappers split when the API shape diverges from storage.

## 8. Config, Common & Infra (infra-)

**Impact:** MEDIUM
**Description:** One-time infrastructure and shared building blocks: config namespaces, common helpers, GraphQL and database setup.

## 9. Conventions & Testing (conventions-)

**Impact:** MEDIUM
**Description:** Naming, test placement, and generator usage that keep the structure consistent.
