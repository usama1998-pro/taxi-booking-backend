import { Module } from '@nestjs/common';

import { DriverInvoicesController } from './driver-invoices.controller';
import { DriverInvoicesService } from './driver-invoices.service';

@Module({
  controllers: [DriverInvoicesController],
  providers: [DriverInvoicesService],
})
export class InvoicesModule {}
