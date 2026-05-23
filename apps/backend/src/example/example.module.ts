import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ExampleController } from './example.controller';
import { ExampleService } from './example.service';
import { redisConfig } from '../config/redis.config';

@Module({
  imports: [CacheModule.register(redisConfig)],
  controllers: [ExampleController],
  providers: [ExampleService],
})
export class ExampleModule {}
