import { ApiProperty } from '@nestjs/swagger';

export class UpdateScheduleDto {
  @ApiProperty({
    description: 'Schedule number identifier',
    example: 1,
    type: Number,
    minimum: 1,
    maximum: 2,
  })
  scheduleNumber: number;

  @ApiProperty({
    description: 'Time in 24-hour format (HH:mm)',
    example: '14:30',
    pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$',
  })
  time: string;
}
