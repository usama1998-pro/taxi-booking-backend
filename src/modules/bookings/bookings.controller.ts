import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiAccessTokenInSwagger } from '../../core/swagger/api-access-token.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ListBookingsQueryDto } from './dto/list-bookings-query.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';

@ApiForbiddenResponse({ description: 'Not allowed to access this booking' })
@ApiTags('bookings')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Public()
  @Post()
  @ApiOperation({
    summary: 'Create a booking',
    description:
      'Public booking creation (no auth required). Customer fields are used to resolve or create the booking user record automatically.',
  })
  create(@Body() dto: CreateBookingDto) {
    return this.bookingsService.create(dto);
  }

  @ApiAccessTokenInSwagger()
  @Get()
  @ApiOperation({
    summary: 'List bookings',
    description:
      'Returns bookings in dispatcher mode. Paginated with `page` (1-based) and `pageSize` (default 20, max 100). Optional `timeScope=past|current|upcoming`: **past** — completed/cancelled, newest completion first; **current** — open bookings whose pickup is on today\'s date (server `TZ`); **upcoming** — open bookings from tomorrow onward. Omit for all bookings (`createdAt` desc).',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          description: 'Bookings for this page (no internal `id`; use `uuid`)',
          items: { type: 'object' },
        },
        page: { type: 'integer', example: 1 },
        pageSize: { type: 'integer', example: 20 },
        total: { type: 'integer', example: 42 },
        totalPages: { type: 'integer', example: 3 },
      },
    },
  })
  findAll(
    @Query() query: ListBookingsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookingsService.findAll(user, query);
  }

  @ApiAccessTokenInSwagger()
  @Get(':uuid')
  @ApiOperation({
    summary: 'Get booking by uuid',
    description: 'Public booking identifier is `uuid` (not internal `id`).',
  })
  findOne(
    @Param('uuid', ParseUUIDPipe) uuid: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookingsService.findOne(uuid, user);
  }

  @ApiAccessTokenInSwagger()
  @Patch(':uuid')
  @ApiOperation({
    summary: 'Update booking',
    description:
      'Passenger may update their booking (including assigning a driver). Assigned drivers may set `status` to `in_progress` (start ride) or `completed` (only after it is in progress). Set `"driverId": null` to unassign (passenger only). Path uses booking `uuid`.',
  })
  update(
    @Param('uuid', ParseUUIDPipe) uuid: string,
    @Body() dto: UpdateBookingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookingsService.update(uuid, dto, user);
  }

  @ApiAccessTokenInSwagger()
  @Patch(':uuid/complete')
  @ApiOperation({
    summary: 'Complete reservation',
    description:
      'Marks reservation as completed and sets `completedAt` to now. Path uses booking `uuid`.',
  })
  completeReservation(
    @Param('uuid', ParseUUIDPipe) uuid: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookingsService.completeReservation(uuid, user);
  }

  @ApiAccessTokenInSwagger()
  @Delete(':uuid')
  @ApiOperation({
    summary: 'Delete booking',
    description:
      'Deletes booking by `uuid`.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Booking deleted successfully.' },
        uuid: { type: 'string', format: 'uuid' },
      },
    },
  })
  remove(
    @Param('uuid', ParseUUIDPipe) uuid: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookingsService.remove(uuid, user);
  }

  @ApiAccessTokenInSwagger()
  @Delete(':uuid/remove')
  @ApiOperation({
    summary: 'Remove reservation',
    description: 'Alias route to delete reservation by booking `uuid`.',
  })
  removeReservation(
    @Param('uuid', ParseUUIDPipe) uuid: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookingsService.remove(uuid, user);
  }
}
