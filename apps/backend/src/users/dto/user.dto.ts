import { ApiProperty } from '@nestjs/swagger';

export class UserDto {
  @ApiProperty({ example: 'usr_123', description: 'User ID' })
  id: string;

  @ApiProperty({ example: 'johndoe', description: 'Username' })
  username: string;

  @ApiProperty({ example: 'john@example.com', description: 'User email' })
  email: string;

  @ApiProperty({ example: 'John', description: 'User first name' })
  first_name: string;

  @ApiProperty({ example: 'Doe', description: 'User last name' })
  last_name: string;

  @ApiProperty({
    enum: ['admin', 'employee', 'super-admin'],
    description: 'User type',
  })
  userType: 'admin' | 'employee' | 'super-admin';

  @ApiProperty({
    example: '2024-04-01T12:00:00',
    description: 'User creation date',
  })
  created_at: Date;
}
