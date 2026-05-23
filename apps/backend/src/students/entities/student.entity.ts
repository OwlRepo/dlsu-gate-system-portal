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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Add other relevant fields based on your SQL Server schema
}
