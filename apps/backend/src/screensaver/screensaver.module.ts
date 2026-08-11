import { Module } from '@nestjs/common';
import { ScreensaverController } from './screensaver.controller';
import { ScreensaverService } from './screensaver.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  // JWT config comes from the global AuthModule (single signing secret).
  imports: [ConfigModule],
  controllers: [ScreensaverController],
  providers: [ScreensaverService],
  exports: [ScreensaverService],
})
export class ScreensaverModule {}
