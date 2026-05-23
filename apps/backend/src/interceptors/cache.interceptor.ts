import { Injectable, ExecutionContext } from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { NO_CACHE_KEY } from '../decorators/cache-control.decorator';

@Injectable()
export class HttpCacheInterceptor extends CacheInterceptor {
  constructor(cacheManager: any, reflector: Reflector) {
    super(cacheManager, reflector);
  }

  trackBy(context: ExecutionContext): string | undefined {
    const request = context.switchToHttp().getRequest<Request>();

    // Check if endpoint is marked as no-cache
    const noCache = this.reflector.get(NO_CACHE_KEY, context.getHandler());
    if (noCache) {
      return undefined;
    }

    // Don't cache non-GET requests
    if (request.method !== 'GET') {
      return undefined;
    }

    // Create cache key from URL and query parameters
    return `${request.url}:${JSON.stringify(request.query)}`;
  }
}
