import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';

import { JwtAuthGuard } from './jwt-auth.guard';
import { TokenBlacklistService } from './token-blacklist.service';

const TEST_SECRET = 'unit-test-secret';

function contextFor(authorization?: string): ExecutionContext {
  const request: Record<string, any> = { headers: {} };
  if (authorization) {
    request.headers.authorization = authorization;
  }
  const handler = function handler() {};
  class Controller {}
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => Controller,
    __request: request,
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let jwtService: JwtService;
  let blacklist: jest.Mocked<
    Pick<
      TokenBlacklistService,
      'isTokenBlacklisted' | 'getActiveTokensByUser' | 'trackUserToken'
    >
  >;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    process.env = { ...originalEnv };
    delete process.env.DEV_AUTH_BYPASS;
    delete process.env.JWT_SECRET;

    blacklist = {
      isTokenBlacklisted: jest.fn().mockResolvedValue(false),
      getActiveTokensByUser: jest.fn().mockResolvedValue([]),
      trackUserToken: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: TEST_SECRET })],
      providers: [
        JwtAuthGuard,
        Reflector,
        { provide: TokenBlacklistService, useValue: blacklist },
      ],
    }).compile();

    guard = module.get(JwtAuthGuard);
    jwtService = module.get(JwtService);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('accepts a token signed by the module JwtService without reading process.env.JWT_SECRET', async () => {
    // Regression for the prod outage: signing and verification must share the
    // module-configured secret, not a request-time process.env lookup.
    const token = jwtService.sign({ sub: 1, username: 'u', role: 'ADMIN' });
    const ctx = contextFor(`Bearer ${token}`);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect((ctx as any).__request.user).toMatchObject({
      sub: 1,
      role: 'ADMIN',
    });
  });

  it('rejects a token signed with a different secret', async () => {
    const foreign = new JwtService({ secret: 'some-other-secret' });
    const token = foreign.sign({ sub: 1, username: 'u', role: 'ADMIN' });

    await expect(
      guard.canActivate(contextFor(`Bearer ${token}`)),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects tokenless requests even when NODE_ENV=development (no SUPER_ADMIN bypass)', async () => {
    process.env.NODE_ENV = 'development';

    await expect(guard.canActivate(contextFor())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('allows the dev bypass only with explicit DEV_AUTH_BYPASS=true outside production', async () => {
    process.env.NODE_ENV = 'test';
    process.env.DEV_AUTH_BYPASS = 'true';

    const ctx = contextFor();
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect((ctx as any).__request.user).toMatchObject({ username: 'dev-user' });
  });

  it('ignores DEV_AUTH_BYPASS when NODE_ENV=production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DEV_AUTH_BYPASS = 'true';

    await expect(guard.canActivate(contextFor())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects blacklisted tokens', async () => {
    blacklist.isTokenBlacklisted.mockResolvedValue(true);
    const token = jwtService.sign({ sub: 1, username: 'u', role: 'ADMIN' });

    await expect(
      guard.canActivate(contextFor(`Bearer ${token}`)),
    ).rejects.toThrow('Session expired. Please login again.');
  });

  it('does not log out when token tracking fails', async () => {
    blacklist.getActiveTokensByUser.mockRejectedValue(new Error('db down'));
    const token = jwtService.sign({ sub: 1, username: 'u', role: 'ADMIN' });

    await expect(
      guard.canActivate(contextFor(`Bearer ${token}`)),
    ).resolves.toBe(true);
  });
});
