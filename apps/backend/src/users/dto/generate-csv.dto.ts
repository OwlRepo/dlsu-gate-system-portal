import { IsArray, IsDateString, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateCsvDto {
  @ApiProperty({
    description: 'Array of user types',
    enum: ['admin', 'employee', 'super-admin'],
    isArray: true,
  })
  @IsArray()
  @IsEnum(['admin', 'employee', 'super-admin'], { each: true })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.split(',') : value,
  )
  types: string[];

  @ApiProperty({
    description: 'Start date (YYYY-MM-DD)',
  })
  @IsDateString()
  startDate: string;

  @ApiProperty({
    description: 'End date (YYYY-MM-DD)',
  })
  @IsDateString()
  endDate: string;
}
