import { assertRequiredEnv } from './env';

describe('assertRequiredEnv', () => {
  it('throws when JWT_SECRET is missing', () => {
    expect(() => assertRequiredEnv({} as NodeJS.ProcessEnv)).toThrow(
      /JWT_SECRET/,
    );
  });

  it('throws when JWT_SECRET is empty', () => {
    expect(() =>
      assertRequiredEnv({ JWT_SECRET: '' } as NodeJS.ProcessEnv),
    ).toThrow(/JWT_SECRET/);
  });

  it('passes when JWT_SECRET is set', () => {
    expect(() =>
      assertRequiredEnv({
        JWT_SECRET: 'synthetic-secret',
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });
});
