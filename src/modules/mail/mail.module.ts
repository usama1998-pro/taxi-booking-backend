import { DynamicModule, Logger, Module, forwardRef } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { BookingsModule } from '../bookings/bookings.module';
import { getSmtpConfig, getSmtpPortWarning } from './mail.config';
import { MailController } from './mail.controller';
import { MailService } from './mail.service';

@Module({})
export class MailModule {
  static register(): DynamicModule {
    const portWarning = getSmtpPortWarning();
    if (portWarning) {
      Logger.warn(portWarning, MailModule.name);
    }
    const smtp = getSmtpConfig();
    const mailerImports = smtp
      ? [
          MailerModule.forRoot({
            transport: {
              host: smtp.host,
              port: smtp.port,
              secure: smtp.secure,
              auth: {
                user: smtp.user,
                pass: smtp.pass,
              },
            },
            defaults: {
              from: `"${smtp.fromName}" <${smtp.user}>`,
            },
          }),
        ]
      : [];

    return {
      module: MailModule,
      global: true,
      imports: [...mailerImports, forwardRef(() => BookingsModule)],
      controllers: [MailController],
      providers: [MailService],
      exports: [MailService],
    };
  }
}
