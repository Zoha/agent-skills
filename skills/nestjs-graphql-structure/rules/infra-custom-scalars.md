---
title: Implement Custom Scalars in common/scalars/
impact: MEDIUM
impactDescription: scalars are defined once and registered once
tags: graphql, scalars, common
---

## Implement Custom Scalars in common/scalars/

**Impact: MEDIUM (scalars are defined once and registered once)**

**Purpose.** A custom scalar (a `Date`, a `JSON` blob, an opaque id) is one definition shared by
every feature that references it. It lives in `common/scalars/` and is registered once at
bootstrap. This avoids re-declaring a `DateScalar` per feature and keeps the schema's scalar set
consistent.

**Placement.** `src/common/scalars/<name>.scalar.ts` (class `<Name>Scalar`). Registered once, as a
provider available to the schema builder (for example via `common/shared.module.ts`).

**Responsibilities.**

- Define the scalar once, implementing `CustomScalar` (`serialize` / `parseValue` / `parseLiteral`).
- Register it once.
- Keep it feature-agnostic.

**Never.**

- Re-declare the same scalar in more than one feature.
- Register the same scalar in several modules.
- Put feature-specific parsing in a shared scalar.

**Incorrect (a Date scalar re-declared per feature):**

```typescript
// modules/users/date.scalar.ts
@Scalar('Date', () => Date)
export class DateScalar implements CustomScalar<number, Date> { /* copy 1 */ }

// modules/orders/date.scalar.ts
@Scalar('Date', () => Date)
export class DateScalar implements CustomScalar<number, Date> { /* copy 2, drifting */ }
```

Why it is wrong: the same scalar exists twice and drifts, and the schema has no single definition.

**Correct (one shared scalar, provided once):**

```typescript
// common/scalars/date.scalar.ts
@Scalar('Date', () => Date)
export class DateScalar implements CustomScalar<number, Date> {
  description = 'Date custom scalar type';

  serialize(value: Date): number {
    return value.getTime();
  }

  parseValue(value: number): Date {
    return new Date(value);
  }

  parseLiteral(ast: ValueNode): Date | null {
    return ast.kind === Kind.INT ? new Date(parseInt(ast.value, 10)) : null;
  }
}

// common/shared.module.ts — provided once, so the schema builder registers it
@Module({ providers: [DateScalar], exports: [DateScalar] })
export class SharedModule {}
```

Why it is right: the scalar has one definition and one registration point, and every feature that
uses `Date` shares it.

Reference: [NestJS GraphQL Scalars](https://docs.nestjs.com/graphql/scalars) | [NestJS GraphQL Other features](https://docs.nestjs.com/graphql/other-features)
