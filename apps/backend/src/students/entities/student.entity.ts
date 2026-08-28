import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('students')
export class Student {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  ID_Number: string;

  @Column({ nullable: true })
  Name: string;

  @Column({ nullable: true })
  Lived_Name: string;

  @Column({ nullable: true })
  Remarks: string;

  @Column({ nullable: true })
  Photo: string;

  @Column({ nullable: true })
  Campus_Entry: string;

  @Column({ type: 'bigint', nullable: true })
  Unique_ID: string;

  @Column({ type: 'boolean', default: false })
  isArchived: boolean;

  @Column({ name: 'group', nullable: true })
  group: string;

  /**
   * When this person was last activated (admitted to campus and not archived).
   *
   * Written once on an inactive -> active transition and then left alone, which
   * is what stops the BioStar expiry window from drifting forward on every sync.
   * Null means "never yet seen active" — deliberately distinguishable from a
   * real date, which is why the migration adds these columns with no default.
   *
   * Only the Dasma sync path maintains these three columns; the main path
   * neither reads nor writes them.
   */
  @Column({ name: 'date_activated', type: 'timestamp', nullable: true })
  date_activated: Date | null;

  /** When this person last went active -> inactive. Kept for audit. */
  @Column({ name: 'date_deactivated', type: 'timestamp', nullable: true })
  date_deactivated: Date | null;

  /**
   * Authoritative credential expiry: `date_activated` + 10 years, computed once
   * at activation. Stored rather than derived so that a future change to the
   * retention period cannot silently move the expiry of everyone already
   * enrolled.
   */
  @Column({ name: 'expiry_datetime', type: 'timestamp', nullable: true })
  expiry_datetime: Date | null;

  /**
   * This person's remark was removed in the source view but BioStar has not
   * confirmed the clear yet.
   *
   * Clearing a remark needs a per-user PUT (BioStar's CSV import ignores a
   * blank cell). Without this flag a failed PUT could never be retried — the
   * retry trigger is the old `Remarks` value, and PostgreSQL clears it in the
   * same run — leaving PostgreSQL and the gate screen permanently disagreeing.
   */
  @Column({
    name: 'remarks_clear_pending',
    type: 'boolean',
    default: false,
  })
  remarks_clear_pending: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Add other relevant fields based on your SQL Server schema
}
