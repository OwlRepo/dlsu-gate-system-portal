import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
import { join } from 'path';

@Module({
  imports: [
    TypeOrmModule.forFeature([Admin, SuperAdmin, Employee]),
    // JWT config comes from the global AuthModule (single source of truth for
    // the signing secret). A local JwtModule.register here once signed tokens
    // with a fallback secret because process.env was read at import time.
    ConfigModule.forRoot({ envFilePath: join(__dirname, '../../../.env') }),
    SuperAdminModule,
    AuthModule,
    ScreensaverModule,
  ],
  controllers: [LoginController],
  providers: [LoginService, SuperAdminAuthService, EmployeeAuthService],
  exports: [LoginService],
})
export class LoginModule {}
