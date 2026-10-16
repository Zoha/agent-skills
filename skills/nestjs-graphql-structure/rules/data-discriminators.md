---
title: Model Polymorphic Subtypes with Discriminators
impact: MEDIUM-HIGH
impactDescription: one collection, many shapes, one base model
tags: mongoose, discriminators, polymorphic, mongodb, entities
---

## Model Polymorphic Subtypes with Discriminators

**Impact: MEDIUM-HIGH (one collection, many shapes, one base model)**

**Purpose.** When several document shapes share a base and belong together — different user roles,
different event kinds — store them in one collection with Mongoose **discriminators**: a base
schema plus a discriminator schema per subtype, differentiated by the discriminator key (default
`__t`, overridable with `discriminatorKey`). Register them through NestJS so each subtype is its
own injectable model, all backed by the base collection. The GraphQL side of the same feature is
`type-polymorphic-discriminators`.

**Placement.** Base and subtype entities in `modules/<feature>/entities/`; registration in the
feature module's `MongooseModule.forFeature`.

**Responsibilities.**

- Give the base schema a `discriminatorKey` (`@Schema({ discriminatorKey: 'kind' })`) and declare
  the key field with the `enum` of subtype names.
- Declare each subtype as a class that extends the base entity, adding only its extra fields.
- Register each subtype under `discriminators: [{ name, schema, value? }]`; `value` defaults to the
  model name, so set it explicitly when the stored key should differ.
- Inject a subtype's model with `@InjectModel(Subtype.name)` **in the repository** (see
  `data-model-injection`).
- Query the base model to read every subtype, or a discriminator model to read one.

**Never.**

- Use separate collections when the shapes share a base and are queried together — that repeats the
  common fields and loses the shared query (see `data-derived-fields`).
- Let a client set the discriminator key directly; the model that creates the document owns it.
- Call `pre()`/`post()` hooks **after** defining a discriminator — declare hooks on the schema
  before it is used as a discriminator.

**Incorrect (separate schemas that repeat the shared fields, queried apart):**

```typescript
// three unrelated collections; common fields duplicated, no shared query
@Schema() export class ClickedLinkEvent { @Prop() time: Date; @Prop() url: string; }
@Schema() export class SignUpEvent { @Prop() time: Date; @Prop() user: string; }
// no base model, no discriminator key, no way to read "all events" in one query
```

Why it is wrong: the shared `time` field is repeated, the two shapes cannot be queried together, and
shared validation has to be copied into each schema.

**Correct (base + subtypes + registration; each subtype is injectable):**

```typescript
// entities/event.entity.ts — the shared base
@ObjectType()
@Schema({ discriminatorKey: 'kind', timestamps: true, collection: 'events' })
export class Event {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Field(() => EventKind)
  @Prop({ type: String, required: true, enum: EventKind })
  kind: EventKind;

  @Field()
  @Prop({ type: Date, required: true })
  time: Date;
}

export const EventSchema = SchemaFactory.createForClass(Event);

// entities/clicked-link-event.entity.ts — a subtype
@ObjectType()
@Schema()
export class ClickedLinkEvent extends Event {
  @Field()
  @Prop({ type: String, required: true })
  url: string;
}

export const ClickedLinkEventSchema = SchemaFactory.createForClass(ClickedLinkEvent);

// events.module.ts — register the base plus its discriminators
@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Event.name,
        schema: EventSchema,
        discriminators: [
          { name: ClickedLinkEvent.name, schema: ClickedLinkEventSchema },
          { name: SignUpEvent.name, schema: SignUpEventSchema, value: 'signup' },
        ],
      },
    ]),
  ],
  providers: [EventsRepository, EventsService, EventsQueryResolver],
})
export class EventsModule {}
```

```typescript
// repositories/events.repository.ts — subtype models are injected here, nowhere else
@Injectable()
export class EventsRepository {
  constructor(
    @InjectModel(Event.name) private readonly eventModel: Model<EventDocument>,
    @InjectModel(ClickedLinkEvent.name)
    private readonly clickedModel: Model<ClickedLinkEventDocument>,
  ) {}

  findAll(): Promise<EventDocument[]> {
    return this.eventModel.find().exec();     // every subtype, from the base model
  }

  findClicked(): Promise<ClickedLinkEventDocument[]> {
    return this.clickedModel.find().exec();   // one subtype
  }
}
```

Why it is right: one collection holds every shape, the shared base is written once, each subtype has
its own injectable model used only in the repository, and the base model reads all events in one
query.

When you expose these to GraphQL, make the base the polymorphic type so the concrete type is chosen
from the discriminator key automatically — see `type-polymorphic-discriminators`.

Reference: [NestJS MongoDB — Discriminators](https://docs.nestjs.com/techniques/mongodb) | [Mongoose Discriminators](https://mongoosejs.com/docs/discriminators.html)
