import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Student } from '../students/entities/student.entity';
import { Employee } from '../employee/entities/employee.entity';

@Injectable()
export class SyncService {
  constructor(
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
  ) {}

  async getAllStudents(): Promise<{
    students: Student[];
  }> {
    try {
      const students = await this.studentRepository.find({
        where: { isArchived: false },
      });

      return { students };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async getAllEmployees(): Promise<{
    employees: Omit<Employee, 'password'>[];
  }> {
    try {
      const employees = await this.employeeRepository.find({
        where: { is_active: true },
        select: [
          'id',
          'employee_id',
          'username',
          'first_name',
          'last_name',
          'email',
          'is_active',
          'date_created',
          'date_activated',
          'date_deactivated',
          'device_id',
        ],
      });
      return { employees };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
}
