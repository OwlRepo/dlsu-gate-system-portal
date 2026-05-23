import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSuperAdminDto {
  @IsEmail()
  @IsNotEmpty()
  @ApiProperty({ example: 'admin@example.com' })
  email: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: 'password123' })
  password: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: 'admin123' })
  username: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({ example: 'John', default: 'Unknown' })
  first_name?: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({ example: 'Doe', default: 'User' })
  last_name?: string;
}

export class SuperAdminLoginDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
