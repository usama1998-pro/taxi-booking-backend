import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { getRoutingConfig } from '../routing.config';
import type {
  GooglePlacesAutocompleteResponse,
  PlaceSuggestion,
} from '../types/google-maps.types';

@Injectable()
export class GooglePlacesApiClient {
  private readonly logger = new Logger(GooglePlacesApiClient.name);

  constructor(private readonly http: HttpService) {}

  async searchPlaces(input: string): Promise<PlaceSuggestion[]> {
    const query = input.trim();
    if (!query) {
      return [];
    }

    const config = getRoutingConfig();
    const url =
      'https://maps.googleapis.com/maps/api/place/autocomplete/json';

    this.logger.debug(`Places autocomplete: ${query}`);

    const components = config.countryCodes
      .map((code) => `country:${code}`)
      .join('|');

    const { data } = await firstValueFrom(
      this.http.get<GooglePlacesAutocompleteResponse>(url, {
        params: {
          input: query,
          key: config.googleMapsApiKey,
          components,
          region: config.region,
        },
      }),
    );

    if (data.status === 'ZERO_RESULTS') {
      return [];
    }

    if (data.status !== 'OK') {
      throw new Error(
        data.error_message ||
          `Google Places autocomplete failed with status "${data.status}"`,
      );
    }

    return (data.predictions ?? []).map((prediction) => ({
      description: prediction.description,
      placeId: prediction.place_id,
    }));
  }
}
