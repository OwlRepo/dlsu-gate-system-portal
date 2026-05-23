import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class ExampleService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async setCacheData(key: string, value: any): Promise<void> {
    await this.cacheManager.set(key, value, 3600000); // 1 hour in milliseconds
  }

  async getCacheData(key: string): Promise<any> {
    return await this.cacheManager.get(key);
  }
}
