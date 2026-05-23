import { SetMetadata } from '@nestjs/common';

export const CACHE_TTL_KEY = 'cache_ttl';
export const NO_CACHE_KEY = 'no_cache';

export const CacheTTL = (ttl: number) => SetMetadata(CACHE_TTL_KEY, ttl);
export const NoCache = () => SetMetadata(NO_CACHE_KEY, true);
