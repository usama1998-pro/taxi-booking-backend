import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiAccessTokenInSwagger } from '../../core/swagger/api-access-token.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ViatorInboxService } from './viator-inbox.service';

@ApiTags('viator')
@ApiAccessTokenInSwagger()
@Controller('viator')
export class ViatorInboxController {
  constructor(private readonly viatorInbox: ViatorInboxService) {}

  @Public()
  @Post('inbox/check')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Check Hostinger inbox for new Viator booking emails (background)',
    description:
      'Returns immediately (HTTP 202) and runs IMAP in the background. Imports real Viator mail and #BR-TEST test mail from the lookback window (default 6h, env VIATOR_INBOX_LOOKBACK_HOURS). Only emails whose Product Code is on the allowed list are saved; others are ignored. Duplicate booking references are skipped. Intended for an external cron/scheduler — no authentication required.',
  })
  checkInbox() {
    return this.viatorInbox.enqueueInboxCheck();
  }

  @Get('notifications')
  @ApiOperation({
    summary: 'List new Viator booking alerts',
    description:
      'Unread alerts created when POST /viator/inbox/check saves a new booking. The driver app polls this and shows local notifications.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  list(@Query('limit') limit?: string) {
    const limitNum = limit ? Number(limit) : undefined;
    return this.viatorInbox.listNotifications({
      limit: Number.isFinite(limitNum) ? limitNum : undefined,
    });
  }

  @Get('notifications/unread-count')
  @ApiOperation({ summary: 'Count of new unread Viator alerts' })
  async unreadCount() {
    return { count: await this.viatorInbox.getUnreadCount() };
  }

  @Patch('notifications/read-all')
  @ApiOperation({
    summary: 'Dismiss all Viator alerts',
    description:
      'Removes all from the app list only. Does not mark Hostinger emails as read.',
  })
  markAllRead() {
    return this.viatorInbox.dismissAllNotifications();
  }

  @Patch('notifications/:id/read')
  @ApiOperation({
    summary: 'Dismiss one Viator alert',
    description:
      'Removes from the app list only. Does not mark the Hostinger email as read.',
  })
  markRead(@Param('id') id: string) {
    return this.viatorInbox.dismissNotification(id);
  }
}
