import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { StaffAdminGuard } from '../../modules/auth/guards/staff-admin.guard';
import { ApiAccessTokenInSwagger } from '../swagger/api-access-token.decorator';
import { resolveFileLoggerConfig } from './file-logger.config';
import { ListLogsQueryDto } from './dto/list-logs-query.dto';
import { LogsService } from './logs.service';

@ApiTags('logs')
@ApiAccessTokenInSwagger()
@UseGuards(StaffAdminGuard)
@ApiForbiddenResponse({ description: 'Staff admin access required' })
@Controller('logs')
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get()
  @ApiOperation({
    summary: 'Read latest application log lines',
    description:
      'Returns the tail of the rotating Winston log file (default `logs/app.log`). Staff admin only.',
  })
  list(@Query() query: ListLogsQueryDto) {
    const limit = query.limit ?? 200;
    return this.logsService.readLatestLines(limit, query.file);
  }

  @Get('files')
  @ApiOperation({
    summary: 'List available log files',
    description:
      'Active and rotated chunks (e.g. app.log, app.log.1). Staff admin only.',
  })
  listFiles() {
    const config = resolveFileLoggerConfig();
    return {
      enabled: config.enabled,
      activeFile: config.filePath,
      files: this.logsService.listLogFiles(),
    };
  }
}
