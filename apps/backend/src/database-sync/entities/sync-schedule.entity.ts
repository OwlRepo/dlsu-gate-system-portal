import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class SyncSchedule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  scheduleNumber: number; // 1 or 2

  @Column()
  time: string; // Format: HH:mm

  @Column()
  cronExpression: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastSyncTime: Date;
}
