import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { CacheTTL, NoCache } from '../decorators/cache-control.decorator';
import { CacheService } from '../services/cache.service';

@Controller('example')
export class ExampleController {
  constructor(private readonly cacheService: CacheService) {}

  @Get()
  @CacheTTL(3600000) // Cache for 1 hour
  async findAll() {
    // This endpoint will be cached
    return ['data'];
  }

  @Get(':id')
  @CacheTTL(1800000) // Cache for 30 minutes
  async findOne(@Param('id') id: string) {
    // This endpoint will be cached
    return { id };
  }

  @Post()
  @NoCache() // Explicitly mark as no-cache
  async create(@Body() data: any) {
    // After creating, clear related caches
    await this.cacheService.clearCache('example:*');
    return data;
  }
}
