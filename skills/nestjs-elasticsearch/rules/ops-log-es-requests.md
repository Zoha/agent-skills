---
title: Log Elasticsearch Requests and Responses
impact: MEDIUM-HIGH
impactDescription: "every query is traceable by correlation id"
tags: ops, logging, debugging, observability
---

## Log Elasticsearch Requests and Responses

**Impact: MEDIUM-HIGH** — every query is traceable by correlation id

The Elasticsearch client emits `request` and `response` events but logs nothing by default, and it
retries a failing request, so a burst of `request` events can belong to a single call. Correlate
them with an id generated per call, log through the app's structured logger, and redact credentials.
This is what makes a slow or failing search diagnosable in production.

**Incorrect (no visibility, or raw console logging):**

```typescript
@Injectable()
export class SearchService {
  constructor(private readonly es: ElasticsearchService) {
    // nothing: a slow or failing query leaves no trace in the logs
  }
}
```

Why it is wrong: when a search is slow or returns nothing, there is no record of the query, its
duration, or how many hits it produced.

**Correct (per-call correlation id, logged through the structured logger):**

```typescript
// infra/elasticsearch/elasticsearch.logger.ts
@Injectable()
export class ElasticsearchLogger implements OnModuleInit {
  constructor(
    private readonly es: ElasticsearchService,
    private readonly logger: JsonLogger,
  ) {}

  onModuleInit(): void {
    const id = `${randomUUID()}`; // start a correlation id for this module's client

    this.es.on('request', (err, result) => {
      if (err) return;
      this.logger.log('es request', ElasticsearchLogger.name, {
        correlationId: id,
        method: result.meta.request.params.method,
        path: result.meta.request.params.path,
      });
    });

    this.es.on('response', (err, result) => {
      this.logger.log('es response', ElasticsearchLogger.name, {
        correlationId: id,
        status: result.meta.statusCode,
        took: result.meta.body?.took,
        hits: result.meta.body?.hits?.total,
      });
    });
  }
}
```

Why it is right: each call has a correlation id, the query path, status, `took`, and hit count are
logged as structured fields, and the app's existing logger owns formatting.

The correlation id also makes retries legible: a failing call produces several `request` events but
one `response`, so grouping by id shows the retry behaviour. Never send the app's own logs into the
same Elasticsearch cluster being debugged without care, and never log request bodies unredacted if
they can contain user data.

Reference: [@elastic/elasticsearch — Client events](https://www.elastic.co/docs/reference/elasticsearch/clients/javascript/advanced-config) | [NestJS Logger](https://docs.nestjs.com/techniques/logger)
