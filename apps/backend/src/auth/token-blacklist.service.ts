import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TokenBlacklist } from './entities/token-blacklist.entity';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TokenBlacklistService implements OnModuleInit {
  private readonly redis: Redis;
  private readonly logger = new Logger(TokenBlacklistService.name);
  private useInMemoryFallback = false;
  private inMemoryTokens: Map<string, string> = new Map();

  constructor(
    @InjectRepository(TokenBlacklist)
    private tokenBlacklistRepository: Repository<TokenBlacklist>,
    private configService: ConfigService,
  ) {
    const redisConfig = {
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      retryStrategy: (times: number) => {
        if (times > 3) {
          this.useInMemoryFallback = true;
          this.logger.warn(
            'Redis connection failed, falling back to in-memory storage',
          );
          return null; // Stop retrying
        }
        return Math.min(times * 100, 3000); // Retry with exponential backoff
      },
      maxRetriesPerRequest: 3,
    };

    this.redis = new Redis(redisConfig);

    this.redis.on('error', (error) => {
      if (!this.useInMemoryFallback) {
        this.logger.warn(`Redis connection error: ${error.message}`);
        this.useInMemoryFallback = true;
      }
    });

    this.redis.on('connect', () => {
      this.logger.log('Successfully connected to Redis');
      this.useInMemoryFallback = false;
    });
  }

  async onModuleInit() {
    try {
      await this.redis.ping();
      this.logger.log('Redis connection verified');
    } catch (error) {
      console.log(error);
      this.logger.warn('Redis not available, using in-memory storage');
      this.useInMemoryFallback = true;
    }
  }

  async blacklistToken(token: string) {
    const blacklistedToken = this.tokenBlacklistRepository.create({
      token,
      blacklistedAt: new Date(),
    });
    await this.tokenBlacklistRepository.save(blacklistedToken);

    if (this.useInMemoryFallback) {
      // Remove from in-memory storage
      for (const [key, value] of this.inMemoryTokens.entries()) {
        if (value === token) {
          this.inMemoryTokens.delete(key);
        }
      }
    } else {
      try {
        // Remove from Redis if it exists
        const pattern = 'user_token:*';
        const keys = await this.redis.keys(pattern);
        for (const key of keys) {
          const value = await this.redis.get(key);
          if (value === token) {
            await this.redis.del(key);
          }
        }
      } catch (error) {
        this.logger.error('Error removing token from Redis:', error);
        this.useInMemoryFallback = true;
      }
    }
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    const blacklistedToken = await this.tokenBlacklistRepository.findOne({
      where: { token },
    });
    return !!blacklistedToken;
  }

  async trackUserToken(userId: number, role: string, token: string) {
    const key = `user_token:${userId}_${role}`;

    if (this.useInMemoryFallback) {
      const previousToken = this.inMemoryTokens.get(key);
      if (previousToken) {
        await this.blacklistToken(previousToken);
      }
      this.inMemoryTokens.set(key, token);
    } else {
      try {
        const previousToken = await this.redis.get(key);
        if (previousToken) {
          await this.blacklistToken(previousToken);
        }
        await this.redis.set(key, token, 'EX', 172800); // 2 days in seconds
      } catch (error) {
        this.logger.error('Error tracking token in Redis:', error);
        this.useInMemoryFallback = true;
        await this.trackUserToken(userId, role, token); // Retry with in-memory storage
      }
    }
  }

  async getActiveTokensByUser(userId: number, role: string): Promise<string[]> {
    const key = `user_token:${userId}_${role}`;

    if (this.useInMemoryFallback) {
      const token = this.inMemoryTokens.get(key);
      return token ? [token] : [];
    }

    try {
      const token = await this.redis.get(key);
      return token ? [token] : [];
    } catch (error) {
      this.logger.error('Error getting active tokens from Redis:', error);
      this.useInMemoryFallback = true;
      return this.getActiveTokensByUser(userId, role); // Retry with in-memory storage
    }
  }
}
