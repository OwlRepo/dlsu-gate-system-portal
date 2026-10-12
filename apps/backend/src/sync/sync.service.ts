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
    students: Omit<Student, 'Photo'>[];
  }> {
    try {
      // Photo is a base64 blob and dominates the payload; mobile reads it per
      // student from GET /students/:idNumber. Selecting the other columns,
      // rather than stripping after load, keeps the blob out of the PostgreSQL
      // result set. Derived from entity metadata so a column added later
      // reaches mobile without editing this list.
      const columns = this.studentRepository.metadata.columns
        .map((column) => column.propertyName)
        .filter((name): name is keyof Student => name !== 'Photo');
      const students = await this.studentRepository.find({
        select: columns,
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
