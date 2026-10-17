---
title: Include Elasticsearch in Health Checks
impact: MEDIUM
impactDescription: "a search outage is visible before users report it"
tags: ops, health, terminus, readiness
---

## Include Elasticsearch in Health Checks

**Impact: MEDIUM** — a search outage is visible before users report it

Search depends on an external cluster. Add an Elasticsearch check to the readiness probe so an
orchestrator marks the service not-ready (or alerts) when the cluster is unreachable, instead of
serving searches that silently return nothing. Elasticsearch is a dependency of search, so it belongs
in readiness — not the liveness probe, which decides whether to restart the process.

**Incorrect (no search dependency in health, or ES in liveness):**

```typescript
@Query(() => String, { name: 'health' })
health(): string {
  return 'ok'; // reports healthy while the search cluster is down
}
```

Why it is wrong: the service reports healthy and keeps taking traffic while every search fails, and
if the check were in liveness it would restart a process that is fine.

**Correct (an Elasticsearch check in the readiness probe):**

```typescript
// modules/health/health.resolver.ts
@Query(() => HealthCheckResult, { name: 'healthReady' })
@HealthCheck()
ready() {
  return this.health.check([
    () => this.db.pingCheck('database'),          // MongoDB — the source of truth
    () => this.es.pingCheck('elasticsearch'),     // the search dependency
  ]);
}
```

Why it is right: readiness reflects both the source of truth and the search dependency, so an
Elasticsearch outage is visible and routes traffic away before users hit broken searches.

Keep the Elasticsearch check in **readiness**, paired with the database ping: if either is down the
instance cannot fully serve. The liveness probe (memory, event-loop) stays separate, because an
Elasticsearch outage is not a reason to restart the process. Wire the probes to the health module's
queries.

The check belongs in readiness only when Elasticsearch is actually the search backend. When search is
configured off (`SEARCH_BACKEND=mongo`, see `cfg-search-backend-seam`), Elasticsearch is not a
dependency of the instance, so the ping is absent from the check entirely — it is neither run nor
reported healthy. Reporting a dependency you do not call as "up" is a false signal; omitting it is
the honest state.

```typescript
ready() {
  return this.health.check([
    () => this.db.pingCheck('database'),                             // MongoDB — the source of truth
    ...(this.isElasticsearchBackend
      ? [() => this.es.pingCheck('elasticsearch')]                   // only when ES is the backend
      : []),
  ]);
}
```

See `devops-use-health-checks` in the `nestjs-best-practices` skill for the liveness/readiness split
this check follows.

Reference: [NestJS Terminus](https://docs.nestjs.com/recipes/terminus)