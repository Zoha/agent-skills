---
title: Multiple Focused Services per Module
impact: HIGH
impactDescription: split by responsibility; a module usually has several services
tags: services, responsibility, organization
---

## Multiple Focused Services per Module

**Impact: HIGH (split by responsibility; a module usually has several services)**

**Purpose.** A module's business logic lives in its `services/` folder. A feature almost
always has more than one responsibility, so it should have more than one service. Each
service owns a single concern, which keeps files small, easy to test, and safe to change
without dragging in the rest of the feature.

**Placement.** `modules/<feature>/services/<feature>.service.ts`, plus
`<feature>-<concern>.service.ts` for each additional concern. Name the class after the
concern: `UsersService`, `UsersProfileService`, `UsersInvitationsService`.

**Responsibilities.**

- Expose the operations that resolvers and other modules need.
- Own the business rules for exactly one concern.
- Depend on repositories and other services through constructor injection.

**Never.**

- Contain GraphQL decorators (`@Query`, `@Resolver`) or HTTP/Express objects.
- Reach directly into the ORM/model — that is the repository's job.
- Mix unrelated concerns into one class because they share a name prefix.

**Incorrect (one god service):**

```typescript
// modules/users/services/users.service.ts — one class, five concerns
@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly jwt: JwtService,
    private readonly mailer: MailerService,
    private readonly uploads: UploadService,
    private readonly reports: ReportService,
  ) {}

  findById(id: string) { /* user queries */ }
  login(email: string, password: string) { /* auth */ }
  uploadAvatar(id: string, file: Buffer) { /* media */ }
  sendPasswordReset(email: string) { /* notifications */ }
  buildActivityReport(id: string) { /* reporting */ }
}
```

Why it is wrong: every new concern grows the same class, its constructor pulls in half the
application, and testing any one behavior means mocking all five dependencies.

**Correct (focused services):**

```typescript
// modules/users/services/users.service.ts
@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findById(id);
    if (!user) throw new UserNotFoundException(id);
    return user;
  }
}

// modules/users/services/users-profile.service.ts
@Injectable()
export class UsersProfileService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async updateProfile(id: string, input: UpdateUserInput): Promise<User> {
    return this.usersRepository.update(id, input);
  }
}
```

Why it is right: each service has one reason to change and one dependency set; the module
registers them side by side and each resolver depends only on the service it needs.

Reference: [NestJS Providers](https://docs.nestjs.com/providers)

**Behavioral depth.** See `nestjs-best-practices` -> `arch-single-responsibility`.
