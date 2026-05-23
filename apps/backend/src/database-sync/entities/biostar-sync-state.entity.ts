import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('biostar_sync_state')
export class BiostarSyncState {
  @PrimaryGeneratedColumn()
  id: number;

  /** Schema key for scoping (e.g. 'dasma'). One row per schema. */
  @Column({ unique: true, default: 'dasma' })
  schemaKey: string;

  /** Last `last_modified` value from Biostar for incremental pagination. */
  @Column({ type: 'varchar', nullable: true })
  lastModifiedCursor: string | null;

  /** Last processed list offset for resume. */
  @Column({ type: 'int', nullable: true })
  lastProcessedOffset: number | null;

  /** Last processed user_id for resume. */
  @Column({ type: 'varchar', nullable: true })
  lastProcessedUserId: string | null;

  @Column({ type: 'timestamp', nullable: true })
  lastRunAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastSuccessAt: Date | null;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
