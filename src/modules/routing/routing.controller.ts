import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { PlacesSearchDto } from './dto/places-search.dto';
import { RouteQuoteDto } from './dto/route-quote.dto';
import { RoutingService } from './routing.service';

@ApiTags('routing')
@Controller('routing')
export class RoutingController {
  constructor(private readonly routing: RoutingService) {}

  @Public()
  @Post('places')
  @ApiOperation({
    summary: 'Search places for address autocomplete',
    description:
      'Returns address suggestions from Google Places Autocomplete, restricted to configured countries.',
  })
  places(@Body() dto: PlacesSearchDto) {
    return this.routing.searchPlaces(dto.input);
  }

  @Public()
  @Post('quote')
  @ApiOperation({
    summary: 'Get driving distance and fare quote',
    description:
      'Geocodes pickup/drop-off, queries Google Directions for driving distance, and returns the estimated fare using passenger/luggage tiers plus distance-based surcharges.',
  })
  @ApiResponse({
    status: 400,
    description: 'Address could not be geocoded or route not found',
  })
  quote(@Body() dto: RouteQuoteDto) {
    return this.routing.getQuote(dto);
  }
}
