import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { In } from 'typeorm';
import { SyncQueue } from './entities/sync-queue.entity';
import { SyncSchedule } from './entities/sync-schedule.entity';
import { CronJob } from 'cron';

@Injectable()
export class DatabaseSyncQueueService {
  private readonly schemaEnv: string;

  constructor(
    @InjectRepository(SyncQueue)
    private syncQueueRepository: Repository<SyncQueue>,
    @InjectRepository(SyncSchedule)
    private syncScheduleRepository: Repository<SyncSchedule>,
    private configService: ConfigService,
  ) {
    const rawEnv = this.configService.get('SOURCE_DB_SCHEMA_ENV') ?? 'main';
    const envValue = String(rawEnv).trim().toLowerCase();
    this.schemaEnv = envValue === 'dasma' ? 'dasma' : 'main';
  }

  async addToQueue() {
    // Check if there's already a job running
    const runningJob = await this.syncQueueRepository.findOne({
      where: { status: 'processing' },
    });

    if (runningJob) {
      throw new BadRequestException(
        'A sync job is already running. Please wait for it to complete before starting a new one.',
      );
    }

    // Check if there are any pending jobs
    const pendingJob = await this.syncQueueRepository.findOne({
      where: { status: 'pending' },
    });

    if (pendingJob) {
      throw new BadRequestException(
        'There is already a pending sync job in the queue. Please wait for it to complete before starting a new one.',
      );
    }

    // Check for upcoming scheduled syncs
    // Dasma: only shared schedules (1/2); non-dasma: all schedules (1,2,3,4)
    const scheduleNumbers = this.schemaEnv === 'dasma' ? [1, 2] : [1, 2, 3, 4];
    const schedules = await this.syncScheduleRepository.find({
      where: { scheduleNumber: In(scheduleNumbers) },
    });
    const now = new Date();

    for (const schedule of schedules) {
      const cronJob = new CronJob(
        schedule.cronExpression,
        () => {},
        null,
        false,
        'Asia/Manila',
      );
      const nextRun = cronJob.nextDate().toJSDate();

      // If there's a scheduled sync within the next 30 minutes, prevent manual sync
      if (nextRun.getTime() - now.getTime() <= 30 * 60 * 1000) {
        throw new BadRequestException(
          `Cannot start manual sync: A scheduled sync is due to run at ${nextRun.toLocaleTimeString()}. Please wait for the scheduled sync to complete.`,
        );
      }
    }

    const queueId = await this.createQueueEntry();
    return {
      queueId,
      position: 1, // Since we only allow one job at a time, position is always 1
    };
  }

  async removeFromQueue(queueId: string) {
    const queueItem = await this.findQueueItem(queueId);
    if (!queueItem) {
      throw new NotFoundException('Queue item not found');
    }

    if (queueItem.status === 'processing') {
      throw new BadRequestException(
        'Cannot delete - sync is already in progress',
      );
    }

    await this.deleteQueueItem(queueId);
    return { message: 'Sync job successfully removed from queue' };
  }

  async updateQueueStatus(
    id: string,
    status: 'pending' | 'processing' | 'completed' | 'failed',
  ) {
    const queueItem = await this.syncQueueRepository.findOne({
      where: { id },
    });

    if (!queueItem) {
      throw new NotFoundException('Queue item not found');
    }

    queueItem.status = status;
    queueItem.completedAt =
      status === 'completed' || status === 'failed' ? new Date() : null;

    await this.syncQueueRepository.save(queueItem);
  }

  async findNextPendingJob(): Promise<SyncQueue | null> {
    return this.syncQueueRepository.findOne({
      where: { status: 'pending' },
      order: { createdAt: 'ASC' },
    });
  }

  private async getCurrentQueueSize(): Promise<number> {
    return this.syncQueueRepository.count({
      where: [{ status: 'pending' }, { status: 'processing' }],
    });
  }

  private async createQueueEntry(): Promise<string> {
    const queueItem = this.syncQueueRepository.create({
      status: 'pending',
    });
    const saved = await this.syncQueueRepository.save(queueItem);
    return saved.id.toString();
  }

  private async findQueueItem(queueId: string): Promise<SyncQueue | null> {
    return this.syncQueueRepository.findOne({
      where: { id: queueId },
    });
  }

  private async deleteQueueItem(queueId: string): Promise<void> {
    await this.syncQueueRepository.delete(queueId);
  }
}
