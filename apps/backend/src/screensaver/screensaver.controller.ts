import {
  Controller,
  Post,
  Get,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  BadRequestException,
  Headers,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ScreensaverService } from './screensaver.service';
import {
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiTags,
  ApiResponse,
  ApiHeader,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

@ApiTags('Screensaver')
@Controller('screensaver')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ScreensaverController {
  constructor(
    private readonly screensaverService: ScreensaverService,
    private configService: ConfigService,
  ) {}

  @Post('upload')
  @ApiOperation({
    summary: 'Upload screensaver image',
    description:
      'Upload a new screensaver image. Supports JPG, JPEG, PNG, WebP, and GIF formats. Maximum file size is 10MB.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Image file to upload (JPG, JPEG, PNG, WebP, or GIF)',
        },
      },
    },
  })
  @ApiHeader({
    name: 'Authorization',
    description: 'JWT Bearer token',
    required: true,
  })
  @ApiResponse({
    status: 201,
    description: 'Screensaver image successfully uploaded',
    schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL of the uploaded screensaver image',
        },
        filename: {
          type: 'string',
          description: 'Name of the uploaded file',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Bad request - Invalid file type, file too large, or no file uploaded',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
      },
      fileFilter: (req, file, callback) => {
        const allowedMimeTypes = [
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/webp',
          'image/gif',
        ];

        if (!allowedMimeTypes.includes(file.mimetype)) {
          return callback(
            new BadRequestException(
              'Only JPG, JPEG, PNG, WebP, and GIF files are allowed',
            ),
            false,
          );
        }

        callback(null, true);
      },
    }),
  )
  async uploadScreensaver(
    @UploadedFile() file: Express.Multer.File,
    @Headers('authorization') authHeader: string,
  ) {
    const token = authHeader?.split(' ')[1];
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // File type validation is now handled by the FileInterceptor
    // We only need to check if the file exists

    return this.screensaverService.saveScreensaver(file, token);
  }

  @Get()
  @ApiOperation({
    summary: 'Get current screensaver image URL',
    description:
      'Retrieve information about the currently set screensaver image',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved screensaver information',
    schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL of the current screensaver image',
        },
        lastUpdated: {
          type: 'string',
          format: 'date-time',
          description: 'Timestamp of when the screensaver was last updated',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  @ApiResponse({
    status: 404,
    description: 'No screensaver image found',
  })
  async getScreensaver() {
    return await this.screensaverService.getScreensaverInfo();
  }
}
