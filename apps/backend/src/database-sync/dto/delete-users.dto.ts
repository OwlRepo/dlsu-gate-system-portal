import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, ArrayMinSize } from 'class-validator';

export class DeleteUsersDto {
  @ApiProperty({
    description: 'Array of user IDs to delete',
    example: ['4334', '4335', '4336'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  userIds: string[];
}
