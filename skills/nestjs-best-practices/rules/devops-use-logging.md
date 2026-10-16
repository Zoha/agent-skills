---
title: Use Structured Logging
impact: MEDIUM-HIGH
impactDescription: Structured logging enables effective debugging and monitoring
tags: devops, logging, structured-logs, pino
---

## Use Structured Logging

Use NestJS Logger with structured JSON output in production. Include contextual information (request ID, user ID, operation) to trace requests across services. Avoid console.log and implement proper log levels.

**Incorrect (using console.log in production):**

```typescript
// Use console.log in production
@Injectable()
export class UsersService {
  async createUser(input: CreateUserInput): Promise<User> {
    console.log('Creating user:', input);
    // Not structured, no levels, lost in production logs

    try {
      const user = await this.repo.save(input);
      console.log('User created:', user.id);
      return user;
    } catch (error) {
      console.log('Error:', error); // Using log for errors
      throw error;
    }
  }
}

// Log sensitive data
console.log('Login attempt:', { email, password }); // SECURITY RISK!

// Inconsistent log format
logger.log('User ' + userId + ' created at ' + new Date());
// Hard to parse, no structure
```

**Correct (use structured logging with context):**

```typescript
// Configure the application logger in main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Install the JSON logger so every log line is structured JSON.
  // JsonLogger is registered as a provider (common/logger/logger.module.ts).
  app.useLogger(app.get(JsonLogger));

  await app.listen(3000);
}

// Custom logger for JSON output — implements every LoggerService method
@Injectable()
export class JsonLogger implements LoggerService {
  log(message: any, ...optionalParams: any[]): void {
    this.write('info', message, optionalParams);
  }

  error(message: any, ...optionalParams: any[]): void {
    this.write('error', message, optionalParams);
  }

  warn(message: any, ...optionalParams: any[]): void {
    this.write('warn', message, optionalParams);
  }

  debug(message: any, ...optionalParams: any[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: any, ...optionalParams: any[]): void {
    this.write('verbose', message, optionalParams);
  }

  fatal(message: any, ...optionalParams: any[]): void {
    this.write('fatal', message, optionalParams);
  }

  private write(level: string, message: any, optionalParams: any[]): void {
    // Object params become structured fields; the context string comes last
    const fields = Object.assign(
      {},
      ...optionalParams.filter((p) => p !== null && typeof p === 'object'),
    );
    const strings = optionalParams.filter((p) => typeof p === 'string');
    const context = strings[strings.length - 1];

    const line = JSON.stringify({
      level,
      timestamp: new Date().toISOString(),
      context,
      message,
      ...fields,
    });

    if (level === 'error' || level === 'fatal') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  }
}

// Structured output: inject the JSON logger and pass fields as objects.
// The object params are merged into the JSON line.
@Injectable()
export class UsersService {
  constructor(
    private readonly logger: JsonLogger,
    private readonly repo: UsersRepository,
  ) {}

  async createUser(input: CreateUserInput): Promise<User> {
    this.logger.log('Creating user', UsersService.name, { email: input.email });

    try {
      const user = await this.repo.save(input);
      this.logger.log('User created', UsersService.name, { userId: user.id });
      return user;
    } catch (error) {
      this.logger.error(
        'Failed to create user',
        error.stack,
        UsersService.name,
        { email: input.email },
      );
      throw error;
    }
  }
}

// The built-in Logger is fine for plain messages only. Its second argument is a
// string context and it does not emit structured fields — use JsonLogger (or
// Pino, below) whenever you need key/value data in the log line.
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  ping(): void {
    this.logger.log('Health check passed');
  }

  warnSlow(): void {
    this.logger.warn('Database responded slowly');
  }
}

// Request context logging with ClsModule
import { ClsModule, ClsService } from 'nestjs-cls';

@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
      },
    }),
  ],
})
export class AppModule {}

// Middleware to set request context
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private cls: ClsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = req.headers['x-request-id'] || randomUUID();
    this.cls.set('requestId', requestId);
    this.cls.set('userId', req.user?.id);

    res.setHeader('x-request-id', requestId);
    next();
  }
}

// Logger that includes request context
@Injectable()
export class ContextLogger {
  constructor(private cls: ClsService) {}

  log(message: string, data?: object): void {
    console.log(
      JSON.stringify({
        level: 'info',
        timestamp: new Date().toISOString(),
        requestId: this.cls.get('requestId'),
        userId: this.cls.get('userId'),
        message,
        ...data,
      }),
    );
  }

  error(message: string, error: Error, data?: object): void {
    console.error(
      JSON.stringify({
        level: 'error',
        timestamp: new Date().toISOString(),
        requestId: this.cls.get('requestId'),
        userId: this.cls.get('userId'),
        message,
        error: error.message,
        stack: error.stack,
        ...data,
      }),
    );
  }
}

// Pino integration for high-performance logging
import { LoggerModule } from 'nestjs-pino';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty' }
            : undefined,
        redact: ['req.headers.authorization', 'req.body.password'],
        serializers: {
          req: (req) => ({
            method: req.method,
            url: req.url,
            query: req.query,
          }),
          res: (res) => ({
            statusCode: res.statusCode,
          }),
        },
      },
    }),
  ],
})
export class AppModule {}

// Usage with Pino
@Injectable()
export class UsersService {
  constructor(private logger: PinoLogger) {
    this.logger.setContext(UsersService.name);
  }

  async findOne(id: string): Promise<User> {
    this.logger.info({ userId: id }, 'Finding user');
    // Pino uses first arg for data, second for message
  }
}
```

Reference: [NestJS Logger](https://docs.nestjs.com/techniques/logger)
