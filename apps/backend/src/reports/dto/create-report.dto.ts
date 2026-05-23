import {
  IsNotEmpty,
  IsString,
  IsDateString,
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReportDto {
  @ApiProperty({ example: '2024-03-15T10:00:00Z' })
  @IsNotEmpty()
  @IsDateString()
  datetime: string;

  @ApiProperty({ example: '1' })
  @ApiProperty({ example: '2' })
  @IsNotEmpty()
  @IsString()
  type: string;

  @ApiProperty({ example: 'user123' })
  @IsNotEmpty()
  @IsString()
  user_id: string;

  @ApiProperty({ example: 'John Doe' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ example: 'Additional notes' })
  @IsNotEmpty()
  @IsString()
  remarks: string;

  @ApiProperty({ example: 'RED;cannot enter with or without remarks' })
  @IsNotEmpty()
  @IsString()
  status: string;

  @ApiProperty({
    example: 'Mobile App',
    description: 'Device used for reporting',
    required: false,
  })
  @IsOptional()
  @IsString()
  device?: string;
}
