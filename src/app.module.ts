import { Module } from '@nestjs/common';
import { CoreModule } from './core/core.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { JobsModule } from './jobs/jobs.module';
import { AuthModule } from './modules/auth/auth.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { DriversModule } from './modules/drivers/drivers.module';
import { InsightsModule } from './modules/insights/insights.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    CoreModule,
    InfrastructureModule,
    JobsModule,
    AuthModule,
    UsersModule,
    DriversModule,
    BookingsModule,
    InsightsModule,
  ],
})
export class AppModule {}
