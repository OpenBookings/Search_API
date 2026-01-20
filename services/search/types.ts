// ─── SearchInput ─────────────────────────────────────────────────────────────
/** User-provided search request: latitude/longitude, check-in/out (ISO 8601), adults, optional children, page, pageSize, and extra filters. */
export interface SearchInput {
  latitude: number;
  longitude: number;
  checkIn: string;
  checkOut: string;
  adults: number;
  children?: number;
  page?: number;
  pageSize?: number;
  filters?: Record<string, unknown>;
}

// ─── SearchPlan ──────────────────────────────────────────────────────────────
/**
 * Resolved execution plan from SearchInput. Immutable; used by all downstream search stages.
 * - input: raw validated input (read-only)
 * - checkInDate/checkOutDate: parsed Date objects for date arithmetic
 * - nights, guests: computed from dates and adults/children
 * - geo: center point from input.latitude/longitude (always set)
 * - radius: search radius in km (default when missing)
 * - hasChildren: convenience flag from children > 0
 */
export interface SearchPlan {
  input: SearchInput;
  checkInDate: Date;
  checkOutDate: Date;
  nights: number;
  guests: number;
  page: number;
  pageSize: number;
  geo: { lat: number; lon: number };
  radius: number;
  hasChildren: boolean;
  /**
   * Extra options (e.g. from input.filters or server-injected). Candidate query:
   * - candidateHardLimit: override CANDIDATE_HARD_LIMIT (capped at 50_000)
   * - capacityColumn: 'max_guests' | 'maximum_guests' | 'capacity' to enable capacity filter
   * - geoColumn: 'location' (default) | 'geo' for PostGIS spatial column name
   */
  options?: Record<string, unknown>;
}

// ─── CandidateProperty ───────────────────────────────────────────────────────
/** Property matching search criteria (candidate stage). No availability or pricing. Fields: id, name, propertyType, location, destinationId, amenities, bedrooms, bathrooms, maxGuests; index signature for extra source fields. */
export interface CandidateProperty {
  id: string;
  name: string;
  propertyType?: string;
  location?: string;
  /** Distance from search center in meters (when geo/PostGIS is used). */
  distance_meters?: string;
  destinationId?: string;
  amenities?: string[];
  bedrooms?: number;
  bathrooms?: number;
  maxGuests?: number;
  [key: string]: unknown;
}

// ─── AvailableProperty ───────────────────────────────────────────────────────
/** Candidate with availability for the requested dates. Adds available: true and optional unitId when multiple bookable units exist. */
export interface AvailableProperty extends CandidateProperty {
  available: true;
  unitId?: string;
}

// ─── PricedProperty ──────────────────────────────────────────────────────────
/** Available property with pricing: totalPrice, currency, optional pricePerNight and breakdown (e.g. base, fees, taxes). */
export interface PricedProperty extends AvailableProperty {
  totalPrice: number;
  currency: string;
  pricePerNight?: number;
  breakdown?: Record<string, number>;
}

// ─── SearchResult ────────────────────────────────────────────────────────────
/** Final API response: properties (PricedProperty[]), pagination (page, pageSize, total, totalPages). */
export interface SearchResult {
  properties: PricedProperty[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
