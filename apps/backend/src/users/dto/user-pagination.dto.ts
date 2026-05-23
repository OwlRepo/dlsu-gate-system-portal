import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsDateString } from 'class-validator';
import { BasePaginationDto } from '../../common/dto/base-pagination.dto';

export class UserPaginationDto extends BasePaginationDto {
  @ApiPropertyOptional({
    enum: ['admin', 'employee', 'super-admin'],
    description: 'Filter by user type',
  })
  @IsEnum(['admin', 'employee', 'super-admin'])
  @IsOptional()
  type?: 'admin' | 'employee' | 'super-admin';

  @ApiPropertyOptional({
    description: 'Filter users created from this date (YYYY-MM-DD)',
  })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Filter users created until this date (YYYY-MM-DD)',
  })
  @IsDateString()
  @IsOptional()
  endDate?: string;
}
