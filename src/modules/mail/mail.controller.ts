import {
  Body,
  Controller,
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
import { SendBookingEmailDto } from './dto/send-booking-email.dto';
import { SendTestEmailDto } from './dto/send-test-email.dto';
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
  @Post('test')
  @ApiOperation({
    summary: 'Send SMTP test email (staff admin)',
    description: 'Verifies Hostinger SMTP credentials from server environment.',
  })
  async sendTest(@Body() body: SendTestEmailDto) {
    await this.mailService.sendTestEmail(body.email);
    return { success: true, message: 'Test email sent.' };
  }
}
