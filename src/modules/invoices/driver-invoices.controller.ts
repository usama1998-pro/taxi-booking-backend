import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { ApiAccessTokenInSwagger } from '../../core/swagger/api-access-token.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateDriverInvoiceDto } from './dto/create-driver-invoice.dto';
import { ListDriverInvoicesQueryDto } from './dto/list-driver-invoices-query.dto';
import { DriverInvoicesService } from './driver-invoices.service';

@ApiForbiddenResponse({ description: 'Not a driver' })
@ApiTags('driver-invoices')
@ApiAccessTokenInSwagger()
@Controller('drivers/me/invoices')
export class DriverInvoicesController {
  constructor(private readonly driverInvoicesService: DriverInvoicesService) {}

  @Get('suggested-price')
  @ApiOperation({
    summary: 'Suggested subtotal from an assigned booking',
    description:
      'Returns the booking `price` when `bookingReference` matches a booking assigned to the authenticated driver.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        price: { type: 'number', example: 45.5 },
        currency: { type: 'string', example: 'GBP' },
      },
    },
  })
  suggestedPrice(
    @CurrentUser() user: AuthenticatedUser,
    @Query('bookingReference') bookingReference: string,
  ) {
    const ref = bookingReference?.trim();
    if (!ref) {
      throw new BadRequestException('Query parameter bookingReference is required');
    }
    return this.driverInvoicesService.suggestedPriceFromBookingReference(user, ref);
  }

  @Post()
  @ApiOperation({
    summary: 'Create invoice',
    description:
      'Stores gross amount in `priceAmount`. Tax is always 10%; `totalAmount` is computed server-side (subtotal minus tax).',
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDriverInvoiceDto,
  ) {
    return this.driverInvoicesService.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my invoices (paginated)' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { type: 'object' } },
        page: { type: 'integer' },
        pageSize: { type: 'integer' },
        total: { type: 'integer' },
        totalPages: { type: 'integer' },
      },
    },
  })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListDriverInvoicesQueryDto,
  ) {
    return this.driverInvoicesService.findAllPaginated(user, query);
  }

  @Get('analytics')
  @ApiOperation({
    summary: 'Invoice analytics for the driver',
    description:
      'Totals, averages, count linked from bookings, last 7 UTC days of invoiced totals, and last 6 UTC months.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      additionalProperties: true,
    },
  })
  analytics(@CurrentUser() user: AuthenticatedUser) {
    return this.driverInvoicesService.getAnalytics(user);
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Download invoice as PDF' })
  @ApiProduces('application/pdf')
  @ApiOkResponse({
    description: 'PDF document',
    schema: { type: 'string', format: 'binary' },
  })
  async downloadPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const buffer = await this.driverInvoicesService.buildPdfBuffer(user, id);
    const filename = `invoice-${id.slice(0, 8)}.pdf`;
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one invoice by id' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.driverInvoicesService.findOne(user, id);
  }
}
