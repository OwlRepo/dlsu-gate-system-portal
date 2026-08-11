import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { HttpCacheInterceptor } from './cache.interceptor';

function contextFor(url: string, method = 'GET'): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ url, method, query: {} }),
    }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('HttpCacheInterceptor', () => {
  let interceptor: HttpCacheInterceptor;

  beforeEach(() => {
    const reflector = { get: jest.fn().mockReturnValue(undefined) };
    interceptor = new HttpCacheInterceptor(
      {},
      reflector as unknown as Reflector,
    );
  });

  it('never caches auth endpoints (responses are per-user)', () => {
    expect(interceptor.trackBy(contextFor('/auth/validate'))).toBeUndefined();
    expect(interceptor.trackBy(contextFor('/auth/logout'))).toBeUndefined();
  });

  it('still caches other GET endpoints', () => {
    expect(interceptor.trackBy(contextFor('/reports?x=1'))).toBeDefined();
  });

  it('does not cache non-GET requests', () => {
    expect(interceptor.trackBy(contextFor('/reports', 'POST'))).toBeUndefined();
  });
});
