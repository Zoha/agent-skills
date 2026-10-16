---
title: Keep Third-Party Clients in providers/
impact: MEDIUM-HIGH
impactDescription: vendor SDKs are wrapped behind a thin, injectable provider
tags: providers, integrations, adapters, services
---

## Keep Third-Party Clients in providers/

**Impact: MEDIUM-HIGH (vendor SDKs are wrapped behind a thin, injectable provider)**

**Purpose.** A feature that talks to an external system — a payment gateway, object storage, a
mailer, an SMS or analytics API — wraps that vendor SDK in a thin provider. Providers live in the
feature's `providers/` folder, next to the services that use them, so the vendor's types and error
shapes stay at the edge and the feature's services depend on a narrow, mockable wrapper. Business
logic stays in `services/`; the provider only translates.

**Placement.** `modules/<feature>/providers/<vendor>.provider.ts` (class `<Vendor>Provider`).
Configuration is read from `config/` (see `infra-config`), never hardcoded.

**Responsibilities.**

- Wrap one external system per file, exposing intention-revealing methods.
- Translate vendor errors into domain errors (see `infra-exceptions`).
- Be injectable so tests can substitute a fake.

**Never.**

- Call a vendor SDK directly from a service or resolver.
- Leak a vendor-specific type or error shape into the feature's services' contract.
- Hardcode credentials or endpoints — read typed config.

**Incorrect (vendor SDK called directly from business logic):**

```typescript
// services/payments.service.ts
@Injectable()
export class PaymentsService {
  async charge(order: Order) {
    const stripe = new Stripe(process.env.STRIPE_KEY); // SDK + secret inside the service
    const res = await stripe.paymentIntents.create({ /* ... */ }); // vendor shapes leak inward
    return res.id;
  }
}
```

Why it is wrong: the vendor SDK and its error shapes leak into business logic, the secret is read
ad hoc, and the service cannot be tested without the vendor.

**Correct (a thin provider wraps the vendor; the service depends on it):**

```typescript
// modules/payments/providers/stripe.provider.ts
@Injectable()
export class StripeProvider {
  private readonly stripe: Stripe;

  constructor(config: ConfigService) {
    this.stripe = new Stripe(config.get<string>('payment.stripeKey'));
  }

  async charge(amount: number, currency: string): Promise<{ id: string }> {
    const intent = await this.stripe.paymentIntents.create({ amount, currency });
    return { id: intent.id };
  }
}

// services/payments.service.ts
@Injectable()
export class PaymentsService {
  constructor(private readonly stripe: StripeProvider) {}

  async charge(order: Order): Promise<void> {
    await this.stripe.charge(order.total, order.currency);
  }
}
```

Why it is right: the vendor stays at the edge, the service depends on a narrow provider that is
trivial to mock, and the secret comes from typed config.

Reference: [NestJS Providers](https://docs.nestjs.com/providers) | [NestJS Custom Providers](https://docs.nestjs.com/fundamentals/custom-providers)
