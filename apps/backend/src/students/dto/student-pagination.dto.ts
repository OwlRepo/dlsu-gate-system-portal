import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { BasePaginationDto } from '../../common/dto/base-pagination.dto';

export class StudentPaginationDto extends BasePaginationDto {
  @ApiPropertyOptional()
  @IsBoolean()
  @Type(() => Boolean)
  @IsOptional()
  isArchived?: boolean;
}
