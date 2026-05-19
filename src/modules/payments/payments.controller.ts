import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CapturePayPalOrderDto } from './dto/capture-paypal-order.dto';
import { CreatePayPalOrderDto } from './dto/create-paypal-order.dto';
import { CreateStripeIntentDto } from './dto/create-stripe-intent.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Public()
  @Post('stripe/intent')
  @ApiOperation({
    summary: 'Create Stripe PaymentIntent',
    description:
      'Public endpoint used by the booking UI before card checkout. Amount is in EUR.',
  })
  createStripeIntent(@Body() dto: CreateStripeIntentDto) {
    return this.paymentsService.createStripePaymentIntent(dto.amountEur);
  }

  @Public()
  @Post('paypal/order')
  @ApiOperation({
    summary: 'Create PayPal checkout order',
    description:
      'Public endpoint used by the booking UI before PayPal approval. Amount is in EUR.',
  })
  createPayPalOrder(@Body() dto: CreatePayPalOrderDto) {
    return this.paymentsService.createPayPalOrder(
      dto.amountEur,
      dto.description,
      dto.returnUrl,
      dto.cancelUrl,
    );
  }

  @Public()
  @Post('paypal/capture')
  @ApiOperation({
    summary: 'Capture approved PayPal order',
    description:
      'Public endpoint called after buyer approves payment. Confirms funds before booking is created.',
  })
  capturePayPalOrder(@Body() dto: CapturePayPalOrderDto) {
    return this.paymentsService.capturePayPalOrder(dto.orderId);
  }
}
