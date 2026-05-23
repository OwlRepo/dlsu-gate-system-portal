import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('reports')
export class Report {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'timestamp' })
  datetime: Date;

  @Column()
  type: string;

  @Column()
  user_id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  remarks: string;

  @Column()
  status: string;

  @Column({ type: 'text', nullable: true })
  device: string;

  @CreateDateColumn()
  created_at: Date;
}
