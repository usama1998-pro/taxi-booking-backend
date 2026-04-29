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
  UseGuards,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiAccessTokenInSwagger } from '../../core/swagger/api-access-token.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { DriverSelfGuard } from '../auth/guards/driver-self.guard';
import { CreateCarDto } from './dto/create-car.dto';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateCarDto } from './dto/update-car.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { DriversService } from './drivers.service';

@ApiForbiddenResponse({
  description: 'Driver accessing another driver id or car',
})
@ApiTags('drivers')
@UseGuards(DriverSelfGuard)
@Controller('drivers')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Public()
  @Post()
  @ApiOperation({ summary: 'Register a driver' })
  create(@Body() dto: CreateDriverDto) {
    return this.driversService.create(dto);
  }

  @ApiAccessTokenInSwagger()
  @Get()
  @ApiOperation({
    summary: 'List drivers (includes car when present)',
    description:
      'Passengers see all drivers. A logged-in driver only sees their own record.',
  })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.driversService.findAll(user);
  }

  @ApiAccessTokenInSwagger()
  @Get('me/profile')
  @ApiOperation({
    summary: 'Get my driver profile',
    description:
      'Returns the authenticated driver profile with linked user info and car details.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        userId: { type: 'string', format: 'uuid', nullable: true },
        name: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        photoUrl: { type: 'string', nullable: true },
        isAvailable: { type: 'boolean' },
        isActive: { type: 'boolean' },
        car: {
          anyOf: [
            { type: 'null' },
            {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                driverId: { type: 'string', format: 'uuid' },
                carName: { type: 'string' },
                carNumber: { type: 'string' },
                capacity: { type: 'integer' },
              },
            },
          ],
        },
        user: {
          anyOf: [
            { type: 'null' },
            {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                fullName: { type: 'string' },
                email: { type: 'string' },
                phone: { type: 'string' },
                isAdmin: { type: 'boolean' },
                createdAt: { type: 'string', format: 'date-time' },
              },
            },
          ],
        },
      },
    },
  })
  getMyProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.driversService.getMyProfile(user);
  }

  @ApiAccessTokenInSwagger()
  @Get(':driverId/car')
  @ApiOperation({ summary: "Get a driver's car" })
  getCar(@Param('driverId', ParseUUIDPipe) driverId: string) {
    return this.driversService.getCar(driverId);
  }

  @ApiAccessTokenInSwagger()
  @Post(':driverId/car')
  @ApiOperation({ summary: 'Register a car for a driver (one per driver)' })
  createCar(
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Body() dto: CreateCarDto,
  ) {
    return this.driversService.createCar(driverId, dto);
  }

  @ApiAccessTokenInSwagger()
  @Patch(':driverId/car')
  @ApiOperation({ summary: "Update a driver's car" })
  updateCar(
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Body() dto: UpdateCarDto,
  ) {
    return this.driversService.updateCar(driverId, dto);
  }

  @ApiAccessTokenInSwagger()
  @Delete(':driverId/car')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove a driver's car" })
  async removeCar(@Param('driverId', ParseUUIDPipe) driverId: string) {
    await this.driversService.removeCar(driverId);
  }

  @ApiAccessTokenInSwagger()
  @Get(':driverId')
  @ApiOperation({ summary: 'Get driver by id' })
  findOne(@Param('driverId', ParseUUIDPipe) driverId: string) {
    return this.driversService.findOne(driverId);
  }

  @Patch(':driverId')
  @ApiOperation({ summary: 'Update driver' })
  update(
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Body() dto: UpdateDriverDto,
  ) {
    return this.driversService.update(driverId, dto);
  }

  @ApiAccessTokenInSwagger()
  @Delete(':driverId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete driver' })
  async remove(@Param('driverId', ParseUUIDPipe) driverId: string) {
    await this.driversService.remove(driverId);
  }
}
