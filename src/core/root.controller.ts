import { Controller, Get, Redirect } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { getSwaggerPath } from './swagger/setup-swagger';

@ApiTags('root')
@Controller()
export class RootController {
  @Get()
  @Redirect(`/${getSwaggerPath()}`, 302)
  @ApiOperation({ summary: 'Redirect to API documentation' })
  @ApiResponse({ status: 302, description: 'Swagger UI' })
  redirectToDocs(): void {
    return;
  }
}
