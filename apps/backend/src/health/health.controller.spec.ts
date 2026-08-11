import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('is public — the deploy readiness probe calls /health without a token', () => {
    // Before the dev-bypass removal this endpoint only answered tokenless
    // probes because NODE_ENV=development let them through the guard. It must
    // be explicitly public or every deploy fails its readiness gate with 401.
    const reflector = new Reflector();
    expect(reflector.get(IS_PUBLIC_KEY, HealthController)).toBe(true);
  });
});
