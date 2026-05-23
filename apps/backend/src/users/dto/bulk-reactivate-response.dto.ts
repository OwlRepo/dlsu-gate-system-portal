import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../auth/enums/role.enum';

class ReactivationStatus {
  @ApiProperty({
    description: 'Number of users in this status',
    example: 5,
  })
  count: number;

  @ApiProperty({
    description: 'List of user IDs with this status',
    example: ['EMP-123', 'EMP-456'],
    type: [String],
  })
  userIds: string[];

  @ApiProperty({
    description: 'Additional details about users in this status',
    example: [
      {
        id: 'EMP-123',
        username: 'john.doe',
        email: 'john@example.com',
        name: 'John Doe',
      },
    ],
    type: 'array',
  })
  details: Array<{
    id: string;
    username: string;
    email: string;
    name: string;
  }>;
}

export class BulkReactivateResponseDto {
  @ApiProperty({
    description: 'Overall status of the operation',
    example: 'success',
    enum: ['success', 'partial_success', 'failed'],
  })
  status: 'success' | 'partial_success' | 'failed';

  @ApiProperty({
    description: 'Type of users that were processed',
    enum: Role,
    example: Role.EMPLOYEE,
  })
  userType: Role;

  @ApiProperty({
    description: 'Total number of user IDs that were processed',
    example: 10,
  })
  totalProcessed: number;

  @ApiProperty({
    description: 'Timestamp when the reactivation was performed',
    example: '2024-03-20T10:30:00Z',
  })
  timestamp: string;

  @ApiProperty({
    description: 'Information about successfully reactivated users',
    type: ReactivationStatus,
  })
  successful: ReactivationStatus;

  @ApiProperty({
    description: 'Information about users that were already active',
    type: ReactivationStatus,
  })
  alreadyActive: ReactivationStatus;

  @ApiProperty({
    description: 'Information about users that were not found',
    type: ReactivationStatus,
  })
  notFound: ReactivationStatus;

  @ApiProperty({
    description: 'Human-readable message summarizing the operation',
    example:
      'Successfully reactivated 5 users. 2 users were already active. 1 user was not found.',
  })
  message: string;

  @ApiProperty({
    description: 'Detailed messages for frontend display',
    example: {
      title: 'Bulk Reactivation Complete',
      success: 'Successfully reactivated 5 users',
      warnings: ['2 users were already active', '1 user was not found'],
      actionRequired: false,
    },
  })
  display: {
    title: string;
    success: string;
    warnings: string[];
    actionRequired: boolean;
  };
}
