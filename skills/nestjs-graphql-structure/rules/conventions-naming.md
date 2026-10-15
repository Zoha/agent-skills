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
| Field resolver | `<feature>.field.resolver.ts` | `<Feature>FieldResolver` |
| Service | `<feature>.service.ts` / `<feature>-<concern>.service.ts` | `<Feature>Service` |
| Repository | `<feature>.repository.ts` | `<Feature>Repository` |
| Entity | `<feature>.entity.ts` | `<Feature>` |
| Input | `create-<feature>.input.ts` | `Create<Feature>Input` |
| Args | `find-<feature>.args.ts` | `Find<Feature>Args` |
| Loader | `<feature>.loader.ts` | `<Feature>Loader` |
| Event | `<feature>-<action>.event.ts` | `<Feature><Action>Event` |
| Listener | `<feature>-<action>.listener.ts` | `<Feature><Action>Listener` |
| Unit test | `<name>.spec.ts` | — |
| E2E test | `<feature>.e2e-spec.ts` | — |

Why it is right: the role suffix matches the folder and the class name, so any file can be
located by name alone.

Reference: [NestJS Modules](https://docs.nestjs.com/modules)
