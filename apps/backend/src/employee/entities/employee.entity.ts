import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Employee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  username: string;

  @Column()
  password: string;

  @Column()
  employee_id: string;

  @Column()
  first_name: string;

  @Column()
  last_name: string;

  @Column()
  is_active: boolean;

  @Column()
  date_created: string;

  @Column()
  date_activated: string;

  @Column({ nullable: true })
  date_deactivated: string;

  @Column('json', { default: [] })
  device_id: string[];

  @Column({ unique: true })
  email: string;
}
