---
title: Let Each Feature Own and Register Its Index
impact: CRITICAL
impactDescription: "no central index list; infra never imports a feature"
tags: architecture, modules, ownership, registration
---

## Let Each Feature Own and Register Its Index

**Impact: CRITICAL** — no central index list; infra never imports a feature

Each feature defines its own index (alias, version, mapping) in its own `search/` folder and
registers it from its own module. A single shared registry collects the definitions, so
`AppModule` and the infra layer never list features. The dependency direction is always
feature → shared search layer → infra.

**Incorrect (a central index list inside infra, or AppModule naming features):**

```typescript
// infra/elasticsearch/indexes.ts — infra knows every feature
export const INDEXES = [USERS_INDEX, POSTS_INDEX, COMMENTS_INDEX]; // infra -> features

// app.module.ts — the composition root names feature indices
@Module({ imports: [SearchModule.forFeature([USERS_INDEX, POSTS_INDEX])] })
export class AppModule {}
```

Why it is wrong: the infra layer (or the composition root) depends on every feature, so adding a
feature edits a shared file and the boundary is lost.

**Correct (feature-owned definition, self-registration):**

```typescript
// modules/users/search/users.index.ts — owned by the feature
export const USERS_INDEX: SearchIndexDef<UserSearchDocument> = {
  alias: 'users',
  version: 'users_v1',
  mapping: USER_SEARCH_MAPPING,
};

// modules/users/search/users.search-registration.ts — the feature registers itself
@Injectable()
export class UsersSearchIndexRegistration implements OnModuleInit {
  constructor(
    private readonly registry: SearchIndexRegistry,
    private readonly es: ElasticsearchService,
    private readonly repo: UsersSearchRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    this.registry.register(USERS_INDEX, this.repo); // alias -> repository
    await this.registry.ensure(this.es, USERS_INDEX); // idempotent create
  }
}

// modules/users/users.module.ts
@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]), SearchModule],
  providers: [UsersService, UsersSearchRepository, UsersSearchIndexRegistration],
  exports: [UsersService],
})
export class UsersModule {}

// app.module.ts — imports modules, never names an index
@Module({ imports: [SearchModule, UsersModule, PostsModule] })
export class AppModule {}
```

Why it is right: each feature owns and registers its own index, the registry maps alias →
repository for the shared processor, and neither `AppModule` nor infra knows a feature name.

The registry stores `alias -> { definition, repository }`, which is what lets the single shared
reindex processor resolve a feature's repository without importing the feature.

Reference: [NestJS Modules](https://docs.nestjs.com/modules) | [NestJS Dynamic Modules](https://docs.nestjs.com/fundamentals/dynamic-modules)
