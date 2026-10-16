---
title: Use Proper Module Sharing Patterns
impact: CRITICAL
impactDescription: Prevents duplicate instances, memory leaks, and state inconsistency
tags: architecture, modules, sharing, exports
---

## Use Proper Module Sharing Patterns

NestJS modules are singletons by default. When a service is properly exported from a module and that module is imported elsewhere, the same instance is shared. However, providing a service in multiple modules creates separate instances, leading to memory waste, state inconsistency, and confusing behavior. Always encapsulate services in dedicated modules, export them explicitly, and import the module where needed.

**Incorrect (service provided in multiple modules):**

```typescript
// StorageService provided directly in multiple modules - WRONG
// common/services/storage.service.ts
@Injectable()
export class StorageService {
  private cache = new Map(); // Each instance has separate state!

  store(key: string, value: any) {
    this.cache.set(key, value);
  }
}

// modules/videos/videos.module.ts
@Module({
  providers: [StorageService], // Instance #1
})
export class VideosModule {}

// modules/channels/channels.module.ts
@Module({
  providers: [StorageService], // Instance #2 - different from VideosModule!
})
export class ChannelsModule {}

// Problems:
// 1. Two separate StorageService instances exist
// 2. cache.set() in ChannelsModule doesn't affect VideosModule's cache
// 3. Memory wasted on duplicate instances
// 4. Debugging nightmares when state doesn't sync
```

**Correct (dedicated shared module with exports):**

```typescript
// common/shared.module.ts
@Module({
  providers: [StorageService],
  exports: [StorageService], // Make available to importers
})
export class SharedModule {}

// modules/videos/videos.module.ts
@Module({
  imports: [SharedModule], // Import the module, not the service
  providers: [VideosService],
})
export class VideosModule {}

// modules/channels/channels.module.ts
@Module({
  imports: [SharedModule], // Same instance shared
  providers: [ChannelsService],
})
export class ChannelsModule {}

// app.module.ts
@Module({
  imports: [
    SharedModule, // Only if AppModule itself needs StorageService
    VideosModule,
    ChannelsModule,
  ],
})
export class AppModule {}

// Now all modules share the SAME StorageService instance
```

**When to use @Global() (sparingly):**

```typescript
// ONLY for truly cross-cutting concerns
@Global()
@Module({
  providers: [LoggerService, HashingService],
  exports: [LoggerService, HashingService],
})
export class SharedModule {}

// Import once in AppModule
@Module({
  imports: [SharedModule], // Registered globally, available everywhere
})
export class AppModule {}

// Other modules don't need to import SharedModule
@Module({
  providers: [UsersService], // Can inject LoggerService without importing
})
export class UsersModule {}

// WARNING: Don't make everything global!
// - Hides dependencies (can't see what a module needs from imports)
// - Makes testing harder
// - Reserve for: config, logging, and other genuinely app-wide providers
```

**Re-exporting shared providers:**

```typescript
// common/shared.module.ts - shared utilities
@Module({
  providers: [DateService, ValidationService],
  exports: [DateService, ValidationService],
})
export class SharedModule {}

// common/building-blocks.module.ts - re-exports shared providers for convenience
@Module({
  imports: [SharedModule],
  exports: [SharedModule], // Re-export for consumers
})
export class BuildingBlocksModule {}

// a feature imports BuildingBlocksModule and gets every shared provider
@Module({
  imports: [BuildingBlocksModule],
  providers: [FeatureService],
})
export class FeatureModule {}
```

Infrastructure is **not** shared through this module. The database connection, `GraphQLModule`, and config registration are one-time infrastructure imported by the composition root from `infra/` — they are never re-exported by `SharedModule`.

Reference: [NestJS Modules](https://docs.nestjs.com/modules#shared-modules)
