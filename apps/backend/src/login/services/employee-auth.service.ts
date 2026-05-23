import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { Employee } from '../../employee/entities/employee.entity';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class EmployeeAuthService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    private jwtService: JwtService,
  ) {}

  async validateEmployee(username: string, password: string) {
    const employee = await this.employeeRepository.findOne({
      where: { username },
    });

    if (!employee) {
      throw new UnauthorizedException('Invalid username');
    }

    const isPasswordValid = await bcrypt.compare(password, employee.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid password');
    }

    return employee;
  }

  async login(employee: Employee) {
    const payload = {
      username: employee.username,
      sub: employee.id,
      role: 'employee',
    };
    employee.password = undefined;
    return {
      message: 'Employee authentication successful',
      access_token: 'Bearer ' + this.jwtService.sign(payload),
      user: {
        ...employee,
        role: 'employee',
      },
    };
  }

  async getEmployeeInfo(employee_id: string): Promise<Employee> {
    const employee = await this.employeeRepository.findOne({
      where: { id: employee_id },
      select: {
        id: true,
        username: true,
        employee_id: true,
        first_name: true,
        last_name: true,
        is_active: true,
        date_created: true,
        date_activated: true,
        date_deactivated: true,
        device_id: true,
        email: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return employee;
  }
}
