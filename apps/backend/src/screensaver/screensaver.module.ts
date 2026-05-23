import { Module } from '@nestjs/common';
import { ScreensaverController } from './screensaver.controller';
import { ScreensaverService } from './screensaver.service';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET,
        signOptions: { expiresIn: '2d' },
      }),
    }),
  ],
  controllers: [ScreensaverController],
  providers: [ScreensaverService],
  exports: [ScreensaverService],
})
export class ScreensaverModule {}
