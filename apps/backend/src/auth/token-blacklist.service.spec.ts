import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TokenBlacklistService } from './token-blacklist.service';
import { TokenBlacklist } from './entities/token-blacklist.entity';

describe('TokenBlacklistService', () => {
  let service: TokenBlacklistService;
  let repository: jest.Mocked<Repository<TokenBlacklist>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenBlacklistService,
        {
          provide: getRepositoryToken(TokenBlacklist),
          useValue: {
            create: jest.fn((value) => value),
            save: jest.fn().mockResolvedValue(undefined),
            findOne: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<TokenBlacklistService>(TokenBlacklistService);
    repository = module.get(getRepositoryToken(TokenBlacklist));

    // The deployment has no Redis, so exercise the in-memory path by default.
    (
      service as unknown as { useInMemoryFallback: boolean }
    ).useInMemoryFallback = true;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('trackUserToken', () => {
    it('never blacklists the token it is being asked to track', async () => {
      await service.trackUserToken(1, 'super-admin', 'token-a');
      repository.save.mockClear();

      // Concurrent first requests after login can both reach this path with the
      // same token. Blacklisting here revoked the live session permanently.
      await service.trackUserToken(1, 'super-admin', 'token-a');

      expect(repository.save).not.toHaveBeenCalled();
      await expect(
        service.getActiveTokensByUser(1, 'super-admin'),
      ).resolves.toEqual(['token-a']);
    });

    it('blacklists the previous token when a different one replaces it', async () => {
      await service.trackUserToken(1, 'super-admin', 'token-a');
      repository.save.mockClear();

      await service.trackUserToken(1, 'super-admin', 'token-b');

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'token-a' }),
      );
      await expect(
        service.getActiveTokensByUser(1, 'super-admin'),
      ).resolves.toEqual(['token-b']);
    });

    it('keeps separate buckets per user', async () => {
      await service.trackUserToken(1, 'super-admin', 'token-a');
      await service.trackUserToken(2, 'super-admin', 'token-b');

      await expect(
        service.getActiveTokensByUser(1, 'super-admin'),
      ).resolves.toEqual(['token-a']);
      await expect(
        service.getActiveTokensByUser(2, 'super-admin'),
      ).resolves.toEqual(['token-b']);
    });
  });

  describe('trackUserToken via Redis', () => {
    let redis: { get: jest.Mock; set: jest.Mock };

    beforeEach(() => {
      redis = { get: jest.fn(), set: jest.fn().mockResolvedValue('OK') };
      const internals = service as unknown as {
        useInMemoryFallback: boolean;
        redis: typeof redis;
      };
      internals.useInMemoryFallback = false;
      internals.redis = redis;
    });

    it('never blacklists the token it is being asked to track', async () => {
      redis.get.mockResolvedValue('token-a');

      await service.trackUserToken(1, 'super-admin', 'token-a');

      expect(repository.save).not.toHaveBeenCalled();
      expect(redis.set).toHaveBeenCalled();
    });

    it('blacklists the previous token when a different one replaces it', async () => {
      redis.get.mockResolvedValue('token-a');

      await service.trackUserToken(1, 'super-admin', 'token-b');

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'token-a' }),
      );
    });
  });
});
