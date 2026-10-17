# Sections

This file defines all sections, their ordering, impact levels, and descriptions.
The section ID (in parentheses) is the filename prefix used to group rules.

---

## 1. One-Time Setup (setup-)

**Impact:** CRITICAL
**Description:** Wire the caching capability once: the module, file placement, the engine, storage/invalidation, caller identity, the decorator runtime, and the fail-open contract.

## 2. Cache Policy (policy-)

**Impact:** CRITICAL
**Description:** The five knobs (key, tag, scope, ttl, swr), the single writing pattern, where to mount caching, and how keys are derived.

## 3. Leak Safety (safety-)

**Impact:** CRITICAL
**Description:** Scope defaults to public; anything caller-varying must be marked perUser, and every non-user varying dimension must enter the key. Getting this wrong is a data leak, not a slow cache.

## 4. Invalidation (invalidation-)

**Impact:** HIGH
**Description:** Tags as a purge-only reverse index, invalidation that fires only after a successful write, referencesTTL/GC hygiene, atomic purging, and generation prefixes for huge domains.

## 5. Observability (observability-)

**Impact:** MEDIUM
**Description:** Structured cache events, a per-request trace, the metrics that matter, and the outcomes the engine cannot report for you.

## 6. Drivers (driver-)

**Impact:** MEDIUM
**Description:** The driver reality check — which SWR feature is real on Apollo, Mercurius, Envelop, the transport/CDN, and the federated router — plus version pinning.
