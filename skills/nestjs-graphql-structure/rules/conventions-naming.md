---
title: File and Class Naming Conventions
impact: MEDIUM
impactDescription: predictable names make placement obvious
tags: naming, conventions
---

## File and Class Naming Conventions

**Impact: MEDIUM (predictable names make placement obvious)**

**Purpose.** Consistent naming is the cheapest way to keep the structure discoverable. Files are
named by feature and role; the role suffix matches the folder the file lives in; classes are
PascalCase and named after the concept.

**Placement.** Throughout `src/`.

**Placeholders.** `<feature>` is the feature's module/folder name, plural (for example `users`).
`<entity>` is the feature's primary domain noun, singular (for example `user`). Kinds named after
the feature — module, service, repository, resolver, loader, args — use `<feature>`; kinds named
after a single concept — entity, model, mapper, input — use `<entity>`.

**Responsibilities.**

- Name files `<feature>.<role>.ts` (or `<verb>-<feature>.<role>.ts` for inputs/args).
- Name classes after the concept, in PascalCase, ending with the role.

**Never.**

- Mix roles in one filename.
- Use generic names (`helpers.ts`, `utils.ts`) for feature code.
- Use a different suffix for the same role in different features.

**Incorrect (role unclear, generic, wrong case):**

```text
modules/users/
  usersStuff.ts          # role unclear
  helper.ts              # generic
  UsersQueryResolver.ts  # filename should be lower-case role-based
```

Why it is wrong: the filename does not say what the file is or where it belongs.

**Correct (one pattern per kind):**

| Kind | File pattern | Class |
|------|--------------|-------|
| Feature module | `<feature>.module.ts` | `<Feature>Module` |
| Query resolver | `<feature>.query.resolver.ts` | `<Feature>QueryResolver` |
| Mutation resolver | `<feature>.mutation.resolver.ts` | `<Feature>MutationResolver` |
| Cross-module field resolver | `<type>-<feature>.resolver.ts` | `<Type><Feature>Resolver` |
| Own-type field resolver (nested/computed) | `<type>.resolver.ts` | `<Type>Resolver` |
| Service | `<feature>.service.ts` / `<feature>-<concern>.service.ts` | `<Feature>Service` |
| Repository | `<feature>.repository.ts` | `<Feature>Repository` |
| Entity | `<entity>.entity.ts` | `<Entity>` |
| Input | `create-<entity>.input.ts` | `Create<Entity>Input` |
| Args | `find-<feature>.args.ts` | `Find<Feature>Args` |
| Loader | `<feature>.loader.ts` | `<Feature>Loader` |
| Event | `<feature>-<action>.event.ts` | `<Feature><Action>Event` |
| Listener | `<feature>-<action>.listener.ts` | `<Feature><Action>Listener` |
| Subscription resolver | `<feature>.subscription.resolver.ts` | `<Feature>SubscriptionResolver` |
| Provider (third-party client) | `<vendor>.provider.ts` | `<Vendor>Provider` |
| Queue processor | `<feature>.processor.ts` | `<Feature>Processor` |
| Scheduled job | `<feature>.job.ts` | `<Feature>Job` |
| Custom scalar | `<name>.scalar.ts` | `<Name>Scalar` |
| Union / interface type | `<name>.union.ts` / `<name>.interface.ts` | — |
| Port / contract | `<name>.interface.ts` | `<Name>` (+ `<NAME>` token) |
| Test factory | `test/factories/<name>.factory.ts` | `<Name>Factory` |
| Passport strategy | `<name>.strategy.ts` | `<Name>Strategy` |
| Exception | `<name>.exception.ts` | `<Name>Exception` |
| Schema directive | `<name>.directive.ts` | `<Name>Directive` |
| Pagination args | `<feature>-pagination.args.ts` | `<Feature>PaginationArgs` |
| Shared page types | `common/pagination/paginated.ts` | `Paginated<T>` / `PageInfo` |
| Unit test | `<name>.spec.ts` | — |
| E2E test | `<feature>.e2e-spec.ts` | — |

Why it is right: the role suffix matches the folder and the class name, so any file can be
located by name alone.

Reference: [NestJS Modules](https://docs.nestjs.com/modules)
