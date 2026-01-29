import type { SearchInput, SearchPlan } from "./types.js";

// ─── Domain validation errors ───────────────────────────────────────────────

export const SearchPlanErrorCode = {
  INVALID_CHECK_IN: "INVALID_CHECK_IN",
  INVALID_CHECK_OUT: "INVALID_CHECK_OUT",
  INVALID_LATITUDE: "INVALID_LATITUDE",
  INVALID_LONGITUDE: "INVALID_LONGITUDE",
  ARRIVAL_AFTER_DEPARTURE: "ARRIVAL_AFTER_DEPARTURE",
  STAY_TOO_SHORT: "STAY_TOO_SHORT",
  NO_GUESTS: "NO_GUESTS",
  INVALID_GUEST_COUNTS: "INVALID_GUEST_COUNTS",
} as const;

export type SearchPlanErrorCode =
  (typeof SearchPlanErrorCode)[keyof typeof SearchPlanErrorCode];

export class SearchPlanValidationError extends Error {
  readonly code: SearchPlanErrorCode;

  constructor(code: SearchPlanErrorCode, message: string) {
    super(message);
    this.name = "SearchPlanValidationError";
    this.code = code;
    Object.setPrototypeOf(this, SearchPlanValidationError.prototype);
  }
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_RADIUS_KM = 10;
const MIN_RADIUS_KM = 1;
const MAX_RADIUS_KM = 500;
const MIN_PAGE = 1;
const MIN_PAGE_SIZE = 1;
const MAX_PAGE_SIZE = 100;

const LAT_MIN = -90;
const LAT_MAX = 90;
const LON_MIN = -180;
const LON_MAX = 180;

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Parse check-in or check-out string to Date; throws on invalid. */
function parseDate(value: unknown, field: "checkIn" | "checkOut"): Date {
  if (typeof value !== "string" || value.trim() === "") {
    throw new SearchPlanValidationError(
      field === "checkIn" ? SearchPlanErrorCode.INVALID_CHECK_IN : SearchPlanErrorCode.INVALID_CHECK_OUT,
      `${field} must be a non-empty ISO 8601 date string`
    );
  }
  const d = new Date(value.trim());
  if (Number.isNaN(d.getTime())) {
    throw new SearchPlanValidationError(
      field === "checkIn" ? SearchPlanErrorCode.INVALID_CHECK_IN : SearchPlanErrorCode.INVALID_CHECK_OUT,
      `${field} could not be parsed as a valid date: "${value}"`
    );
  }
  return d;
}

/** Parse and clamp numeric value with default when missing or invalid. */
function parseNumber(value: unknown, defaultVal: number, min: number, max: number): number {
  if (value === undefined || value === null) return defaultVal;
  const n = Number(value);
  if (!Number.isFinite(n)) return defaultVal;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** Validate and return geo from input.latitude and input.longitude; throws on invalid. */
function parseGeo(input: SearchInput): { lat: number; lon: number } {
  const la = Number(input.latitude);
  const lo = Number(input.longitude);
  if (!Number.isFinite(la)) {
    throw new SearchPlanValidationError(SearchPlanErrorCode.INVALID_LATITUDE, "latitude must be a finite number");
  }
  if (la < LAT_MIN || la > LAT_MAX) {
    throw new SearchPlanValidationError(SearchPlanErrorCode.INVALID_LATITUDE, `latitude must be between ${LAT_MIN} and ${LAT_MAX}`);
  }
  if (!Number.isFinite(lo)) {
    throw new SearchPlanValidationError(SearchPlanErrorCode.INVALID_LONGITUDE, "longitude must be a finite number");
  }
  if (lo < LON_MIN || lo > LON_MAX) {
    throw new SearchPlanValidationError(SearchPlanErrorCode.INVALID_LONGITUDE, `longitude must be between ${LON_MIN} and ${LON_MAX}`);
  }
  return { lat: la, lon: lo };
}

/** Extract search radius in km from filters; default 5, clamped 1–500. */
function extractRadiusKm(filters: Record<string, unknown> | undefined): number {
  if (!filters || typeof filters !== "object") return DEFAULT_RADIUS_KM;
  const r = filters.radiusKm ?? filters.radius;
  if (r === undefined || r === null) return DEFAULT_RADIUS_KM;
  const n = Number(r);
  if (!Number.isFinite(n)) return DEFAULT_RADIUS_KM;
  return Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, n));
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Build an immutable SearchPlan from validated SearchInput. */
export function buildSearchPlan(input: SearchInput): SearchPlan {
  const checkInDate = parseDate(input.checkIn, "checkIn");
  const checkOutDate = parseDate(input.checkOut, "checkOut");

  if (checkInDate.getTime() >= checkOutDate.getTime()) {
    throw new SearchPlanValidationError(
      SearchPlanErrorCode.ARRIVAL_AFTER_DEPARTURE,
      "Arrival date must be before departure date"
    );
  }

  const nights = Math.floor((checkOutDate.getTime() - checkInDate.getTime()) / MS_PER_DAY);
  if (nights < 1) {
    throw new SearchPlanValidationError(
      SearchPlanErrorCode.STAY_TOO_SHORT,
      "Stay must be at least 1 night"
    );
  }

  const adults = Number(input.adults);
  const children = Number(input.children ?? 0);
  if (!Number.isFinite(adults) || adults < 0 || !Number.isFinite(children) || children < 0) {
    throw new SearchPlanValidationError(
      SearchPlanErrorCode.INVALID_GUEST_COUNTS,
      "Adults and children must be non‑negative numbers"
    );
  }

  const guests = adults + children;
  if (guests <= 0) {
    throw new SearchPlanValidationError(
      SearchPlanErrorCode.NO_GUESTS,
      "Total guest count must be greater than 0"
    );
  }

  const page = parseNumber(input.page, DEFAULT_PAGE, MIN_PAGE, Number.MAX_SAFE_INTEGER);
  const pageSize = parseNumber(input.pageSize, DEFAULT_PAGE_SIZE, MIN_PAGE_SIZE, MAX_PAGE_SIZE);

  const geo = parseGeo(input);
  const radius = extractRadiusKm(input.filters);
  const hasChildren = children > 0;

  const plan: SearchPlan = {
    input,
    checkInDate,
    checkOutDate,
    nights,
    guests,
    page,
    pageSize,
    geo,
    radius,
    hasChildren,
    options: input.filters ? { ...input.filters } : undefined,
  };

  Object.freeze(plan.geo);
  return Object.freeze(plan) as SearchPlan;
}
