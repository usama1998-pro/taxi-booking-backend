import { Module } from '@nestjs/common';
import { CoreModule } from './core/core.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { JobsModule } from './jobs/jobs.module';
import { AuthModule } from './modules/auth/auth.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { DriversModule } from './modules/drivers/drivers.module';
import { InsightsModule } from './modules/insights/insights.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { MailModule } from './modules/mail/mail.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { UsersModule } from './modules/users/users.module';
import { ViatorInboxModule } from './modules/viator-inbox/viator-inbox.module';

@Module({
  imports: [
    CoreModule,
    InfrastructureModule,
    JobsModule,
    AuthModule,
    UsersModule,
    DriversModule,
    MailModule.register(),
    BookingsModule,
    InsightsModule,
    InvoicesModule,
    PaymentsModule,
    ViatorInboxModule,
  ],
})
export class AppModule {}
