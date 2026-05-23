import { BasePaginationDto } from '../../common/dto/base-pagination.dto';
import { IsOptional, IsEnum, IsDateString, MinLength } from 'class-validator';

export class EnhancedReportQueryDto extends BasePaginationDto {
  @IsOptional()
  @IsEnum(['1', '2'], { message: 'Type must be either "1" or "2"' })
  type?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @MinLength(3, { message: 'Search term must be at least 3 characters long' })
  searchTerm?: string;
}
