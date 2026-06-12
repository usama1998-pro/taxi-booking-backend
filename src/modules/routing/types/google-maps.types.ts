export type PlaceSuggestion = {
  description: string;
  placeId: string;
};

export type GeocodedLocation = {
  address: string;
  latitude: number;
  longitude: number;
};

export type GoogleMapsCoordinate = {
  latitude: number;
  longitude: number;
};

export type GoogleDirectionsResult = {
  distanceMeters: number;
  durationSeconds: number;
};

export type GoogleGeocodeResponse = {
  status: string;
  results?: Array<{
    formatted_address: string;
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
    };
  }>;
  error_message?: string;
};

export type GoogleDirectionsResponse = {
  status: string;
  routes?: Array<{
    legs: Array<{
      distance: { value: number };
      duration: { value: number };
    }>;
  }>;
  error_message?: string;
};

export type GooglePlacesAutocompleteResponse = {
  status: string;
  predictions?: Array<{
    description: string;
    place_id: string;
  }>;
  error_message?: string;
};
