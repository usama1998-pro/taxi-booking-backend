import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
      'Returns bookings in dispatcher mode. Paginated with `page` (1-based) and `pageSize` (default 20, max 100). Optional `timeScope=past|current|upcoming`: **past** — completed/cancelled only; **current** — open bookings due today or earlier (includes overdue); **upcoming** — open bookings from tomorrow onward (server `TZ`). Optional `scheduledOn=YYYY-MM-DD` filters by pickup calendar day in server `TZ`. Omit `timeScope` for all bookings (`createdAt` desc).',
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
  @Get('trash')
  @ApiOperation({
    summary: 'List trashed bookings (paginated)',
    description:
      'Returns soft-deleted bookings only. Paginated with `page` (1-based) and `pageSize` (default 20, max 100). Ordered by `deletedAt` descending (most recently deleted first). Each row includes `deletedAt`.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { type: 'object' } },
        page: { type: 'integer', example: 1 },
        pageSize: { type: 'integer', example: 20 },
        total: { type: 'integer', example: 5 },
        totalPages: { type: 'integer', example: 1 },
      },
    },
  })
  findTrash(
    @Query() query: ListBookingsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookingsService.findTrash(user, query);
  }

  @Public()
  @Post('trash/purge')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Purge trashed bookings (batch, background)',
    description:
      'Returns immediately (HTTP 202) and hard-deletes up to 30 trashed bookings in the background (oldest first). For cron/scheduler. Respects optional env BOOKING_TRASH_RETENTION_DAYS. Overlapping calls return already_running.',
  })
  purgeTrashBatch() {
    return this.bookingsService.enqueuePurgeTrashBatch();
  }

  @ApiAccessTokenInSwagger()
  @Post('trash/clear')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Clear trash (permanent delete all)',
    description:
      'Hard-deletes every trashed booking eligible for purge (same rules as purge batch). Returns count and uuids removed.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        purged: { type: 'integer', example: 12 },
        uuids: { type: 'array', items: { type: 'string', format: 'uuid' } },
        remainingInTrash: { type: 'integer', example: 0 },
      },
    },
  })
  clearTrash() {
    return this.bookingsService.clearTrash();
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
    summary: 'Delete booking (move to trash)',
    description:
      'Soft-deletes booking by `uuid` (moves to trash). Permanent removal runs via POST /bookings/trash/purge.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Booking moved to trash.' },
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
    description:
      'Alias route to soft-delete reservation by booking `uuid` (move to trash).',
  })
  removeReservation(
    @Param('uuid', ParseUUIDPipe) uuid: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookingsService.remove(uuid, user);
  }
}
