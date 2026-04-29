import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../modules/auth/decorators/public.decorator';
import { DatabaseService } from '../database/database.service';

@Public()
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get('db')
  @ApiOperation({ summary: 'PostgreSQL connectivity check' })
  @ApiResponse({
    status: 200,
    description: 'Database is reachable',
    schema: {
      example: { status: 'ok', database: { status: 'up' } },
    },
  })
  @ApiServiceUnavailableResponse({
    description: 'Database is not reachable',
    schema: {
      example: {
        statusCode: 503,
        message: { status: 'error', database: { status: 'down' } },
      },
    },
  })
  async checkDatabase(): Promise<{
    status: string;
    database: { status: string };
  }> {
    try {
      await this.database.ping();
      return { status: 'ok', database: { status: 'up' } };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Database check failed';
      throw new ServiceUnavailableException({
        status: 'error',
        database: { status: 'down', message },
      });
    }
  }
}
