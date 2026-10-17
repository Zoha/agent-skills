---
name: nestjs-best-practices
description: Use when writing, reviewing, or refactoring NestJS GraphQL code — modules, dependency injection, security, performance, error handling, testing, and DevOps patterns for production-ready GraphQL applications.
license: MIT
metadata:
  author: Kadajett
  version: "1.4.0"
---

# NestJS Best Practices

Comprehensive best practices guide for NestJS GraphQL applications, prioritized by impact to guide automated refactoring and code generation. Many rules include GraphQL-specific examples (resolvers, input/args types, `GraphQLError`, `GqlExecutionContext`); the rest are framework-level and apply equally to REST and GraphQL.

## When to Apply

Reference these guidelines when:

- Writing new NestJS modules, resolvers, or services
- Implementing GraphQL authentication and authorization
- Reviewing code for architecture and security issues
- Refactoring existing NestJS GraphQL codebases
- Optimizing GraphQL performance or database queries
- Building microservices architectures

## Rule Categories by Priority

<!-- GENERATED:START:sections -->
| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Architecture | CRITICAL | `arch-` |
| 2 | Dependency Injection | CRITICAL | `di-` |
| 3 | Error Handling | HIGH | `error-` |
| 4 | Security | HIGH | `security-` |
| 5 | Performance | HIGH | `perf-` |
| 6 | Testing | MEDIUM-HIGH | `test-` |
| 7 | Database & ORM | MEDIUM-HIGH | `db-` |
| 8 | Cross-Cutting Concerns | MEDIUM | `use-` |
| 9 | Microservices | MEDIUM | `micro-` |
| 10 | DevOps & Deployment | LOW-MEDIUM | `devops-` |
<!-- GENERATED:END:sections -->

## Quick Reference

<!-- GENERATED:START:rules -->
### 1. Architecture (CRITICAL)

- `arch-avoid-circular-deps` - Avoid Circular Dependencies
- `arch-feature-modules` - Organize by Feature Modules
- `arch-module-sharing` - Use Proper Module Sharing Patterns
- `arch-schema-evolution` - Use Schema Evolution for Breaking Changes
- `arch-single-responsibility` - Single Responsibility for Services
- `arch-use-events` - Use Event-Driven Architecture for Decoupling
- `arch-use-repository-pattern` - Use Repository Pattern for Data Access

### 2. Dependency Injection (CRITICAL)

- `di-avoid-service-locator` - Avoid Service Locator Anti-Pattern
- `di-interface-segregation` - Apply Interface Segregation Principle
- `di-liskov-substitution` - Honor Liskov Substitution Principle
- `di-prefer-constructor-injection` - Prefer Constructor Injection
- `di-scope-awareness` - Understand Provider Scopes
- `di-use-interfaces-tokens` - Use Injection Tokens for Interfaces

### 3. Error Handling (HIGH)

- `error-handle-async-errors` - Handle Async Errors Properly
- `error-throw-domain-errors` - Throw Domain Errors from Services
- `error-use-exception-filters` - Use Exception Filters for Error Handling

### 4. Security (HIGH)

- `security-auth-jwt` - Implement Secure JWT Authentication
- `security-rate-limiting` - Implement Rate Limiting
- `security-sanitize-output` - Sanitize Output to Prevent XSS
- `security-use-guards` - Use Guards for Authentication and Authorization
- `security-validate-all-input` - Validate All Input with Input Types and Pipes

### 5. Performance (HIGH)

- `perf-async-hooks` - Use Async Lifecycle Hooks Correctly
- `perf-lazy-loading` - Use Lazy Loading for Large Modules
- `perf-optimize-database` - Optimize Database Queries
- `perf-use-caching` - Use Caching Strategically

### 6. Testing (MEDIUM-HIGH)

- `test-e2e-supertest` - Use Supertest for E2E Testing
- `test-mock-external-services` - Mock External Services in Tests
- `test-use-testing-module` - Use Testing Module for Unit Tests

### 7. Database & ORM (MEDIUM-HIGH)

- `db-avoid-n-plus-one` - Avoid N+1 Query Problems
- `db-use-migrations` - Use Database Migrations
- `db-use-transactions` - Use Transactions for Multi-Step Operations

### 8. Cross-Cutting Concerns (MEDIUM)

- `use-interceptors` - Use Interceptors for Cross-Cutting Concerns
- `use-pipes` - Use Pipes for Input Transformation
- `use-response-exposure` - Control Response Exposure with GraphQL Types

### 9. Microservices (MEDIUM)

- `micro-use-patterns` - Use Message and Event Patterns Correctly
- `micro-use-queues` - Use Message Queues for Background Jobs

### 10. DevOps & Deployment (LOW-MEDIUM)

- `devops-graceful-shutdown` - Implement Graceful Shutdown
- `devops-maintain-env-example` - Keep a .env.example in Sync with Configuration
- `devops-use-config-module` - Use ConfigModule for Environment Configuration
- `devops-use-health-checks` - Implement Health Checks
- `devops-use-logging` - Use Structured Logging
<!-- GENERATED:END:rules -->

## How to Use

Read individual rule files for detailed explanations and code examples:

```
rules/arch-avoid-circular-deps.md
rules/security-validate-all-input.md
rules/_sections.md
```

Each rule file contains:
- Brief explanation of why it matters
- Incorrect code example with explanation
- Correct code example with explanation
- Additional context and references

## Full Compiled Document

For the complete guide with all rules expanded in a single document, see
[AGENTS.md](./AGENTS.md).
