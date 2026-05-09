import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AdminDriverUserLinkService } from './admin-driver-user-link.service';
import { AssignDriverLinkedUserDto } from './dto/assign-driver-linked-user.dto';
import { StaffAdminGuard } from './guards/staff-admin.guard';

@ApiTags('admin')
@ApiBearerAuth('access-token')
@UseGuards(StaffAdminGuard)
@Controller('admin/drivers')
export class AdminDriverUserLinkController {
  constructor(private readonly linkService: AdminDriverUserLinkService) {}

  @Patch(':driverId/linked-user')
  @ApiOperation({
    summary: 'Link a driver to an existing user',
    description:
      'Staff admin only (`is_admin` JWT), including super admins. Sets `Driver.userId`. If that user was already linked to another driver, the previous link is cleared first.',
  })
  @ApiParam({ name: 'driverId', format: 'uuid' })
  @ApiResponse({ status: 404, description: 'Driver or user not found' })
  assign(
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Body() dto: AssignDriverLinkedUserDto,
  ) {
    return this.linkService.assignLinkedUser(driverId, dto.userId);
  }

  @Delete(':driverId/linked-user')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Unlink a driver from its user',
    description: 'Staff admin only. Clears `Driver.userId`.',
  })
  @ApiParam({ name: 'driverId', format: 'uuid' })
  @ApiResponse({ status: 404, description: 'Driver not found' })
  @ApiResponse({
    status: 200,
    description: 'Returns the driver; if already unlinked, unchanged.',
  })
  clear(@Param('driverId', ParseUUIDPipe) driverId: string) {
    return this.linkService.clearLinkedUser(driverId);
  }
}
