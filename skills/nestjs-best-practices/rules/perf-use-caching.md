---
title: Use Caching Strategically
impact: HIGH
impactDescription: Dramatically reduces database load and response times
tags: performance, caching, redis, optimization
---

## Use Caching Strategically

Implement caching for expensive operations, frequently accessed data, and external API calls. Use NestJS CacheModule with appropriate TTLs and cache invalidation strategies. Don't cache everything - focus on high-impact areas.

**Incorrect (no caching or caching everything):**

```typescript
// No caching for expensive, repeated queries
@Injectable()
export class ProductsService {
  async getPopular(): Promise<Product[]> {
    // Runs complex aggregation query EVERY request
    return this.productsRepo
      .createQueryBuilder('p')
      .leftJoin('p.orders', 'o')
      .select('p.*, COUNT(o.id) as orderCount')
      .groupBy('p.id')
      .orderBy('orderCount', 'DESC')
      .limit(20)
      .getMany();
  }
}

// Cache everything without thought
@Injectable()
export class UsersService {
  @CacheKey('users')
  @CacheTTL(3600)
  @UseInterceptors(CacheInterceptor)
  async findAll(): Promise<User[]> {
    // Caching user list for 1 hour is wrong if data changes frequently
    return this.usersRepo.find();
  }
}
```

**Correct (strategic caching with proper invalidation):**

```typescript
// Setup caching module
@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        stores: [
          new KeyvRedis(config.get('REDIS_URL')),
        ],
        ttl: 60 * 1000, // Default 60s
      }),
    }),
  ],
})
export class AppModule {}

// Manual caching for granular control
@Injectable()
export class ProductsService {
  constructor(
    @Inject(CACHE_MANAGER) private cache: Cache,
    private productsRepo: ProductRepository,
  ) {}

  async getPopular(): Promise<Product[]> {
    const cacheKey = 'products:popular';

    // Try cache first
    const cached = await this.cache.get<Product[]>(cacheKey);
    if (cached) return cached;

    // Cache miss - fetch and cache
    const products = await this.fetchPopularProducts();
    await this.cache.set(cacheKey, products, 5 * 60 * 1000); // 5 min TTL
    return products;
  }

  // Invalidate cache on changes
  async updateProduct(id: string, input: UpdateProductInput): Promise<Product> {
    const product = await this.productsRepo.save({ id, ...input });
    await this.cache.del('products:popular'); // Invalidate
    return product;
  }
}

// Decorator-based caching for GraphQL. Define GraphQLCacheInterceptor once in
// common/interceptors/ (see use-interceptors) — the GraphQL-aware version derives its
// key from the field and its args, so findOne(id: 'a') and findOne(id: 'b') never
// share an entry (unlike a static @CacheKey).

// Apply it per resolver; @SetMetadata('cacheTTL', ...) sets the TTL
@Resolver(() => Category)
@UseInterceptors(GraphQLCacheInterceptor)
export class CategoriesQueryResolver {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Query(() => [Category])
  @SetMetadata('cacheTTL', 30 * 60 * 1000) // 30 minutes - categories rarely change
  findAll(): Promise<Category[]> {
    return this.categoriesService.findAll();
  }

  @Query(() => Category)
  @SetMetadata('cacheTTL', 60 * 1000) // 1 minute - keyed per id
  findOne(@Args('id', ParseObjectIdPipe) id: string): Promise<Category> {
    return this.categoriesService.findOne(id);
  }
}

// Nest's built-in CacheInterceptor is for plain HTTP surfaces only, where one
// static @CacheKey is acceptable. Never put it on a GraphQL resolver: the static
// key ignores the resolver's arguments and every caller shares a single entry.
@Controller('categories')
@UseInterceptors(CacheInterceptor)
export class CategoriesController {
  @Get()
  @CacheTTL(30 * 60 * 1000)
  @CacheKey('categories:all')
  findAll(): Promise<Category[]> {
    return this.categoriesService.findAll();
  }
}

// Event-based cache invalidation
@Injectable()
export class CacheInvalidationService {
  constructor(@Inject(CACHE_MANAGER) private cache: Cache) {}

  @OnEvent('product.created')
  @OnEvent('product.updated')
  @OnEvent('product.deleted')
  async invalidateProductCaches(event: ProductEvent) {
    await Promise.all([
      this.cache.del('products:popular'),
      this.cache.del(`product:${event.productId}`),
    ]);
  }
}
```

Reference: [NestJS Caching](https://docs.nestjs.com/techniques/caching)
