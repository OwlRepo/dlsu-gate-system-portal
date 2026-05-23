import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { Role } from '../../auth/enums/role.enum';

export class BulkReactivateDto {
  @ApiProperty({
    description: 'Array of user IDs to reactivate',
    example: ['EMP-123', 'ADM-456', 'SAD-789'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  userIds: string[];

  @ApiProperty({
    description: 'Type of users to reactivate',
    enum: Role,
    example: Role.EMPLOYEE,
  })
  @IsEnum(Role)
  @IsNotEmpty()
  userType: Role;
}
