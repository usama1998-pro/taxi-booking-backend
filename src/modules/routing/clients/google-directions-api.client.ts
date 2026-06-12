import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { getRoutingConfig } from '../routing.config';
import type {
  GoogleDirectionsResponse,
  GoogleDirectionsResult,
  GoogleMapsCoordinate,
} from '../types/google-maps.types';

@Injectable()
export class GoogleDirectionsApiClient {
  private readonly logger = new Logger(GoogleDirectionsApiClient.name);

  constructor(private readonly http: HttpService) {}

  async getDrivingRoute(
    coordinates: GoogleMapsCoordinate[],
  ): Promise<GoogleDirectionsResult> {
    if (coordinates.length < 2) {
      throw new Error('At least two coordinates are required for routing');
    }

    const origin = this.formatCoordinate(coordinates[0]);
    const destination = this.formatCoordinate(coordinates[coordinates.length - 1]);
    const waypoints = coordinates
      .slice(1, -1)
      .map((point) => this.formatCoordinate(point))
      .join('|');

    this.logger.debug(
      `Google Directions request: ${origin} -> ${destination}${waypoints ? ` via ${waypoints}` : ''}`,
    );

    const config = getRoutingConfig();
    const params: Record<string, string> = {
      origin,
      destination,
      mode: 'driving',
      units: 'metric',
      key: config.googleMapsApiKey,
      region: config.region,
    };

    if (waypoints) {
      params.waypoints = waypoints;
    }

    return this.requestDirections(params);
  }

  /** Uses address text so Google snaps to the same road entry points as Maps UI. */
  async getDrivingRouteBetweenAddresses(
    from: string,
    to: string,
  ): Promise<GoogleDirectionsResult> {
    const origin = from.trim();
    const destination = to.trim();
    if (!origin || !destination) {
      throw new Error('Origin and destination addresses are required');
    }

    this.logger.debug(`Google Directions request: ${origin} -> ${destination}`);

    const config = getRoutingConfig();
    return this.requestDirections({
      origin,
      destination,
      mode: 'driving',
      units: 'metric',
      key: config.googleMapsApiKey,
      region: config.region,
    });
  }

  private async requestDirections(params: Record<string, string>) {
    const url = 'https://maps.googleapis.com/maps/api/directions/json';

    const { data } = await firstValueFrom(
      this.http.get<GoogleDirectionsResponse>(url, { params }),
    );

    if (data.status !== 'OK') {
      throw new Error(
        data.error_message ||
          `Google Directions failed with status "${data.status}"`,
      );
    }

    const legs = data.routes?.[0]?.legs;
    if (!legs?.length) {
      throw new Error('Google Directions returned no route');
    }

    const distanceMeters = legs.reduce(
      (total, leg) => total + leg.distance.value,
      0,
    );
    const durationSeconds = legs.reduce(
      (total, leg) => total + leg.duration.value,
      0,
    );

    return { distanceMeters, durationSeconds };
  }

  private formatCoordinate(point: GoogleMapsCoordinate): string {
    return `${point.latitude},${point.longitude}`;
  }
}
