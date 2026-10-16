---
title: Implement Secure JWT Authentication
impact: CRITICAL
impactDescription: Essential for secure GraphQL APIs
tags: graphql, jwt, authentication, tokens
---

## Implement Secure JWT Authentication

Use `@nestjs/jwt` with `@nestjs/passport` for authentication in GraphQL. Read the token from the GraphQL request (`GqlExecutionContext.create(context).getContext().req`), populate the context's `user`, and use guards on resolvers. Store secrets securely, use appropriate token lifetimes, implement refresh tokens, and validate tokens properly. Never expose sensitive data in JWT payloads.

Auth is its own feature module. Strategies live in `modules/auth/strategies/`, auth services in `modules/auth/services/`, and `AuthModule` depends on `UsersModule` — never the reverse.

**Incorrect (insecure JWT implementation):**

```typescript
// Hardcode secrets
@Module({
  imports: [
    JwtModule.register({
      secret: 'my-secret-key', // Exposed in code
      signOptions: { expiresIn: '7d' }, // Too long
    }),
  ],
})
export class AuthModule {}

// Store sensitive data in JWT
async login(user: User): Promise<{ accessToken: string }> {
  const payload = {
    sub: user.id,
    email: user.email,
    password: user.password, // NEVER include password!
    ssn: user.ssn, // NEVER include sensitive data!
    isAdmin: user.isAdmin,
  };
  return { accessToken: this.jwtService.sign(payload) };
}

// Skip token validation
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: 'my-secret',
    });
  }

  async validate(payload: any): Promise<any> {
    return payload; // No validation of user existence
  }
}
```

**Correct (secure JWT with refresh tokens in GraphQL):**

```typescript
// modules/auth/auth.module.ts — auth depends on users, one way
@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // namespaced, validated config — the `auth` namespace is registered in config/
    // (see devops-use-config-module)
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('auth.jwtSecret'),
        signOptions: {
          expiresIn: '15m', // Short-lived access tokens
          issuer: config.get<string>('auth.jwtIssuer'),
          audience: config.get<string>('auth.jwtAudience'),
        },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy, AuthMutationResolver],
  exports: [AuthService],
})
export class AuthModule {}

// modules/auth/services/auth.service.ts — minimal JWT payload
@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly refreshTokens: RefreshTokensRepository,
  ) {}

  async login(user: User): Promise<TokenResponse> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      iat: Math.floor(Date.now() / 1000),
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = await this.createRefreshToken(user.id);

    return { accessToken, refreshToken, expiresIn: 900 };
  }

  private async createRefreshToken(userId: string): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const hashedToken = await bcrypt.hash(token, 10);

    await this.refreshTokens.save({
      userId,
      token: hashedToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    return token;
  }
}

// common/guards/jwt-auth.guard.ts — delegates token verification to the JWT strategy below,
// so req.user is the validated User (not the raw token payload)
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Passport runs JwtStrategy; req.user becomes the User returned by validate()
    return super.canActivate(context);
  }
}

// modules/auth/strategies/jwt.strategy.ts — proper JWT strategy with validation
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private config: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('auth.jwtSecret'),
      ignoreExpiration: false,
      issuer: config.get<string>('auth.jwtIssuer'),
      audience: config.get<string>('auth.jwtAudience'),
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    const user = await this.usersService.findById(payload.sub);

    // user.isActive and user.passwordChangedAt are User entity fields
    // (see nestjs-graphql-structure -> data-entity-mongodb)
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // Only check when the entity tracks it and the token carries an issued-at
    if (user.passwordChangedAt && payload.iat) {
      const tokenIssuedAt = new Date(payload.iat * 1000);
      if (tokenIssuedAt < user.passwordChangedAt) {
        throw new UnauthorizedException('Token invalidated by password change');
      }
    }

    return user;
  }
}

// modules/users/resolvers/users.query.resolver.ts — resolver with auth
@Resolver(() => User)
@UseGuards(JwtAuthGuard)
export class UsersQueryResolver {
  @Query(() => User)
  me(@CurrentUser() user: User) {
    return user;
  }

  @Mutation(() => Boolean)
  async updateProfile(
    @Args('input') input: UpdateUserInput,
    @CurrentUser() user: User,
  ) {
    return this.usersService.update(user.id, input);
  }
}

// infra/graphql/graphql.context.ts — the per-request context (see infra-graphql)
export function buildContext(req: Request) {
  // Extract user from JWT and add to context
  return { req, user: req.user };
}
```

Reference: [NestJS Authentication](https://docs.nestjs.com/security/authentication) | [GraphQL Authentication](https://docs.nestjs.com/security/authentication#graphql)
