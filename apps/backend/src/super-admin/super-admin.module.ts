import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { SuperAdmin } from './entities/super-admin.entity';
import { Admin } from '../admin/entities/admin.entity';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { join } from 'path';

@Module({
  imports: [
    TypeOrmModule.forFeature([SuperAdmin, Admin]),
    // JWT config comes from the global AuthModule (single signing secret).
    ConfigModule.forRoot({ envFilePath: join(__dirname, '../../../.env') }),
    AuthModule,
  ],
  controllers: [SuperAdminController],
  providers: [SuperAdminService],
  exports: [SuperAdminService],
})
export class SuperAdminModule {}
