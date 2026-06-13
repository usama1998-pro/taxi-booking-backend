import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  calculateBookingPrice,
  calculateDistanceSurcharge,
  calculatePassengerLuggageFare,
  DISTANCE_SHORT_TRIP_MAX_KM,
} from '../bookings/booking-pricing';
import { GoogleDirectionsApiClient } from './clients/google-directions-api.client';
import { GooglePlacesApiClient } from './clients/google-places-api.client';
import type { RouteQuoteDto } from './dto/route-quote.dto';

export type RouteQuoteResult = {
  distanceKm: number;
  distanceSurchargeEur: number;
  baseFareEur: number;
  estimatedPriceEur: number;
  durationMinutes: number;
};

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  constructor(
    private readonly places: GooglePlacesApiClient,
    private readonly directions: GoogleDirectionsApiClient,
  ) {}

  searchPlaces(input: string) {
    return this.places.searchPlaces(input);
  }

  async getDrivingDistanceKm(from: string, to: string): Promise<number> {
    const route = await this.getDrivingRouteBetween(from, to);
    return route.distanceMeters / 1000;
  }

  async getQuote(dto: RouteQuoteDto): Promise<RouteQuoteResult> {
    const route = await this.getDrivingRouteBetween(dto.from, dto.to);
    const distanceKm = route.distanceMeters / 1000;
    const infantCarrierCount = dto.infantCarrierCount ?? 0;
    const childSeatCount = dto.childSeatCount ?? 0;
    const boosterCount = dto.boosterCount ?? 0;
    const isReturnTrip = Boolean(dto.isReturnTrip);

    const passengerLuggageFare = calculatePassengerLuggageFare(
      dto.passengerCount,
      dto.luggageCount,
    );
    const distanceSurchargeEur =
      distanceKm >= DISTANCE_SHORT_TRIP_MAX_KM
        ? calculateDistanceSurcharge(distanceKm)
        : 0;
    const estimatedPriceEur = calculateBookingPrice({
      passengerCount: dto.passengerCount,
      luggageCount: dto.luggageCount,
      infantCarrierCount,
      childSeatCount,
      boosterCount,
      isReturnTrip,
      distanceKm,
    });

    return {
      distanceKm: Math.round(distanceKm * 10) / 10,
      distanceSurchargeEur: Math.round(distanceSurchargeEur),
      baseFareEur: passengerLuggageFare,
      estimatedPriceEur,
      durationMinutes: Math.round(route.durationSeconds / 60),
    };
  }

  private async getDrivingRouteBetween(from: string, to: string) {
    try {
      return await this.directions.getDrivingRouteBetweenAddresses(from, to);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'Routing request failed';
      this.logger.warn(`Google Directions routing failed: ${detail}`);
      throw new BadRequestException(
        'Could not find a driving route between pickup and drop-off. Please check the addresses and try again.',
      );
    }
  }
}
