---
title: Use Message Queues for Background Jobs
impact: MEDIUM-HIGH
impactDescription: Queues enable reliable background processing
tags: microservices, queues, bullmq, background-jobs
---

## Use Message Queues for Background Jobs

Use `@nestjs/bullmq` for background job processing. Queues decouple long-running tasks from the request path, enable retry logic, and distribute workload across workers. Use them for emails, file processing, notifications, and any task that shouldn't block a request. The queue connection is one-time infrastructure in `infra/queue/`; the processors and scheduled jobs live with the feature that owns the data they touch.

**Incorrect (long-running work inline on the request path):**

```typescript
// modules/reports/resolvers/reports.mutation.resolver.ts
@Mutation(() => Report)
async generateReport(@Args('input') input: ReportInput): Promise<Report> {
  // This blocks the request for potentially minutes
  const data = await this.fetchLargeDataset(input);
  const report = await this.processData(data); // Slow!
  await this.sendEmail(input.email, report); // Can fail!
  return report; // Client times out
}

// Fire-and-forget without retry
@Injectable()
export class EmailService {
  async sendWelcome(email: string): Promise<void> {
    // If this fails, email is never sent
    await this.mailer.send({ to: email, template: 'welcome' });
    // No retry, no tracking, no visibility
  }
}

// Use setInterval for scheduled tasks
setInterval(async () => {
  await cleanupOldRecords();
}, 60000); // No error handling, memory leaks
```

**Correct (BullMQ; connection in infra/, processors in the owning feature):**

```typescript
// infra/queue/queue.module.ts — the queue connection is configured once
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('queue.host'),
          port: config.get<number>('queue.port'),
        },
        defaultJobOptions: {
          removeOnComplete: 1000,
          removeOnFail: 5000,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueueInfraModule {}

// modules/reports/reports.module.ts — the feature registers its own queue
@Module({
  imports: [
    BullModule.registerQueue({ name: 'reports' }),
    MongooseModule.forFeature([{ name: Report.name, schema: ReportSchema }]),
  ],
  providers: [ReportsService, ReportsProcessor, ReportsJob, ReportsQueryResolver],
})
export class ReportsModule {}

// modules/reports/services/reports.service.ts — producer: return immediately, process in background
@Injectable()
export class ReportsService {
  constructor(@InjectQueue('reports') private readonly reportsQueue: Queue) {}

  async requestReport(input: ReportInput): Promise<{ jobId: string }> {
    const job = await this.reportsQueue.add('generate', input, {
      priority: input.urgent ? 1 : 10,
      delay: input.scheduledFor ? Date.parse(input.scheduledFor) - Date.now() : 0,
    });

    return { jobId: job.id };
  }

  async getJobStatus(jobId: string): Promise<JobStatus> {
    const job = await this.reportsQueue.getJob(jobId);
    return {
      status: await job.getState(),
      progress: job.progress,
      result: job.returnvalue,
    };
  }
}

// modules/reports/processors/reports.processor.ts — consumer in the owning feature
@Processor('reports')
export class ReportsProcessor {
  private readonly logger = new Logger(ReportsProcessor.name);

  constructor(private readonly reportsService: ReportsService) {}

  @Process('generate')
  async generateReport(job: Job<ReportInput>): Promise<void> {
    this.logger.log(`Processing report job ${job.id}`);

    await job.updateProgress(10);
    const data = await this.reportsService.fetchData(job.data);
    await job.updateProgress(50);
    await this.reportsService.processData(data);
    await job.updateProgress(100);
  }

  @OnQueueActive()
  onActive(job: Job) {
    this.logger.log(`Processing job ${job.id}`);
  }

  @OnQueueCompleted()
  onCompleted(job: Job) {
    this.logger.log(`Job ${job.id} completed`);
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed: ${error.message}`);
  }
}

// modules/notifications/services/notifications.service.ts — enqueue with retry
@Injectable()
export class NotificationsService {
  constructor(@InjectQueue('email') private readonly emailQueue: Queue) {}

  async sendWelcome(user: User): Promise<void> {
    await this.emailQueue.add(
      'send',
      { to: user.email, template: 'welcome', data: { name: user.name } },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );
  }
}

// modules/reports/jobs/reports.job.ts — scheduled work lives in jobs/, not via setInterval
@Injectable()
export class ReportsJob {
  constructor(private readonly reportsService: ReportsService) {}

  @Cron('0 0 * * *')
  async cleanupOldReports(): Promise<void> {
    await this.reportsService.cleanupOldReports();
  }

  @Cron('0 * * * *')
  async sendDigest(): Promise<void> {
    await this.reportsService.sendDigest();
  }
}
```

**Queue monitoring** is an infrastructure concern: register Bull Board under `infra/queue/` (or an app-level admin module), not inside a feature.

Reference: [NestJS Queues](https://docs.nestjs.com/techniques/queues) | [NestJS Task Scheduling](https://docs.nestjs.com/techniques/task-scheduling)
