---
title: Split a Feature into Sub-Modules When It Grows
impact: HIGH
impactDescription: a growing feature decomposes, it does not become a mega-module
tags: structure, modules, decomposition, feature
---

## Split a Feature into Sub-Modules When It Grows

**Impact: HIGH (a growing feature decomposes, it does not become a mega-module)**

**Purpose.** The base map assumes one folder per bounded context. When a feature accumulates several
related-but-distinct concerns — a users feature with separate profile, preferences, and invitations
areas — grow it by decomposition, not by piling more files into one module. Extract a concern into
its own Nest module: nested under the feature while the concern is private to it, promoted to a
sibling `modules/<name>/` once it stands on its own. Every extracted module keeps the same shape
(module + resolvers + services + kind subfolders) and declares its own providers and exports.

**Placement.**

- Nested module (a concern still owned by the feature):
  `modules/<feature>/<submodule>/<submodule>.module.ts`.
- Promoted module (a standalone bounded context): `modules/<name>/<name>.module.ts`.

Default to a sibling module when the concern is genuinely separate; nest only while it is private to
its parent feature.

**Responsibilities.**

- Give each extracted concern its own `<submodule>.module.ts` with its own providers and exports.
- Have the parent feature module import its nested modules and export only its public API.
- Apply the same file-kind subfolders inside the extracted module.

**Never.**

- Grow one module with dozens of unrelated providers and resolvers.
- Extract a concern but leave its providers registered in the parent module.
- Duplicate a concern in both a nested and a sibling module — move it.

**Incorrect (one users module holding every concern):**

```text
modules/users/
  users.module.ts        # registers profile, preferences, invitations, ...
  resolvers/             # 12 resolver files
  services/              # 9 services
  dto/                   # 30 inputs
```

Why it is wrong: every concern shares one module boundary, so the module is a grab-bag and its export
surface, test surface, and provider list all grow without limit.

**Correct (extract a nested module; promote it when it stands alone):**

```typescript
// modules/users/users.module.ts — the feature composes its own concerns
@Module({
  imports: [UserProfileModule, UserPreferencesModule],
  providers: [UsersService, UsersQueryResolver],
  exports: [UsersService],
})
export class UsersModule {}

// modules/users/profile/user-profile.module.ts — an extracted concern, same shape
@Module({
  providers: [UserProfileService, UserProfileResolver, UserProfileRepository],
  exports: [UserProfileService],
})
export class UserProfileModule {}
// promote to modules/profile/ once another feature depends on it
```

Why it is right: each concern has its own module boundary, the parent composes them, and a concern
can be promoted to a sibling module without rewriting its internals.

Reference: [NestJS Modules](https://docs.nestjs.com/modules) | [NestJS Project Structure (Encore)](https://encore.dev/articles/nestjs-project-structure-best-practices)
