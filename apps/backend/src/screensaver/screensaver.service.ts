import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs, accessSync, readFileSync } from 'fs';
import { join } from 'path';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class ScreensaverService {
  private readonly uploadDir = join(process.cwd(), 'persistent_uploads');

  constructor(
    private configService: ConfigService,
    private jwtService: JwtService,
  ) {
    this.initializeUploadDirectory();
  }

  private isRunningInDocker(): boolean {
    try {
      // Check if .dockerenv file exists
      accessSync('/.dockerenv');
      return true;
    } catch {
      // Check if cgroup contains docker
      try {
        const cgroupContent = readFileSync('/proc/1/cgroup', 'utf8');
        return cgroupContent.includes('docker');
      } catch {
        return false;
      }
    }
  }

  private async initializeUploadDirectory() {
    try {
      await fs.access(this.uploadDir);
    } catch {
      await fs.mkdir(this.uploadDir, { recursive: true });
    }
  }

  async saveScreensaver(file: Express.Multer.File, token: string) {
    // Verify token and check user type
    try {
      if (!token) {
        throw new UnauthorizedException('No token provided');
      }

      const decoded = this.jwtService.verify(token);
      // Check if the user type is in the role property (common JWT structure)
      const userType = decoded.role || decoded.userType || decoded.type;

      console.log('Decoded token:', decoded); // For debugging
      console.log('User type:', userType); // For debugging

      if (userType !== 'super-admin') {
        throw new UnauthorizedException(
          'Only super admins can upload screensavers',
        );
      }
    } catch (error) {
      console.error('Error verifying token:', error);
      throw new UnauthorizedException(
        'Invalid token or insufficient permissions',
      );
    }

    const fileExtension = file.mimetype.split('/')[1];
    const fileName = `screensaver-image.${fileExtension}`;
    const filePath = join(this.uploadDir, fileName);

    // First save the new screensaver with a temporary name
    const tempFileName = `screensaver-image.new.${fileExtension}`;
    const tempFilePath = join(this.uploadDir, tempFileName);

    try {
      // Save new screensaver with temporary name
      await fs.writeFile(tempFilePath, file.buffer);

      // Remove old screensaver if exists
      const files = await fs.readdir(this.uploadDir);
      for (const file of files) {
        if (file.startsWith('screensaver-image.') && !file.includes('.new.')) {
          await fs.unlink(join(this.uploadDir, file));
        }
      }

      // Rename temporary file to final name
      await fs.rename(tempFilePath, filePath);

      const baseUrl =
        this.configService.get<string>('BASE_URL') +
        (this.isRunningInDocker()
          ? ':10580'
          : `:${this.configService.get<number>('PORT')}`);
      const url = `${baseUrl}/persistent_uploads/${fileName}`;

      return {
        message: 'Screensaver uploaded successfully',
        url,
        filename: fileName,
      };
    } catch (error) {
      // Clean up temporary file if it exists
      try {
        await fs.unlink(tempFilePath);
      } catch {
        // Ignore error if temp file doesn't exist
      }
      console.error('Error saving screensaver:', error);
      throw new InternalServerErrorException('Failed to save screensaver');
    }
  }

  async getScreensaverPath(): Promise<string> {
    try {
      const files = await fs.readdir(this.uploadDir);
      const screensaverFile = files.find((file) =>
        file.startsWith('screensaver-image.'),
      );

      if (!screensaverFile) {
        throw new NotFoundException('No screensaver image found');
      }

      return join(this.uploadDir, screensaverFile);
    } catch (error) {
      console.log('Error getting screensaver path:', error);
      throw new NotFoundException('No screensaver image found');
    }
  }

  async getScreensaverInfo() {
    try {
      // Add retries for file reading with exponential backoff
      let retryCount = 0;
      const maxRetries = 10;
      const baseDelay = 1000; // 1 second

      while (retryCount < maxRetries) {
        try {
          const files = await fs.readdir(this.uploadDir);
          const screensaverFile = files.find((file) =>
            file.startsWith('screensaver-image.'),
          );

          if (screensaverFile) {
            const stats = await fs.stat(join(this.uploadDir, screensaverFile));

            // Verify file is readable and has content
            if (stats.size === 0) {
              throw new Error('File is empty');
            }

            const baseUrl =
              this.configService.get<string>('BASE_URL') +
              (this.isRunningInDocker()
                ? ':10580'
                : `:${this.configService.get<number>('PORT')}`);

            return {
              status: 'success',
              message: 'Screensaver found',
              data: {
                filename: screensaverFile,
                lastModified: stats.mtime,
                size: stats.size,
                url: `${baseUrl}/persistent_uploads/${screensaverFile}`,
                exists: true,
              },
            };
          }

          retryCount++;
          if (retryCount < maxRetries) {
            // Exponential backoff with jitter
            const delay =
              baseDelay * Math.pow(2, retryCount - 1) + Math.random() * 1000;
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        } catch (error) {
          console.error(`Attempt ${retryCount + 1} failed:`, error);
          retryCount++;
          if (retryCount === maxRetries) throw error;

          // Exponential backoff with jitter for errors
          const delay =
            baseDelay * Math.pow(2, retryCount - 1) + Math.random() * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      // If we get here, we've exhausted all retries
      console.error('Failed to find screensaver after all retries');
      return {
        status: 'empty',
        message: 'No screensaver image has been uploaded yet',
        data: null,
      };
    } catch (error) {
      console.error('Error getting screensaver info:', error);
      return {
        status: 'error',
        message: 'Error retrieving screensaver information',
        data: null,
      };
    }
  }
}
