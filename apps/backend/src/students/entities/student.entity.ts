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
   * Clearing a remark needs a per-user PUT (BioStar's CSV import appears to
   * ignore a blank cell — reported by DLSU, not verified here). Without this
   * flag a failed PUT could never be retried: the retry trigger is the old
   * `Remarks` value, and PostgreSQL clears it in the same run, leaving
   * PostgreSQL and the gate screen permanently disagreeing.
   */
  @Column({
    name: 'remarks_clear_pending',
    type: 'boolean',
    default: false,
  })
  remarks_clear_pending: boolean;

  /**
   * sha256 of the CSV row last successfully accepted by BioStar for this
   * student.
   *
   * The Dasma export compares each freshly rendered row against this and ships
   * only the ones that differ. Before it existed the CSV carried the whole
   * non-archived roster every run, and because the import uses
   * `import_option: 2` (Overwrite) BioStar marked every user modified and
   * re-transferred them to every device.
   *
   * Written only after BioStar confirms the import, so a failed or partial
   * upload leaves the old hash in place and the row is retried next run.
   * NULL means "never successfully exported" — which is why the first run
   * after deploy legitimately exports everyone.
   */
  @Column({
    name: 'biostar_row_hash',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  biostar_row_hash: string | null;

  /**
   * When this student's remark was last reconciled against BioStar.
   *
   * A remark deleted before the clearing fix shipped leaves no trace to act
   * on: PostgreSQL is already blank, so the removal cannot be observed again
   * and nothing would ever revisit the row. A bounded sweep uses this column
   * to work through the roster a batch at a time, oldest first, then keeps
   * itself current. NULL means never checked, so those rows are swept first.
   */
  @Column({
    name: 'remarks_checked_at',
    type: 'timestamp',
    nullable: true,
  })
  remarks_checked_at: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Add other relevant fields based on your SQL Server schema
}
