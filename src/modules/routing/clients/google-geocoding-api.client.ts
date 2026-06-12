import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { getRoutingConfig } from '../routing.config';
import type {
  GeocodedLocation,
  GoogleGeocodeResponse,
} from '../types/google-maps.types';

@Injectable()
export class GoogleGeocodingApiClient {
  private readonly logger = new Logger(GoogleGeocodingApiClient.name);

  constructor(private readonly http: HttpService) {}

  async geocodeAddress(address: string): Promise<GeocodedLocation> {
    const query = address.trim();
    if (!query) {
      throw new Error('Address is required');
    }

    const config = getRoutingConfig();
    const url = 'https://maps.googleapis.com/maps/api/geocode/json';

    this.logger.debug(`Geocoding address: ${query}`);

    const components = config.countryCodes
      .map((code) => `country:${code}`)
      .join('|');

    const { data } = await firstValueFrom(
      this.http.get<GoogleGeocodeResponse>(url, {
        params: {
          address: query,
          key: config.googleMapsApiKey,
          components,
          region: config.region,
        },
      }),
    );

    if (data.status !== 'OK' || !data.results?.length) {
      throw new Error(
        data.error_message ||
          `Could not find coordinates for "${query}" in Spain`,
      );
    }

    const match = data.results[0];
    const latitude = match.geometry.location.lat;
    const longitude = match.geometry.location.lng;

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error(`Invalid coordinates returned for "${query}"`);
    }

    return {
      address: match.formatted_address,
      latitude,
      longitude,
    };
  }
}
