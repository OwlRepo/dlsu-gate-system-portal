import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { HealthController, healthThreshold } from './health.controller';

describe('HealthController', () => {
  it('is public — the deploy readiness probe calls /health without a token', () => {
    // Before the dev-bypass removal this endpoint only answered tokenless
    // probes because NODE_ENV=development let them through the guard. It must
    // be explicitly public or every deploy fails its readiness gate with 401.
    const reflector = new Reflector();
    expect(reflector.get(IS_PUBLIC_KEY, HealthController)).toBe(true);
  });

  describe('healthThreshold', () => {
    afterEach(() => {
      delete process.env.HEALTH_TEST_KEY;
    });

    it('returns the default when the env var is unset', () => {
      expect(healthThreshold('HEALTH_TEST_KEY', 0.95)).toBe(0.95);
    });

    it('returns the env override when it is a valid number', () => {
      process.env.HEALTH_TEST_KEY = '0.8';
      expect(healthThreshold('HEALTH_TEST_KEY', 0.95)).toBe(0.8);
    });

    it('falls back to the default on a non-numeric or non-positive value', () => {
      process.env.HEALTH_TEST_KEY = 'not-a-number';
      expect(healthThreshold('HEALTH_TEST_KEY', 0.95)).toBe(0.95);
      process.env.HEALTH_TEST_KEY = '0';
      expect(healthThreshold('HEALTH_TEST_KEY', 0.95)).toBe(0.95);
    });
  });
});
