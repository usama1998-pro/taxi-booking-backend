import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DriverVerificationAdminService } from './driver-verification-admin.service';
import { PatchDriverVerificationCodeAdminDto } from './dto/patch-driver-verification-code-admin.dto';
import { SetDriverVerificationCodeAdminDto } from './dto/set-driver-verification-code-admin.dto';
import { SuperAdminGuard } from './guards/super-admin.guard';

@ApiTags('admin')
@ApiBearerAuth('access-token')
@Controller('admin/driver-verification-codes')
@UseGuards(SuperAdminGuard)
export class AdminDriverVerificationController {
  constructor(
    private readonly driverVerificationAdmin: DriverVerificationAdminService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Set or replace a driver verification code',
    description:
      'Super admin only. Upserts the 4-digit code for the driver identified by email.',
  })
  @ApiResponse({ status: 403, description: 'Not a super admin' })
  @ApiResponse({ status: 404, description: 'Driver email not found' })
  @ApiResponse({ status: 409, description: 'Code already used by another driver' })
  set(@Body() dto: SetDriverVerificationCodeAdminDto) {
    return this.driverVerificationAdmin.setForDriverEmail({
      driverEmail: dto.driverEmail,
      code: dto.code,
      isActive: dto.isActive,
    });
  }

  @Patch(':driverId')
  @ApiOperation({
    summary: 'Enable or disable an existing driver verification code',
    description: 'Super admin only.',
  })
  @ApiParam({ name: 'driverId', description: 'Driver UUID' })
  @ApiResponse({ status: 403, description: 'Not a super admin' })
  @ApiResponse({ status: 404, description: 'No code configured for driver' })
  patch(
    @Param('driverId') driverId: string,
    @Body() dto: PatchDriverVerificationCodeAdminDto,
  ) {
    return this.driverVerificationAdmin.setActive(driverId, dto.isActive);
  }

  @Delete(':driverId')
  @ApiOperation({
    summary: 'Remove a driver verification code',
    description: 'Super admin only.',
  })
  @ApiParam({ name: 'driverId', description: 'Driver UUID' })
  @ApiResponse({ status: 403, description: 'Not a super admin' })
  @ApiResponse({ status: 404, description: 'No code configured for driver' })
  remove(@Param('driverId') driverId: string) {
    return this.driverVerificationAdmin.remove(driverId);
  }
}
