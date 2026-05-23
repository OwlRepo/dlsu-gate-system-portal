import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('admin')
export class Admin {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column()
  role: string;

  @Column()
  admin_id: string;

  @Column({ nullable: true, default: 'Unknown' })
  first_name: string;

  @Column({ nullable: true, default: 'Admin' })
  last_name: string;

  @Column({ default: true })
  is_active: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  date_activated: Date;

  @Column({ type: 'timestamp', nullable: true })
  date_deactivated: Date;
}
