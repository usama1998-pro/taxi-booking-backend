import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  ServiceUnavailableException,
  UseGuards,
  forwardRef,
} from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiAccessTokenInSwagger } from '../../core/swagger/api-access-token.decorator';
import { StaffAdminGuard } from '../auth/guards/staff-admin.guard';
import { Public } from '../auth/decorators/public.decorator';
import { BookingsService } from '../bookings/bookings.service';
import { ResendBookingEmailsDto } from './dto/resend-booking-emails.dto';
import { SendBookingEmailDto } from './dto/send-booking-email.dto';
import { SendTestEmailDto } from './dto/send-test-email.dto';
import { getBookingNotifyEmail, getSmtpConfig, isSmtpConfigured } from './mail.config';
import { MailService } from './mail.service';

@ApiTags('mail')
@Controller('mail')
export class MailController {
  constructor(
    private readonly mailService: MailService,
    @Inject(forwardRef(() => BookingsService))
    private readonly bookingsService: BookingsService,
  ) {}

  @Public()
  @Post('booking/confirm')
  @ApiOperation({
    summary: 'Send booking confirmation email',
    description:
      'Sends a booking confirmation email to the given address. Optionally pass `bookingUuid` to include trip details. Does not fail if SMTP is unset (returns `emailSent: false`).',
  })
  async confirmBooking(@Body() body: SendBookingEmailDto) {
    let booking;
    if (body.bookingUuid) {
      booking = await this.bookingsService.findOnePublicByUuid(body.bookingUuid);
    }
    const emailSent = await this.mailService.sendBookingConfirmation(
      body.email,
      booking,
    );
    if (!this.mailService.isEnabled() && !emailSent) {
      throw new ServiceUnavailableException(
        'Email is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS.',
      );
    }
    return { success: true, emailSent };
  }

  @ApiAccessTokenInSwagger()
  @UseGuards(StaffAdminGuard)
  @ApiForbiddenResponse({ description: 'Staff admin access required' })
  @Get('status')
  @ApiOperation({
    summary: 'SMTP / notify inbox status (staff admin)',
    description:
      'Shows whether outbound mail is configured and which address receives new-booking alerts.',
  })
  getStatus() {
    const smtp = getSmtpConfig();
    return {
      smtpConfigured: isSmtpConfigured(),
      mailerReady: this.mailService.isEnabled(),
      smtpHost: smtp?.host ?? null,
      fromEmail: smtp?.user ?? null,
      bookingNotifyEmail: getBookingNotifyEmail(),
    };
  }

  @ApiAccessTokenInSwagger()
  @UseGuards(StaffAdminGuard)
  @ApiForbiddenResponse({ description: 'Staff admin access required' })
  @Post('test')
  @ApiOperation({
    summary: 'Send SMTP test email (staff admin)',
    description: 'Verifies Hostinger SMTP credentials from server environment.',
  })
  async sendTest(@Body() body: SendTestEmailDto) {
    await this.mailService.sendTestEmail(body.email);
    return { success: true, message: 'Test email sent.' };
  }

  @ApiAccessTokenInSwagger()
  @UseGuards(StaffAdminGuard)
  @ApiForbiddenResponse({ description: 'Staff admin access required' })
  @Post('booking/resend')
  @ApiOperation({
    summary: 'Resend booking emails (staff admin)',
    description:
      'Sends customer confirmation and owner new-booking alert for an existing booking.',
  })
  async resendBookingEmails(@Body() body: ResendBookingEmailsDto) {
    if (!this.mailService.isEnabled()) {
      throw new ServiceUnavailableException(
        'Email is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS.',
      );
    }
    const booking = await this.bookingsService.findOnePublicByUuid(body.bookingUuid);
    const notifications = await this.mailService.sendBookingEmails(booking);
    return {
      success: true,
      bookingUuid: body.bookingUuid,
      bookingReference: booking.bookingReference,
      bookingNotifyEmail: getBookingNotifyEmail(),
      ...notifications,
    };
  }
}
