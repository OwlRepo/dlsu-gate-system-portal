import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class CacheService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async clearCache(pattern: string): Promise<void> {
    const store = (this.cacheManager as any).store;

    if (store && typeof store.keys === 'function') {
      const keys = await store.keys(pattern);
      const promises = keys.map((key) => this.cacheManager.del(key));
      await Promise.all(promises);
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    return await this.cacheManager.get<T>(key);
  }

  async set(key: string, value: any, ttl: number = 3600000): Promise<void> {
    await this.cacheManager.set(key, value, ttl);
  }

  async del(key: string): Promise<void> {
    await this.cacheManager.del(key);
  }
}
