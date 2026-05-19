import { DynamicModule, Module, forwardRef } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { BookingsModule } from '../bookings/bookings.module';
import { getSmtpConfig } from './mail.config';
import { MailController } from './mail.controller';
import { MailService } from './mail.service';

@Module({})
export class MailModule {
  static register(): DynamicModule {
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
