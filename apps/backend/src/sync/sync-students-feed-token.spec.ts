import { decodeFeedToken, encodeFeedToken } from './sync-students-feed-token';

const tokenOf = (raw: string) => Buffer.from(raw, 'utf8').toString('base64url');

describe('sync students feed token', () => {
  it('error: decodes anything that is not a feed token to null', () => {
    const bad = [
      '',
      'not-a-token',
      tokenOf('x|2026-01-01 00:00:00|1'),
      tokenOf('d|2026-13-45 00:00:00|1'),
      tokenOf('d|2026-01-01 24:00:00|1'),
      tokenOf('d|2026-01-01 00:00:00|-1'),
      tokenOf('d|2026-01-01 00:00:00|2147483648'),
      tokenOf('d|2026-01-01 00:00:00.1234567|1'),
      tokenOf('d|2026-01-01|1'),
    ];

    for (const token of bad) {
      expect(decodeFeedToken(token)).toBeNull();
    }
  });

  it('edge: round-trips a key with microseconds and a key without a fraction', () => {
    const withFraction = {
      mode: 'd' as const,
      key: '2026-01-01 00:00:00.123456',
      id: 42,
    };
    const without = { mode: 'i' as const, key: '1970-01-01 00:00:00', id: 1 };

    expect(decodeFeedToken(encodeFeedToken(withFraction))).toEqual(
      withFraction,
    );
    expect(decodeFeedToken(encodeFeedToken(without))).toEqual(without);
  });

  it('regression: a token is URL-safe, so it needs no escaping in a query string', () => {
    const token = encodeFeedToken({
      mode: 'd',
      key: '2026-01-01 00:00:00.5',
      id: 2147483647,
    });

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('happy: decode(encode(position)) returns the same position', () => {
    const position = {
      mode: 'i' as const,
      key: '2026-10-14 08:30:15.25',
      id: 7,
    };

    expect(decodeFeedToken(encodeFeedToken(position))).toEqual(position);
  });
});
