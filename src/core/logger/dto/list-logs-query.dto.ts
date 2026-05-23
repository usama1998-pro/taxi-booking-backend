import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListLogsQueryDto {
  @ApiPropertyOptional({
    description: 'Number of log lines to return (newest last)',
    default: 200,
    minimum: 1,
    maximum: 1000,
    example: 200,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;

  @ApiPropertyOptional({
    description:
      'Rotated log file name (e.g. app.log or app.log.1). Defaults to the active log file.',
    example: 'app.log',
  })
  @IsOptional()
  @IsString()
  file?: string;
}
