import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { parse } from 'node:path';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';

// Public: the deploy readiness gate and infra monitors probe /health without a
// token. It previously answered tokenless requests only via the (removed)
// NODE_ENV=development auth bypass.
@Public()
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private memory: MemoryHealthIndicator,
    private disk: DiskHealthIndicator,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({
    summary: 'Check system health',
    description:
      'Returns the health status of the application and its database connection',
  })
  @ApiResponse({
    status: 200,
    description: 'Application and database are healthy',
    schema: {
      example: {
        status: 'ok',
        info: {
          database: {
            status: 'up',
          },
        },
        error: {},
        details: {
          database: {
            status: 'up',
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'Service unavailable - Database or application is unhealthy',
    schema: {
      example: {
        status: 'error',
        info: {},
        error: {
          database: {
            status: 'down',
            message: 'Unable to connect to database',
          },
        },
        details: {
          database: {
            status: 'down',
            message: 'Unable to connect to database',
          },
        },
      },
    },
  })
  async check() {
    return this.health.check([
      // Database health check
      async () => this.db.pingCheck('database', { timeout: 3000 }),

      // Memory health check
      async () => this.memory.checkHeap('memory_heap', 250 * 1024 * 1024), // 250MB
      async () => this.memory.checkRSS('memory_rss', 250 * 1024 * 1024), // 250MB

      // Disk health check.
      // The path must be the filesystem root of the drive we are running on.
      // Hardcoding '/' made check-disk-space throw InvalidPathError on Windows
      // ("should be X:\..."), so /health returned 503 on every request and the
      // deploy never passed its readiness gate.
      async () =>
        this.disk.checkStorage('storage', {
          thresholdPercent: 0.9,
          path: parse(process.cwd()).root,
        }),

      // Custom database connection check
      async () => {
        try {
          if (!this.dataSource.isInitialized) {
            await this.dataSource.initialize();
          }
          await this.dataSource.query('SELECT 1');

          // Get connection pool stats safely
          const poolStats = {
            poolSize: 0,
            usedConnections: 0,
            idleConnections: 0,
          };

          try {
            const pool = (this.dataSource.driver as any).pool;
            if (pool) {
              poolStats.poolSize = pool.size || 0;
              poolStats.usedConnections = pool.used || 0;
              poolStats.idleConnections = pool.idle || 0;
            }
          } catch {
            // Ignore pool stats errors
          }

          return {
            database_connection: {
              status: 'up',
              details: {
                isConnected: true,
                ...poolStats,
              },
            },
          };
        } catch (error) {
          return {
            database_connection: {
              status: 'down',
              error: error.message,
            },
          };
        }
      },
    ]);
  }
}
