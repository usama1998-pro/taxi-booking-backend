import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { getRoutingConfig } from './routing.config';
import { GoogleDirectionsApiClient } from './clients/google-directions-api.client';
import { GoogleGeocodingApiClient } from './clients/google-geocoding-api.client';
import { GooglePlacesApiClient } from './clients/google-places-api.client';
import { RoutingController } from './routing.controller';
import { RoutingService } from './routing.service';

@Module({
  imports: [
    HttpModule.registerAsync({
      useFactory: () => {
        const { requestTimeoutMs } = getRoutingConfig();
        return {
          timeout: requestTimeoutMs,
          maxRedirects: 0,
        };
      },
    }),
  ],
  controllers: [RoutingController],
  providers: [
    GoogleGeocodingApiClient,
    GoogleDirectionsApiClient,
    GooglePlacesApiClient,
    RoutingService,
  ],
  exports: [
    RoutingService,
    GoogleGeocodingApiClient,
    GoogleDirectionsApiClient,
    GooglePlacesApiClient,
  ],
})
export class RoutingModule {}
