# Sections

This file defines all sections, their ordering, impact levels, and descriptions.
The section ID (in parentheses) is the filename prefix used to group rules.

---

## 1. Architecture (arch-)

**Impact:** CRITICAL
**Description:** Where the Elasticsearch client, the shared search layer, and each feature's index definition live. Getting the boundaries right — generic infra below, feature-owned indices above — is what keeps the integration maintainable and the module graph acyclic.

## 2. Indexing & Sync (sync-)

**Impact:** CRITICAL
**Description:** How documents reach the index and stay correct. Incremental writes are enqueued rather than written inline, same-id bursts are debounced, deletes are immediate, batches use the bulk API, mapping changes go through a versioned index and an atomic alias swap, and index creation is idempotent so concurrent instances converge.

## 3. Schema & Mapping (map-)

**Impact:** HIGH
**Description:** The Elasticsearch projection. A typed search document mirrors only the searchable subset of the entity, the mapping is a typed object, fields without a search purpose are excluded, derived and relation fields are computed in a batch mapper, and analyzers are chosen deliberately.

## 4. Querying (query-)

**Impact:** HIGH
**Description:** Elasticsearch finds, MongoDB serves. Searches request IDs only, the result set is hydrated from MongoDB and reordered to the relevance ordering, deep pagination uses `search_after`, and every sort carries a unique tiebreaker.

## 5. Cross-Entity (rel-)

**Impact:** MEDIUM-HIGH
**Description:** Keeping derived values correct when another entity changes them. The module that owns the derived field subscribes and indexes its own document; the contributing module stays independent, and high-frequency counters are cached on the owning document rather than recomputed per read.

## 6. Operations & DX (ops-)

**Impact:** MEDIUM
**Description:** Running and debugging the integration in production. Request/response logging, an explain hook, migration and reindex CLI commands, a health check, and never scheduling indexing with an in-process timer.
