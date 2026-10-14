import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export const SYNC_STUDENTS_DEFAULT_LIMIT = 2000;
export const SYNC_STUDENTS_MAX_LIMIT = 5000;

// Tokens are base64url of a short fixed-shape string; the service decodes and
// checks the shape, this only keeps junk and oversized input out of the query.
const TOKEN = /^[A-Za-z0-9_-]{1,200}$/;

export class SyncStudentsQueryDto {
  @ApiPropertyOptional({
    description: `Page size, 1-${SYNC_STUDENTS_MAX_LIMIT}. Default ${SYNC_STUDENTS_DEFAULT_LIMIT} once any paging parameter is sent.`,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SYNC_STUDENTS_MAX_LIMIT)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({
    description: 'nextCursor from the previous page of the same pull.',
  })
  @IsString()
  @Matches(TOKEN)
  @IsOptional()
  cursor?: string;

  @ApiPropertyOptional({
    description:
      'syncToken from the last page of the previous completed sync. Returns what changed since, archived students included.',
  })
  @IsString()
  @Matches(TOKEN)
  @IsOptional()
  since?: string;
}
