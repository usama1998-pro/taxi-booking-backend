import { Body, Controller, Delete, Param, Patch, Post } from '@nestjs/common';
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
import { UpdateDriverVerificationCodeByEmailAdminDto } from './dto/update-driver-verification-code-by-email-admin.dto';

@ApiTags('admin')
@ApiBearerAuth('access-token')
@Controller('admin/driver-verification-codes')
export class AdminDriverVerificationController {
  constructor(
    private readonly driverVerificationAdmin: DriverVerificationAdminService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Set or replace a driver verification code',
    description:
      'Authenticated access. Upserts the 4-digit code for the driver identified by email.',
  })
  @ApiResponse({ status: 404, description: 'Driver email not found' })
  @ApiResponse({ status: 409, description: 'Code already used by another driver' })
  set(@Body() dto: SetDriverVerificationCodeAdminDto) {
    return this.driverVerificationAdmin.setForDriverEmail({
      driverEmail: dto.driverEmail,
      code: dto.code,
      isActive: dto.isActive,
    });
  }

  /** Static path must be registered before `@Patch(':driverId')` or `by-email` is captured as a UUID param and the wrong DTO runs. */
  @Patch('by-email')
  @ApiOperation({
    summary: 'Update driver verification code by driver email',
    description:
      'Authenticated access. Updates code and/or active state for an existing driver code row.',
  })
  @ApiResponse({ status: 400, description: 'No update fields provided' })
  @ApiResponse({ status: 404, description: 'Driver email/code not found' })
  @ApiResponse({ status: 409, description: 'Code already used by another driver' })
  patchByEmail(@Body() dto: UpdateDriverVerificationCodeByEmailAdminDto) {
    return this.driverVerificationAdmin.updateForDriverEmail({
      driverEmail: dto.driverEmail,
      code: dto.code,
      isActive: dto.isActive,
    });
  }

  @Patch(':driverId')
  @ApiOperation({
    summary: 'Enable or disable an existing driver verification code',
    description: 'Authenticated access.',
  })
  @ApiParam({ name: 'driverId', description: 'Driver UUID' })
  @ApiResponse({ status: 404, description: 'No code configured for driver' })
  patch(
    @Param('driverId') driverId: string,
    @Body() dto: PatchDriverVerificationCodeAdminDto,
  ) {
    return this.driverVerificationAdmin.setActive(driverId, dto.isActive);
  }

  @Delete('by-email/:driverEmail')
  @ApiOperation({
    summary: 'Remove a driver verification code by driver email',
    description: 'Authenticated access.',
  })
  @ApiParam({ name: 'driverEmail', description: 'Driver email' })
  @ApiResponse({ status: 404, description: 'Driver email/code not found' })
  removeByEmail(@Param('driverEmail') driverEmail: string) {
    return this.driverVerificationAdmin.removeByDriverEmail(driverEmail);
  }

  @Delete(':driverId')
  @ApiOperation({
    summary: 'Remove a driver verification code',
    description: 'Authenticated access.',
  })
  @ApiParam({ name: 'driverId', description: 'Driver UUID' })
  @ApiResponse({ status: 404, description: 'No code configured for driver' })
  remove(@Param('driverId') driverId: string) {
    return this.driverVerificationAdmin.remove(driverId);
  }
}
