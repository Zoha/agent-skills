---
title: Use Supertest for E2E Testing
impact: HIGH
impactDescription: Validates the full request/response cycle
tags: testing, e2e, supertest, graphql
---

## Use Supertest for E2E Testing

End-to-end tests use Supertest to make real HTTP requests against your NestJS application. In a code-first GraphQL app that means POSTing a query or mutation to the single GraphQL endpoint (default `/graphql`) and asserting on `res.body.data` / `res.body.errors`. They test the full stack — guards, pipes, interceptors, and the generated schema. E2E specs live in the top-level `test/` folder as `test/<feature>.e2e-spec.ts`.

**Incorrect (only unit-testing resolvers, or an e2e without setup/teardown):**

```typescript
// Only unit test the resolver
describe('UsersResolver', () => {
  it('should return users', async () => {
    const service = { findAll: jest.fn().mockResolvedValue([]) };
    const resolver = new UsersResolver(service as any);

    const result = await resolver.users();

    expect(result).toEqual([]);
    // Doesn't test: guards, pipes, interceptors, the schema
  });
});

// E2E tests without proper setup/teardown
describe('Users API', () => {
  it('should create user', async () => {
    const app = await NestFactory.create(AppModule);
    // No proper initialization
    // No cleanup after test
    // Hits real database
  });
});
```

**Correct (proper E2E setup with Supertest against the GraphQL endpoint):**

```typescript
// test/users.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Users (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Apply same config as production
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('createUser mutation', () => {
    it('should create a user', () => {
      return request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation($input: CreateUserInput!) {
              createUser(input: $input) { _id name email }
            }
          `,
          variables: { input: { name: 'John', email: 'john@test.com' } },
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.errors).toBeUndefined();
          expect(res.body.data.createUser.name).toBe('John');
          expect(res.body.data.createUser.email).toBe('john@test.com');
        });
    });

    it('should report a validation error for an invalid email', () => {
      return request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `mutation($input: CreateUserInput!) { createUser(input: $input) { _id } }`,
          variables: { input: { name: 'John', email: 'invalid-email' } },
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.errors[0].message).toContain('email');
        });
    });
  });

  describe('user query', () => {
    it('should return an error for a non-existent user', () => {
      return request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `query($id: String!) { user(id: $id) { _id } }`,
          variables: { id: '000000000000000000000000' },
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.errors[0].extensions.code).toBe('USER_NOT_FOUND');
        });
    });
  });
});

// GraphQL returns 200 with an `errors` array — assert on it, not on HTTP status
describe('Protected queries (e2e)', () => {
  let app: INestApplication;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    // Get auth token
    const loginResponse = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `mutation($input: LoginInput!) { login(input: $input) { accessToken } }`,
        variables: { input: { email: 'test@test.com', password: 'password' } },
      });

    authToken = loginResponse.body.data.login.accessToken;
  });

  it('should return an UNAUTHENTICATED error without a token', () => {
    return request(app.getHttpServer())
      .post('/graphql')
      .send({ query: `query { me { _id email } }` })
      .expect(200)
      .expect((res) => {
        expect(res.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
      });
  });

  it('should return the profile with a valid token', () => {
    return request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ query: `query { me { email } }` })
      .expect(200)
      .expect((res) => {
        expect(res.body.data.me.email).toBe('test@test.com');
      });
  });
});

// Database isolation for E2E tests
describe('Orders (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          envFilePath: '.env.test', // Test database config
        }),
        AppModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    connection = moduleFixture.get(getConnectionToken());
    await app.init();
  });

  beforeEach(async () => {
    // Clean database between tests
    await connection.dropDatabase();
  });

  afterAll(async () => {
    await connection.close();
    await app.close();
  });
});
```

Reference: [NestJS E2E Testing](https://docs.nestjs.com/fundamentals/testing#end-to-end-testing) | [GraphQL over HTTP](https://graphql.org/learn/serving-over-http/)
