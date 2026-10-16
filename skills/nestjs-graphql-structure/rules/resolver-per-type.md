---
title: One Resolver File per Type That Has Field Resolvers
impact: HIGH
impactDescription: the resolver file is the registry of a type's resolved fields
tags: resolvers, nested, computed, organization
---

## One Resolver File per Type That Has Field Resolvers

**Impact: HIGH (the resolver file is the registry of a type's resolved fields)**

**Purpose.** Some fields on an `@ObjectType` cannot be read from the stored object — a nested value
object's computed fields (`UserPreferences.darkMode`), or a field derived elsewhere. Each needs an
`@ResolveField`. GraphQL never records which fields have resolvers, so the code must: a type that
has any field resolver gets **one** resolver file, and that file contains all of them. The file's
presence is the signal that the type has resolved fields; a type with no such file has only plain
fields.

**Placement.** `modules/<owner>/resolvers/<type>.resolver.ts`, where `<owner>` is the module that
owns the type and `<type>` is the kebab name of the type being resolved — for example
`users/resolvers/user-preferences.resolver.ts` for the `UserPreferences` type. Class name
`<Type>Resolver`.

**Responsibilities.**

- Declare each resolved field on the `@ObjectType` with `@Field()` **as well as** implementing it
  with `@ResolveField` — the resolver supplies the field's value but does not add it to the
  schema (see `resolver-computed-fields`).
- Declare `@Resolver(() => TheType)` and one `@ResolveField` per resolved field.
- Make the method name equal the GraphQL field name.
- Hold **every** field resolver whose data this module owns for that type.
- A field backed by another module's data is resolved in that module, not here; ownership, not the
  filename, decides where the resolver lives (see `relations-owning-module`).

**Never.**

- Split a type's field resolvers across several files.
- Create a resolver file for a type whose fields are all plain (it needs none).
- Put query or mutation resolvers here — those belong to the top-level type's resolver.

**Incorrect (a type's resolved fields are spread out, so which are resolved is unclear):**

```typescript
// users/resolvers/users.query.resolver.ts — one UserPreferences field resolver buried with queries
@Resolver(() => UserPreferences)
export class UsersQueryResolver {
  @ResolveField(() => String)
  greeting(@Parent() prefs: UserPreferences) { /* ... */ }
}
// users/resolvers/user-preferences.extra.resolver.ts — another UserPreferences resolver elsewhere
// Result: nothing tells a reader which UserPreferences fields are resolved.
```

Why it is wrong: to learn which fields of `UserPreferences` have custom resolvers you must search
the whole module.

**Correct (one registry file for the type):**

```typescript
// users/resolvers/user-preferences.resolver.ts
@Resolver(() => UserPreferences)
export class UserPreferencesResolver {
  constructor(private readonly preferencesService: UserPreferencesService) {}

  @ResolveField(() => String)
  greeting(@Parent() prefs: UserPreferences): string {
    return this.preferencesService.greeting(prefs.locale);
  }

  @ResolveField(() => Boolean)
  onboardingComplete(@Parent() prefs: UserPreferences): Promise<boolean> {
    return this.preferencesService.isOnboardingComplete(prefs.userId);
  }
}
```

Why it is right: every `@ResolveField` for `UserPreferences` lives in one file; its existence says
the type has resolved fields, and opening it lists exactly which.

This is a same-module ("nested") resolver. When a field is backed by data another module owns, the
file lives in that module instead — see `relations-owning-module`. The module a resolver lives in
is what distinguishes a nested field from a cross-module relation.

Reference: [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers)
