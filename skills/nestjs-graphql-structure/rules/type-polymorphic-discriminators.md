---
title: Publish Discriminated Documents as an Interface or Union
impact: HIGH
impactDescription: resolveType maps the discriminator key to the concrete type
tags: graphql, discriminators, resolveType, interfaces, unions, polymorphic
---

## Publish Discriminated Documents as an Interface or Union

**Impact: HIGH (resolveType maps the discriminator key to the concrete type)**

**Purpose.** A collection that stores several document shapes (Mongoose discriminators, see
`data-discriminators`) is polymorphic in the database and should be polymorphic in the schema: one
abstract GraphQL type — an `@InterfaceType` or a `createUnionType` — whose concrete type is chosen
**automatically** from the document's discriminator key. Implement `resolveType` once, reading the
key (`__t` or your `discriminatorKey`), and map it to the concrete `@ObjectType`. Every resolver
that returns the abstract type then publishes the correct subtype with no per-resolver branching.

**Placement.** The abstract type in `modules/<feature>/models/<name>.interface.ts` or
`<name>.union.ts` (see `type-unions-interfaces`); the concrete `@ObjectType`s in `entities/`
(merged case) or `models/`; a single registry mapping each discriminator value to its type.

**Responsibilities.**

- Declare the base as the abstract type and the subtypes as `@ObjectType`s — an interface requires
  `@ObjectType({ implements: () => [Base] })` on each concrete type.
- Implement exactly one `resolveType` that reads the discriminator key and returns the concrete
  class (or its name).
- Keep the discriminator value -> type mapping in one shared registry, used by both the interface
  and any union over the same types.
- Expose the discriminator key as a GraphQL enum field so clients can branch without inline
  fragments when that is cheaper.

**Never.**

- Guess the type from field presence (`if (value.name) …`) when a discriminator key exists.
- Re-implement `resolveType` in more than one place, or inline in a resolver.
- Return plain object literals that lose the class identity the default `resolveType` relies on.

**Incorrect (shape heuristics, repeated per resolver):**

```typescript
// modules/events/resolvers/events.query.resolver.ts
const EventResult = createUnionType({
  name: 'EventResult',
  types: () => [ClickedLinkEvent, SignUpEvent] as const,
  resolveType: (value) => (value.url ? ClickedLinkEvent : SignUpEvent), // heuristic, duplicated
});

@Query(() => [EventResult])
events() { /* ... */ }
```

Why it is wrong: the type is decided by guessing at field presence rather than the discriminator
key the database already stored, so an ambiguous document resolves to the wrong type — and the same
guess gets repeated wherever events are returned.

**Correct (one interface, one registry, key-driven resolveType):**

```typescript
// constants/event-kind.ts — the discriminator values, shared by storage and schema
export enum EventKind {
  ClickedLink = 'ClickedLink',
  SignUp = 'signup',
}
registerEnumType(EventKind, { name: 'EventKind' });

// models/event-types.ts — the one registry: discriminator value -> concrete ObjectType
export const EVENT_TYPES = {
  [EventKind.ClickedLink]: ClickedLinkEvent,
  [EventKind.SignUp]: SignUpEvent,
} as const;

// entities/event.entity.ts — the base is the GraphQL interface AND the Mongoose base schema
@InterfaceType({
  resolveType: (event: EventDocument) => EVENT_TYPES[event.kind],
})
@Schema({ discriminatorKey: 'kind', collection: 'events' })
export abstract class Event {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Field(() => EventKind)
  @Prop({ type: String, required: true, enum: EventKind })
  kind: EventKind;

  @Field()
  time: Date;
}

// entities/clicked-link-event.entity.ts — a concrete type implements the interface
@ObjectType({ implements: () => [Event] })
@Schema()
export class ClickedLinkEvent extends Event {
  @Field()
  url: string;
}

// Any resolver returning the base type needs no branching:
@Query(() => [Event])
events(): Promise<EventDocument[]> {
  return this.eventsService.findAll();
}
```

Why it is right: `resolveType` reads the stored discriminator key and returns the concrete type, so
any resolver that returns `Event` publishes the right subtype automatically, and the mapping lives
in one registry.

**Union variant (same registry, no interface needed):**

```typescript
// models/event-result.union.ts
export const EventResult = createUnionType({
  name: 'EventResult',
  types: () => [ClickedLinkEvent, SignUpEvent] as const,
  resolveType: (event: EventDocument) => EVENT_TYPES[event.kind], // the same one registry
});
```

Use an interface when the types share fields clients query in common; use a union when they do not.
Either way the concrete type comes from the discriminator key, not from a guess.

Reference: [NestJS GraphQL Interfaces](https://docs.nestjs.com/graphql/interfaces) | [NestJS GraphQL Unions and Enums](https://docs.nestjs.com/graphql/unions-and-enums) | [Mongoose Discriminators](https://mongoosejs.com/docs/discriminators.html)

**Behavioral depth.** See `nestjs-best-practices` -> `arch-schema-evolution`.
