---
title: Decouple Modules with Events
impact: HIGH
impactDescription: react without importing
tags: events, decoupling, eventemitter
---

## Decouple Modules with Events

**Impact: HIGH (react without importing)**

**Purpose.** When one module should react to something another module did — send a welcome
email after a user is created — without importing it, emit an event from the actor and listen
in the reactor. Event payloads and listeners live in the feature's `events/` folder. This keeps
the dependency one-directional and stops the actor's constructor from growing with every new
reaction.

**Placement.** `modules/<feature>/events/<feature>-<action>.event.ts` (payload class) and
`<feature>-<action>.listener.ts` (the `@OnEvent` handler, in the reacting module).

**Responsibilities.**

- Define the event payload as an explicit class.
- Emit with `EventEmitter2` from the service that performs the action.
- Register listeners in the reacting module.

**Never.**

- Use an event when a return value is needed — that is a request/response call; use the owning
  service instead.
- Emit from a resolver; emit from the service that owns the state change.
- Import the reacting module just so the actor can call it.

**Incorrect (the actor imports and calls every reactor):**

```typescript
@Injectable()
export class UsersService {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly analytics: AnalyticsService,
    private readonly audit: AuditService,
  ) {}

  async create(input: CreateUserInput): Promise<User> {
    const user = await this.usersRepository.create(input);
    await this.notifications.sendWelcome(user); // actor knows every reactor
    await this.analytics.trackSignup(user);
    await this.audit.record('user.created', user);
    return user;
  }
}
```

Why it is wrong: every new reaction edits the users service, and the service depends on modules
it should not know about.

**Correct (emit once, react independently):**

```typescript
// events/user-created.event.ts
export class UserCreatedEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
  ) {}
}

// services/users.service.ts
@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly events: EventEmitter2,
  ) {}

  async create(input: CreateUserInput): Promise<User> {
    const user = await this.usersRepository.create(input);
    this.events.emit('user.created', new UserCreatedEvent(user.id, user.email));
    return user;
  }
}

// events/user-created.listener.ts (in the notifications module)
@Injectable()
export class UserCreatedListener {
  @OnEvent('user.created')
  async handle(event: UserCreatedEvent): Promise<void> {
    await this.notifications.sendWelcome(event.email);
  }
}
```

Why it is right: the users service emits and moves on, and each new reaction is a new listener
that never touches the actor.

For a synchronous cross-module dependency where a value is needed, inject the owning module's
exported service instead (see `relations-cross-module-service`).

Reference: [NestJS Events](https://docs.nestjs.com/techniques/events)
