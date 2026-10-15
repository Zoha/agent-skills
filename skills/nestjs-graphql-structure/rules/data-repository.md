---
title: Keep Data Access in repositories/
impact: MEDIUM-HIGH
impactDescription: services stay free of ORM detail
tags: repository, data-access, mongoose
---

## Keep Data Access in repositories/

**Impact: MEDIUM-HIGH (services stay free of ORM detail)**

**Purpose.** A repository is the only place in a feature that talks to the database. It wraps
the model/ORM and exposes intention-revealing methods. Services depend on the repository;
nothing else touches the model.

**Placement.** `modules/<feature>/repositories/<feature>.repository.ts`. Class name
`<Feature>Repository`.

**Responsibilities.**

- Encapsulate every model/ORM call (queries, updates, transactions).
- Return domain entities to callers.
- Accept plain arguments and filter objects.

**Never.**

- Contain business rules or GraphQL types.
- Leak the raw model or query builder to callers.
- Be exported to other modules as a shared data layer — other modules go through services.

**Incorrect (ORM calls and a query pipeline inlined in the service):**

```typescript
// services/users.service.ts
@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async findActiveWithOrders(minOrders: number) {
    return this.userModel.aggregate([
      { $match: { isActive: true } },
      { $lookup: { from: 'orders', localField: '_id', foreignField: 'userId', as: 'orders' } },
      { $match: { 'orders.0': { $exists: true } } },
      // ... a long pipeline living in business code
    ]);
  }
}
```

Why it is wrong: the service owns persistence detail, so changing the query or the store means
editing business code, and the query cannot be reused or tested in isolation.

**Correct (repository encapsulates persistence, service reads as intent):**

```typescript
// repositories/users.repository.ts
@Injectable()
export class UsersRepository {
  constructor(@InjectModel(User.name) private readonly userModel: Model<UserDocument>) {}

  findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  findActiveWithMinOrders(minOrders: number): Promise<UserDocument[]> {
    return this.userModel.aggregate([/* pipeline */]).exec();
  }

  create(data: Partial<User>): Promise<UserDocument> {
    return this.userModel.create(data);
  }
}

// services/users.service.ts
@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async findActiveWithOrders(): Promise<User[]> {
    return this.usersRepository.findActiveWithMinOrders(1);
  }
}
```

Why it is right: persistence detail lives in one place; the service reads as business intent
and depends on an injected repository that is trivial to mock.

Reference: [NestJS MongoDB](https://docs.nestjs.com/techniques/mongodb) | [Repository pattern](https://martinfowler.com/eaaCatalog/repository.html)

**Behavioral depth.** See `nestjs-best-practices` -> `arch-use-repository-pattern`.
