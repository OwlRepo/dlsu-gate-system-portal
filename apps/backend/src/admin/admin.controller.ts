import {
  Controller,
  Get,
  Body,
  Patch,
  Param,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { UpdateAdminDto } from './dto/update-admin.dto';
import {
  ApiBody,
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiParam,
  ApiSecurity,
  ApiExtraModels,
  ApiQuery,
} from '@nestjs/swagger';
import { BasePaginationDto } from '../common/dto/base-pagination.dto';

@ApiTags('Admin')
@ApiSecurity('bearer')
@ApiExtraModels(UpdateAdminDto)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all admins with pagination',
    description:
      'Retrieves a paginated list of admin users with optional filtering',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 10)',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search term for username or email',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated list of admins',
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              admin_id: { type: 'string' },
              username: { type: 'string' },
              email: { type: 'string' },
              first_name: { type: 'string' },
              last_name: { type: 'string' },
              role: { type: 'string' },
              created_at: { type: 'string', format: 'date-time' },
              updated_at: { type: 'string', format: 'date-time' },
            },
          },
        },
        total: { type: 'number', description: 'Total number of records' },
        page: { type: 'number', description: 'Current page' },
        limit: { type: 'number', description: 'Items per page' },
        totalPages: { type: 'number', description: 'Total number of pages' },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'Forbidden resource' },
        error: { type: 'string', example: 'Forbidden' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  findAll(@Query() query: BasePaginationDto) {
    return this.adminService.findAll(query);
  }

  @Get(':admin_id')
  @ApiOperation({
    summary: 'Get admin by admin_id',
    description: 'Retrieves a specific admin user by their admin_id',
  })
  @ApiParam({
    name: 'admin_id',
    required: true,
    description: 'The unique identifier of the admin',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Admin found successfully',
    schema: {
      type: 'object',
      properties: {
        admin_id: {
          type: 'string',
          example: '123e4567-e89b-12d3-a456-426614174000',
        },
        username: { type: 'string', example: 'admin.user' },
        email: { type: 'string', example: 'admin@example.com' },
        created_at: { type: 'string', format: 'date-time' },
        updated_at: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Admin not found',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'Admin not found' },
        error: { type: 'string', example: 'Not Found' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  findOne(@Param('admin_id') admin_id: string) {
    return this.adminService.findByAdminId(admin_id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update an admin',
    description:
      'Update specific fields of an admin. Only provided fields will be updated, others remain unchanged.\n\n' +
      'Updatable fields:\n' +
      '- first_name (string): First name of the admin\n' +
      '- last_name (string): Last name of the admin\n' +
      '- email (string): Email address of the admin\n' +
      '- password (string): Password for the admin account\n\n' +
      'Note: To change admin active status, please use the /users/bulk-deactivate endpoint instead.',
  })
  @ApiBody({
    type: UpdateAdminDto,
    examples: {
      passwordOnly: {
        summary: 'Update password only',
        value: {
          password: 'newpassword123',
        },
      },
      namesOnly: {
        summary: 'Update names only',
        value: {
          first_name: 'John',
          last_name: 'Doe',
        },
      },
      emailOnly: {
        summary: 'Update email only',
        value: {
          email: 'new.email@example.com',
        },
      },
      multipleFields: {
        summary: 'Update multiple fields',
        value: {
          first_name: 'John',
          last_name: 'Doe',
          email: 'john.doe@example.com',
          password: 'newpassword123',
          role: 'admin',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Admin has been successfully updated',
    schema: {
      example: {
        id: 1,
        admin_id: 'ADM-123ABC',
        username: 'johndoe',
        email: 'john.doe@example.com',
        first_name: 'John',
        last_name: 'Doe',
        role: 'admin',
        is_active: true,
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Admin not found' })
  async update(
    @Param('id') id: string,
    @Body() updateAdminDto: UpdateAdminDto,
  ) {
    if ('is_active' in updateAdminDto) {
      delete updateAdminDto.is_active;
      throw new ForbiddenException(
        'To deactivate users, please use the /users/bulk-deactivate endpoint instead',
      );
    }
    return this.adminService.update(id, updateAdminDto);
  }

  @Patch('username/:username')
  @ApiOperation({
    summary: 'Update admin by username',
    description:
      'Update specific fields of an admin using their username. Only provided fields will be updated, others remain unchanged.\n\n' +
      'Updatable fields:\n' +
      '- first_name (string): First name of the admin\n' +
      '- last_name (string): Last name of the admin\n' +
      '- email (string): Email address of the admin\n' +
      '- password (string): Password for the admin account\n\n' +
      'Note: To change admin active status, please use the /users/bulk-deactivate endpoint instead.',
  })
  @ApiParam({
    name: 'username',
    required: true,
    description: 'The username of the admin to update',
    example: 'admin.user',
  })
  @ApiBody({
    type: UpdateAdminDto,
    description: 'The admin data to update',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Admin updated successfully',
    schema: {
      type: 'object',
      properties: {
        admin_id: { type: 'string' },
        username: { type: 'string' },
        email: { type: 'string' },
        updated_at: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Admin not found',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'Admin not found' },
        error: { type: 'string', example: 'Not Found' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'array', items: { type: 'string' } },
        error: { type: 'string', example: 'Bad Request' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  updateByUsername(
    @Param('username') username: string,
    @Body() updateAdminDto: UpdateAdminDto,
  ) {
    return this.adminService.updateByUsername(username, updateAdminDto);
  }
}
