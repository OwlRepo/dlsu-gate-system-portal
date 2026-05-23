import { ApiProperty } from '@nestjs/swagger';

export class ScheduledSyncDto {
  @ApiProperty({
    description: 'Schedule identifier',
    example: 1,
  })
  scheduleNumber: number;

  @ApiProperty({
    description: 'Scheduled time in 24-hour format',
    example: '14:30',
  })
  time: string;

  @ApiProperty({
    description: 'Whether this schedule is currently running',
    example: false,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Last successful sync time',
    example: '2024-03-20T14:30:00Z',
    nullable: true,
  })
  lastSyncTime: Date | null;

  @ApiProperty({
    description: 'Next scheduled run time',
    example: '2024-03-20T14:30:00Z',
    nullable: true,
  })
  nextRun: Date | null;
}
