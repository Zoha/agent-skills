---
title: Handle Uploads Behind a Storage Provider
impact: MEDIUM
impactDescription: one storage abstraction; the Upload scalar is infra
tags: uploads, storage, files, infra, scalars
---

## Handle Uploads Behind a Storage Provider

**Impact: MEDIUM (one storage abstraction; the Upload scalar is infra)**

**Purpose.** Uploads cross feature boundaries — avatars, attachments, exports — so they do not belong
to any one feature. Put object storage behind a single shared storage service and enable the GraphQL
`Upload` scalar once in `infra/graphql/`. Features accept an `Upload` argument and hand the stream to
the shared service; they never talk to the storage SDK directly.

**Placement.**

- Shared storage service (wraps the vendor SDK): `common/services/<name>.service.ts`, provided by
  `common/shared.module.ts`.
- `Upload` scalar and `graphql-upload` wiring: `infra/graphql/graphql.module.ts`.

**Responsibilities.**

- Wrap the storage SDK in one shared service, reading credentials from `config/`.
- Expose upload/download through that feature-agnostic service.
- Register the `Upload` scalar once, in the GraphQL infrastructure module.

**Never.**

- Let a feature import the storage SDK or hold storage credentials.
- Register the `Upload` scalar in more than one place.
- Stream a file to storage directly inside a resolver method body.

**Incorrect (each feature wires its own storage SDK):**

```typescript
// modules/users/resolvers/users.mutation.resolver.ts
@Mutation(() => User)
async uploadAvatar(@Args('file', { type: () => GraphQLUpload }) file: Upload) {
  const s3 = new S3Client({ credentials: { /* ... */ } }); // SDK + credentials in a feature
  const { createReadStream, mimetype } = await file;
  await s3.upload(/* ... */);
}
```

Why it is wrong: the storage SDK, its credentials, and the upload mechanics leak into a feature and
get duplicated by the next feature that needs storage.

**Correct (one shared storage service; scalar registered in infra):**

```typescript
// common/services/storage.service.ts — the single abstraction over object storage
@Injectable()
export class StorageService {
  private readonly client: S3Client;

  constructor(config: ConfigService) {
    this.client = new S3Client(/* built from typed config */);
  }

  async put(key: string, body: Buffer, contentType: string): Promise<string> {
    // ...upload, return the public URL
  }
}

// modules/users/resolvers/users.mutation.resolver.ts — thin, feature-agnostic storage
@Mutation(() => User)
async uploadAvatar(
  @Args('file', { type: () => GraphQLUpload }) file: Upload,
  @CurrentUser() user: AuthenticatedUser,
): Promise<User> {
  const url = await this.storageService.put(`avatars/${user.id}`, await streamToBuffer(file), file.mimetype);
  return this.usersService.setAvatar(user.id, url);
}
```

Why it is right: storage lives behind one shared service, the `Upload` scalar is registered once in
`infra/graphql/`, and every feature uploads the same way.

Reference: [NestJS GraphQL File Uploads](https://docs.nestjs.com/graphql/file-uploads) | [NestJS Modules — Shared modules](https://docs.nestjs.com/modules#shared-modules)
