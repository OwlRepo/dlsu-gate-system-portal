import { Controller, Get, Param } from '@nestjs/common';
import { ExampleService } from './example.service';

@Controller('example')
export class ExampleController {
  constructor(private readonly exampleService: ExampleService) {}

  @Get(':id')
  async getData(@Param('id') id: string) {
    // Try to get data from cache first
    let data = await this.exampleService.getCacheData(`data:${id}`);

    if (!data) {
      // If not in cache, get from database
      // Replace this with your actual database query
      data = { id, example: 'data' };
      // Store in cache for future requests
      await this.exampleService.setCacheData(`data:${id}`, data);
    }

    return data;
  }
}
