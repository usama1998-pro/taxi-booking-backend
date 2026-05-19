import {
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiAccessTokenInSwagger } from '../../core/swagger/api-access-token.decorator';
import { isImapConfigured } from './viator-inbox.config';
import { ViatorInboxService } from './viator-inbox.service';

@ApiTags('viator')
@ApiAccessTokenInSwagger()
@Controller('viator')
export class ViatorInboxController {
  constructor(private readonly viatorInbox: ViatorInboxService) {}

  @Get('notifications')
  @ApiOperation({
    summary: 'List new Viator booking alerts',
    description:
      'Reads your Hostinger mailbox via IMAP (not stored in DB). Only unread emails whose subject matches Viator new bookings, e.g. New Booking for Thu, May 28, 2026 (#BR-1399266959)',
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
  unreadCount() {
    return { count: this.viatorInbox.getUnreadCount() };
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

  @Get('inbox/latest')
  @ApiOperation({
    summary: 'Latest Viator new-booking email (test)',
    description:
      'Reads Hostinger IMAP and returns the most recent email matching Viator new-booking subject. Does not mark as read.',
  })
  getLatest() {
    return this.viatorInbox.getLatestViatorMail();
  }

  @Post('inbox/sync')
  @ApiOperation({
    summary: 'Poll Hostinger inbox now for new Viator booking emails',
  })
  async syncNow() {
    if (!isImapConfigured()) {
      throw new ServiceUnavailableException(
        'Hostinger mail not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS (same mailbox that receives Viator emails).',
      );
    }
    return this.viatorInbox.syncFromInbox();
  }
}
