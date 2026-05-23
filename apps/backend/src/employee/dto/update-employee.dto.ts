import { PartialType } from '@nestjs/mapped-types';
import { CreateEmployeeDto } from './create-employee.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsBoolean,
  IsArray,
  MinLength,
} from 'class-validator';

export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {
  @ApiPropertyOptional({
    description:
      'First name of the employee. Will default to "Unknown" if not provided',
    example: 'John',
    minLength: 2,
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  first_name?: string;

  @ApiPropertyOptional({
    description:
      'Last name of the employee. Will default to "Employee" if not provided',
    example: 'Doe',
    minLength: 2,
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  last_name?: string;

  @ApiPropertyOptional({
    description: 'Email address of the employee. Must be unique',
    example: 'john.doe@example.com',
  })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({
    description:
      'Password for the employee account. Will be hashed before storage',
    example: 'strongPassword123',
    minLength: 6,
  })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @ApiPropertyOptional({
    description: 'Active status of the employee',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({
    description: 'Array of device IDs associated with the employee',
    example: ['DEVICE123', 'DEVICE456'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  device_id?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  date_deactivated?: Date;
}
