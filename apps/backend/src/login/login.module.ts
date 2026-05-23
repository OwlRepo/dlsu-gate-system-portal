import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { LoginService } from './login.service';
import { LoginController } from './login.controller';
import { Admin } from '../admin/entities/admin.entity';
import { Employee } from '../employee/entities/employee.entity';
import { SuperAdminModule } from '../super-admin/super-admin.module';
import { SuperAdminAuthService } from './services/super-admin-auth.service';
import { EmployeeAuthService } from './services/employee-auth.service';
import { AuthModule } from '../auth/auth.module';
import { ScreensaverModule } from '../screensaver/screensaver.module';
import { SuperAdmin } from '../super-admin/entities/super-admin.entity';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forFeature([Admin, SuperAdmin, Employee]),
    JwtModule.register({
      secret:
        process.env.JWT_SECRET ||
        'e34e5367877d04f91c919816b894a331c2a91908eacb36167e5d40f866cb4e1e3f5877a18975698d26ce49ee990e7d26f0c0f840c51e2d4dde56cdbf5e09affb',
      signOptions: { expiresIn: '2d' },
    }),
    ConfigModule.forRoot(),
    SuperAdminModule,
    AuthModule,
    ScreensaverModule,
  ],
  controllers: [LoginController],
  providers: [LoginService, SuperAdminAuthService, EmployeeAuthService],
  exports: [LoginService],
})
export class LoginModule {}
