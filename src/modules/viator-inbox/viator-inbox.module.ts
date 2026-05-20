import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { ViatorImapConnectionService } from './viator-imap-connection.service';
import { ViatorInboxController } from './viator-inbox.controller';
import { ViatorInboxService } from './viator-inbox.service';

@Module({
  imports: [BookingsModule],
  controllers: [ViatorInboxController],
  providers: [ViatorImapConnectionService, ViatorInboxService],
  exports: [ViatorInboxService],
})
export class ViatorInboxModule {}
