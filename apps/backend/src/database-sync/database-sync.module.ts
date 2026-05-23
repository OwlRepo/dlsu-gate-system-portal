import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseSyncController } from './database-sync.controller';
import { DatabaseSyncService } from './database-sync.service';
import { SyncSchedule } from './entities/sync-schedule.entity';
import { Student } from '../students/entities/student.entity';
import { DatabaseSyncQueueService } from './database-sync-queue.service';
import { SyncQueue } from './entities/sync-queue.entity';
import { BiostarSyncState } from './entities/biostar-sync-state.entity';
import { DatabaseSyncCommonService } from './services/shared/database-sync-common.service';
import { BiostarApiService } from './services/shared/biostar-api.service';
import { DatabaseSyncMainPathService } from './services/database-sync-main-path.service';
import { DatabaseSyncDasmaPathService } from './services/database-sync-dasma-path.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SyncSchedule,
      Student,
      SyncQueue,
      BiostarSyncState,
    ]),
    ScheduleModule.forRoot(),
  ],
  controllers: [DatabaseSyncController],
  providers: [
    DatabaseSyncService,
    DatabaseSyncQueueService,
    DatabaseSyncCommonService,
    BiostarApiService,
    DatabaseSyncMainPathService,
    DatabaseSyncDasmaPathService,
  ],
  exports: [DatabaseSyncService, DatabaseSyncQueueService],
})
export class DatabaseSyncModule {}
