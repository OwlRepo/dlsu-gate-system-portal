import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TokenBlacklistService } from './token-blacklist.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TokenBlacklist } from './entities/token-blacklist.entity';

@Global()
@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: '2d', // Set a longer expiration as safety net
        },
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([TokenBlacklist]),
  ],
  providers: [TokenBlacklistService, JwtAuthGuard, JwtStrategy],
  exports: [TokenBlacklistService, JwtModule, PassportModule, JwtAuthGuard],
})
export class AuthModule {}
