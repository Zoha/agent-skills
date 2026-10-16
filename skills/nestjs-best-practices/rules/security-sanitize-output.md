---
title: Sanitize Output to Prevent XSS
impact: HIGH
impactDescription: XSS vulnerabilities can compromise user sessions and data
tags: security, xss, sanitization, html
---

## Sanitize Output to Prevent XSS

Sanitize user-generated content at the API boundary before you store it. GraphQL responses are JSON, so the GraphQL transport itself is safe — browsers do not execute JSON. The risk is what happens later: the same content is usually rendered by a client or an SSR/REST surface, and reflecting raw input is a classic injection vector. Because the transport is JSON, the fix is to sanitize/encode on store and on render — not to patch the GraphQL layer.

**Incorrect (persisting raw, unsanitized content):**

```typescript
// Raw content from the client is persisted unchanged
@InputType()
export class CreateCommentInput {
  @Field()
  content: string; // may contain <script>steal(document.cookie)</script>

  @Field()
  authorId: string;
}

// modules/comments/resolvers/comments.mutation.resolver.ts
@Resolver(() => Comment)
export class CommentsMutationResolver {
  @Mutation(() => Comment)
  createComment(@Args('input') input: CreateCommentInput): Promise<Comment> {
    // The unsanitized value is stored, so every renderer must now defend itself
    return this.commentsService.create(input);
  }
}
```

**Correct (sanitize content on the input, persist the sanitized value):**

```typescript
// Sanitize via a @Transform on the input, before the value reaches the service
import { Transform } from 'class-transformer';
import * as sanitizeHtml from 'sanitize-html';

const ALLOWED_COMMENT_TAGS = ['p', 'br', 'b', 'i', 'em', 'strong', 'a'];

@InputType()
export class CreateCommentInput {
  @Field()
  @Transform(({ value }) =>
    sanitizeHtml(value, {
      allowedTags: ALLOWED_COMMENT_TAGS,
      allowedAttributes: { a: ['href', 'title'] },
      allowedSchemes: ['http', 'https', 'mailto'],
    }),
  )
  content: string;

  @Field()
  authorId: string;
}

// The sanitized value is what the resolver receives and what gets persisted
@Resolver(() => Comment)
export class CommentsMutationResolver {
  @Mutation(() => Comment)
  createComment(@Args('input') input: CreateCommentInput): Promise<Comment> {
    return this.commentsService.create(input);
  }
}
```

The `@Transform` runs inside the input's transform pipeline, so the resolver and service receive an already-sanitized value and the sanitized value is what is stored — a renderer can still encode on output, but the database never holds raw markup. For values that do not arrive through an input class (a scalar field argument, an uploaded blob), reuse the same allowlist through a small sanitizing pipe instead, so the policy lives in one place (see `use-pipes`). Strip tags entirely (`allowedTags: []`) for fields that should never contain markup, such as a title.

**Note: HTML surfaces only.** A Content-Security-Policy is defence in depth only when the same app also serves an HTML surface (an SSR page, or a REST/HTTP endpoint that returns HTML); it is irrelevant to a pure GraphQL JSON API. When such a surface exists, add it in `main.ts` so a missed sanitization cannot execute inline script:

```typescript
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
    }),
  );

  await app.listen(3000);
}
```

Reference: [OWASP XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
