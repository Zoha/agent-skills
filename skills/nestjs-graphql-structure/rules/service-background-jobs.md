---
title: Keep Queue Processors and Scheduled Jobs with the Feature
impact: MEDIUM-HIGH
impactDescription: producers in services, consumers in the owning feature
tags: jobs, queue, processors, cron, bullmq
---

## Keep Queue Processors and Scheduled Jobs with the Feature

**Impact: MEDIUM-HIGH (producers in services, consumers in the owning feature)**

**Purpose.** Long-running or scheduled work runs outside the request: enqueue a job from the
service that owns the action, and process it in the feature that owns the data the job touches.
The queue connection is one-time infrastructure in `infra/queue/`; the processors and scheduled
jobs are feature-local providers, because they inject the feature's own services. This keeps the
producer/consumer split clean and the processors unit-testable.

**Placement.**

- Queue connection/registration: `src/infra/queue/queue.module.ts`.
- Queue processor: `modules/<feature>/processors/<feature>.processor.ts` (class `<Feature>Processor`).
- Scheduled/cron job: `modules/<feature>/jobs/<feature>.job.ts` (class `<Feature>Job`).
- Producer: a method on the feature's service (it holds the queue handle).

**Responsibilities.**

- Register the queue connection once, in `infra/queue/`.
- Enqueue from the service that owns the state change.
- Process in the feature that owns the affected data, injecting that feature's services.

**Never.**

- Do long-running work inline in a resolver or on the request path.
- Process a feature's jobs from an unrelated module or from `infra/`.
- Register the queue connection per feature.

**Incorrect (a minutes-long job inline in the request):**

```typescript
// modules/reports/resolvers/reports.mutation.resolver.ts
@Mutation(() => Report)
async generateReport(@Args('input') input: ReportInput) {
  const data = await this.fetchHugeDataset(input); // blocks the request for minutes
  return this.buildReport(data);
}
```

Why it is wrong: a minutes-long task blocks the request, and there is no retry, tracking, or
isolation.

**Correct (enqueue from the service, process in the owning feature):**

```typescript
// services/reports.service.ts — producer
@Injectable()
export class ReportsService {
  constructor(@InjectQueue('reports') private readonly reportsQueue: Queue) {}

  async requestReport(input: ReportInput): Promise<{ jobId: string }> {
    const job = await this.reportsQueue.add('generate', input);
    return { jobId: job.id };
  }
}

// modules/reports/processors/reports.processor.ts — consumer in the owning feature
@Processor('reports')
export class ReportsProcessor {
  constructor(private readonly reportsService: ReportsService) {}

  @Process('generate')
  async generate(job: Job<ReportInput>): Promise<void> {
    await this.reportsService.buildReport(job.data);
  }
}
```

Why it is right: the request returns immediately with a job id, the consumer lives with the data
it touches, and the connection is configured once in `infra/queue/`.

Reference: [NestJS Queues](https://docs.nestjs.com/techniques/queues) | [NestJS Task Scheduling](https://docs.nestjs.com/techniques/task-scheduling)

**Behavioral depth.** See `nestjs-best-practices` -> `micro-use-queues`.
