---
title: Declare Fields on the Type; Resolve Computed Ones in the Resolver
impact: HIGH
impactDescription: one source of truth per field
tags: resolvers, computed, objecttype, schema
---

## Declare Fields on the Type; Resolve Computed Ones in the Resolver

**Impact: HIGH (one source of truth per field)**

**Purpose.** In code-first GraphQL a field exists in the schema only because it is declared with
`@Field()` on the `@ObjectType`. A `@ResolveField` supplies the field's **value**; it does not
declare the field. So every exposed field is declared once with `@Field()`, and how its value is
produced depends on the field:

- **Plain field** — the value is on the object. Declare `@Field()`, populate it, add **no**
  `@ResolveField`.
- **Computed / resolved field** — declare `@Field()` on the class as type-only (never populated),
  and implement it with exactly one `@ResolveField` in the type's `<type>.resolver.ts`
  (see `resolver-per-type`).

**Responsibilities.**

- Declare each exposed field exactly once, with `@Field()`, on the `@ObjectType`.
- Leave a computed field's class property undeclared in the data (use `!`, e.g.
  `onboardingComplete!: boolean`) and never assign it.
- Give each computed field one `@ResolveField` and nothing else.

**Never.**

- Declare a field with `@ResolveField` but no `@Field` — it will not appear in the schema (Nest
  warns "ResolveField … identified as defined in the resolver but not in the schema").
- Add a `@ResolveField` for a plain field — it is redundant and hides which fields are stored.
- Populate a field on the object *and* resolve it with `@ResolveField` — two sources of truth; the
  resolver silently wins and the stored value is ignored.
- Assign a computed property in a mapper or service as well as resolving it.
- Assume "one `@ResolveField` per field" means "in the type's own module": when the computed field's
  source data belongs to another module, the single resolver lives in that data-owner module (see
  `relations-owning-module`).

**Incorrect (computed field has no declaration, or two sources of truth):**

```typescript
// entities/user-preferences.entity.ts
@ObjectType()
export class UserPreferences {
  @Field() timezone: string;
  @Field() onboardingComplete?: boolean; // ALSO populated from the DB...
}

// resolvers/user-preferences.resolver.ts
@Resolver(() => UserPreferences)
export class UserPreferencesResolver {
  @ResolveField(() => Boolean)           // ...and resolved here
  onboardingComplete(@Parent() prefs: UserPreferences) {
    return this.preferencesService.isOnboardingComplete(prefs.userId);
  }
}
// A field with only @ResolveField and no @Field would not be in the schema at all.
```

Why it is wrong: `onboardingComplete` has two sources (the stored value and the resolver), so the
stored value is ignored; a resolver-only field would never be exposed.

**Correct (declared once; computed resolved in the per-type resolver):**

```typescript
// entities/user-preferences.entity.ts
@ObjectType()
export class UserPreferences {
  @Field() timezone: string;                 // plain: value on the object

  @Field(() => Boolean)
  onboardingComplete!: boolean;              // computed: type-only, never populated
}

// resolvers/user-preferences.resolver.ts
@Resolver(() => UserPreferences)
export class UserPreferencesResolver {
  constructor(private readonly preferencesService: UserPreferencesService) {}

  @ResolveField(() => Boolean)
  onboardingComplete(@Parent() prefs: UserPreferences): Promise<boolean> {
    return this.preferencesService.isOnboardingComplete(prefs.userId);
  }
}
```

Why it is right: the schema field is declared exactly once; its value has exactly one source; and
plain fields carry no resolver, so the presence of a resolver marks a computed field.

Reference: [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers)
