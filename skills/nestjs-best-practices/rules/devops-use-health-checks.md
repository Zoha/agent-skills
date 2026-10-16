---
title: Implement Health Checks
impact: MEDIUM-HIGH
impactDescription: Health checks enable orchestrators to manage service lifecycle
tags: health-checks, terminus, liveness, readiness
---

## Implement Health Checks

Implement liveness and readiness probes using `@nestjs/terminus`. Liveness checks determine if the service should be restarted. Readiness checks determine if the service can accept traffic. Health is an app-level module, not a domain feature: `modules/health/` holds one small module and its providers.

**Incorrect (a ping that doesn't check dependencies, wired into the composition root):**

```typescript
// app.module.ts owns an operational concern
@Module({ providers: [HealthService], controllers: [HealthController] })
export class AppModule {}

// Simple ping that doesn't check dependencies
@Controller('health')
export class HealthController {
  @Get()
  check(): string {
    return 'OK'; // Service might be unhealthy but returns OK
  }
}
```

**Correct (an app-level health module using @nestjs/terminus):**

```typescript
// modules/health/health.resolver.ts
@Resolver()
export class HealthResolver {
  constructor(
    private health: HealthCheckService,
    private db: MongooseHealthIndicator,
    private memory: MemoryHealthIndicator,
  ) {}

  // Liveness — is the service alive?
  @Query(() => HealthCheckResult, { name: 'health' })
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', 200 * 1024 * 1024), // 200MB
    ]);
  }

  // Readiness — can the service handle traffic?
  @Query(() => HealthCheckResult, { name: 'healthReady' })
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.memory.checkRSS('memory_rss', 300 * 1024 * 1024),
    ]);
  }
}

// modules/health/health.module.ts
@Module({
  imports: [TerminusModule],
  providers: [HealthResolver],
})
export class HealthModule {}

// app.module.ts — one flat list of modules, domain and app-level alike
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    GraphqlInfraModule,
    UsersModule,
    HealthModule,
  ],
})
export class AppModule {}
```

**Custom indicators for business-specific health:**

```typescript
@Injectable()
export class QueueHealthIndicator extends HealthIndicator {
  constructor(private queueService: QueueService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const queueStats = await this.queueService.getStats();

    const isHealthy = queueStats.failedCount < 100;
    const result = this.getStatus(key, isHealthy, {
      waiting: queueStats.waitingCount,
      active: queueStats.activeCount,
      failed: queueStats.failedCount,
    });

    if (!isHealthy) {
      throw new HealthCheckError('Queue unhealthy', result);
    }

    return result;
  }
}

// Registered in the health module and used by the resolver
@Query(() => HealthCheckResult, { name: 'healthReady' })
@HealthCheck()
ready() {
  return this.health.check([
    () => this.db.pingCheck('database'),
    () => this.queue.isHealthy('job-queue'),
  ]);
}
```

**Respecting shutdown state:**

```typescript
@Injectable()
export class GracefulShutdownService implements OnApplicationShutdown {
  private isShuttingDown = false;

  isShutdown(): boolean {
    return this.isShuttingDown;
  }

  async onApplicationShutdown(): Promise<void> {
    this.isShuttingDown = true;
    // Wait for in-flight requests
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

// In the health resolver: report not-ready once shutdown has started
@Query(() => HealthCheckResult, { name: 'healthReady' })
@HealthCheck()
ready() {
  if (this.shutdownService.isShutdown()) {
    throw new ServiceUnavailableException('Shutting down');
  }

  return this.health.check([() => this.db.pingCheck('database')]);
}
```

Wire your orchestrator's probes to the health module's queries; the module, not `AppModule`, owns the endpoint.

Reference: [NestJS Terminus](https://docs.nestjs.com/recipes/terminus)
