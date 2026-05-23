import { IsNotEmpty, IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAdminDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    example: 'johndoe',
    description: 'The username of the admin',
  })
  username: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    example: 'john.doe@example.com',
    description: 'The email of the admin',
  })
  email: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    example: 'strongPassword123',
    description: 'The password of the admin',
  })
  password: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    example: 'admin',
    description: 'The role of the admin',
  })
  role: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    example: 'John',
    description: 'The first name of the admin',
    default: 'Unknown',
  })
  first_name?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    example: 'Doe',
    description: 'The last name of the admin',
    default: 'Admin',
  })
  last_name?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsString()
  date_activated?: string;

  @IsOptional()
  @IsString()
  date_deactivated?: string;

  @IsOptional()
  @IsString()
  created_at?: string;
}
