---
title: Declare Service Contracts and Injection Tokens in interfaces/
impact: MEDIUM-HIGH
impactDescription: depend on a contract, provide the implementation
tags: interfaces, tokens, di, ports, providers
---

## Declare Service Contracts and Injection Tokens in interfaces/

**Impact: MEDIUM-HIGH (depend on a contract, provide the implementation)**

**Purpose.** When a consumer should depend on a contract rather than a concrete class — a payment
gateway, a mailer, a storage adapter — declare an interface (or abstract class) and its injection
token in an `interfaces/` folder, then let the module provide the implementation. The contract and
its token live together: feature-local in `modules/<feature>/interfaces/`, or shared in
`common/interfaces/`. Consumers inject by token; the module chooses which implementation to bind.

**Placement.**

- Feature-local contract: `modules/<feature>/interfaces/<name>.interface.ts` (interface or abstract
  class and its `Symbol` token in the same file).
- Shared contract: `common/interfaces/<name>.interface.ts`.

**Responsibilities.**

- Export the interface and its token from one file.
- Provide an implementation for the token in the owning module's `providers`.
- Let consumers inject the token, not the concrete class.

**Never.**

- Inject a concrete class when a contract exists — that defeats substitution.
- Keep a token in a different file from its interface, so the two drift.
- Declare a contract in a feature that another feature also needs — promote it to `common/interfaces/`.

**Incorrect (the consumer depends on the concrete implementation):**

```typescript
// modules/payments/services/payments.service.ts
@Injectable()
export class PaymentsService {
  constructor(private readonly stripe: StripeProvider) {} // welded to one implementation
}
```

Why it is wrong: the service cannot be pointed at a different implementation or a test double without
editing it.

**Correct (contract + token in interfaces/, implementation provided by the module):**

```typescript
// modules/payments/interfaces/payment-gateway.interface.ts
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface PaymentGateway {
  charge(amount: number, currency: string): Promise<{ id: string }>;
}

// modules/payments/payments.module.ts — the module chooses the implementation
@Module({
  providers: [
    { provide: PAYMENT_GATEWAY, useClass: StripeProvider },
    PaymentsService,
  ],
})
export class PaymentsModule {}

// modules/payments/services/payments.service.ts — depends on the contract
@Injectable()
export class PaymentsService {
  constructor(@Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway) {}
}
```

Why it is right: the service depends on a contract whose implementation the module supplies, so it is
trivially substitutable for another vendor or a test double.

Reference: [NestJS Custom Providers](https://docs.nestjs.com/fundamentals/custom-providers) | [NestJS Modules](https://docs.nestjs.com/modules)

**Behavioral depth.** See `nestjs-best-practices` -> `di-use-interfaces-tokens`, `di-interface-segregation`.
