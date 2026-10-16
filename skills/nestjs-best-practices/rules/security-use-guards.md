---
title: Use Guards for Authentication and Authorization
impact: HIGH
impactDescription: Enforces access control before handlers execute
tags: security, guards, authentication, authorization
---

## Use Guards for Authentication and Authorization

Guards determine whether a request should be handled based on authentication state, roles, permissions, or other conditions. They run after middleware but before pipes and interceptors, making them ideal for access control. Use guards instead of manual checks in resolvers. In GraphQL, guards read the request through `GqlExecutionContext`; shared guards live in `common/guards/`.

**Incorrect (manual auth checks in every handler):**

```typescript
// Manual auth checks in every resolver
@Resolver()
export class AdminResolver {
  @Query(() => [User])
  async users(@Context() ctx: GqlContext) {
    if (!ctx.user) {
      throw new UnauthorizedException();
    }
    if (!ctx.user.roles.includes('admin')) {
      throw new ForbiddenException();
    }
    return this.adminService.getUsers();
  }

  @Mutation(() => Boolean)
  async deleteUser(@Args('id') id: string, @Context() ctx: GqlContext) {
    if (!ctx.user) {
      throw new UnauthorizedException();
    }
    if (!ctx.user.roles.includes('admin')) {
      throw new ForbiddenException();
    }
    return this.adminService.deleteUser(id);
  }
}
```

**Correct (guards with declarative decorators):**

```typescript
// common/guards/jwt-auth.guard.ts — authentication: delegates to the 'jwt' Passport strategy
// (see security-auth-jwt), which sets req.user to the validated user
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Check for @Public() decorator
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    return super.canActivate(context);
  }
}

// common/guards/roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) return true;

    const { user } = GqlExecutionContext.create(context).getContext().req;
    return requiredRoles.some((role) => user.roles?.includes(role));
  }
}

// common/decorators/public.decorator.ts, roles.decorator.ts
export const Public = () => SetMetadata('isPublic', true);
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);

// Register guards globally in AppModule (APP_GUARD is the idiomatic global registration)
@Module({
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}

// Clean resolver
@Resolver()
@Roles(Role.Admin) // Applied to every query and mutation on this resolver
export class AdminResolver {
  @Query(() => [User])
  users(): Promise<User[]> {
    return this.adminService.getUsers();
  }

  @Mutation(() => Boolean)
  deleteUser(@Args('id') id: string): Promise<boolean> {
    return this.adminService.deleteUser(id);
  }

  @Public() // Override: no auth required
  @Query(() => String)
  health(): string {
    return 'ok';
  }
}
```

Reference: [NestJS Guards](https://docs.nestjs.com/guards)
