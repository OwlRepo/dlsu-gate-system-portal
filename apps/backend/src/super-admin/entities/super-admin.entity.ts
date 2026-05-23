import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('super-admin')
export class SuperAdmin {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  super_admin_id: string;

  @Column({ unique: true })
  username: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({ nullable: true, default: 'Unknown' })
  first_name: string;

  @Column({ nullable: true, default: 'User' })
  last_name: string;

  @Column()
  role: string;

  @Column()
  created_at: Date;

  @Column()
  updated_at: Date;

  @Column({ default: true })
  is_active: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  date_activated: Date;

  @Column({ type: 'timestamp', nullable: true })
  date_deactivated: Date;
}
