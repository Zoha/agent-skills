---
title: Choose Text Analyzers Deliberately
impact: MEDIUM-HIGH
impactDescription: "search matches what users expect"
tags: mapping, analyzers, full-text, search-quality
---

## Choose Text Analyzers Deliberately

**Impact: MEDIUM-HIGH** — search matches what users expect

A `text` field is analyzed: its value is broken into tokens before indexing, and the query is
analyzed the same way. The default `standard` analyzer lowercases and splits on word boundaries,
which is right for prose but wrong for identifiers, codes, or case-sensitive values. For those, use
`keyword` or a custom analyzer. Analyzer choice is part of the mapping and cannot be changed in place
on existing documents.

**Incorrect (an identifier analyzed as prose):**

```typescript
export const USER_SEARCH_MAPPING = {
  email:   { type: 'text' },              // "john@example.com" is tokenized into john, example, com
  orderId: { type: 'text' },              // "AB-1234" tokenized into ab, 1234
  name:    { type: 'text' },              // fine
} satisfies SearchMapping<UserSearchDocument>;
```

Why it is wrong: an exact-match or sort field analyzed as `text` no longer matches the whole value
and cannot be sorted, so filtering by email or order id behaves incorrectly.

**Correct (text for prose, keyword for exact values, custom analyzer when needed):**

```typescript
export const USER_SEARCH_MAPPING = {
  // full-text: analyzed, good for users typing partial words
  name: { type: 'text' },

  // exact match / sort / facet: not analyzed
  email:   { type: 'keyword' },
  orderId: { type: 'keyword' },

  // full-text that also needs an exact sub-field for sorting
  bio: {
    type: 'text',
    fields: { keyword: { type: 'keyword', ignore_above: 256 } }, // sort/filter on bio.keyword
  },
} satisfies SearchMapping<UserSearchDocument>;
```

Why it is right: prose fields are analyzed for partial-word matching, identifier fields match and
sort exactly, and a field that needs both carries an explicit `.keyword` sub-field.

An analyzer cannot be changed on an existing field; doing so requires a new index and a reindex
(see `sync-full-reindex-alias-swap`). A malformed or unexpected analyzer is discoverable with the
`_analyze` API against the live index, which the CLI wrapper exposes (see `ops-cli-scripts`).

Reference: [Elasticsearch — Analyzers](https://www.elastic.co/docs/manage-data/data-store/text-analysis) | [Elasticsearch — Keyword type](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/keyword)
