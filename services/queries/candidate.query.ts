/**
 * Candidate query — fetch property candidates from the database.
 *
 * Applies:
 * - Capacity filter: {capacityColumn} >= plan.guests when options.capacityColumn is set
 *   (e.g. 'max_guests', 'maximum_guests', 'capacity')
 * - PostGIS spatial filter: ST_DWithin(geoColumn, point, radius) using plan.geo (lat/lon) and plan.radius
 *   (options.geoColumn defaults to 'location'; use 'geo' if your schema names it that)
 * - Hard limit: CANDIDATE_HARD_LIMIT (overridable via options.candidateHardLimit, capped)
 *
 * Schema: at minimum id, name. For capacity: max_guests (or options.capacityColumn).
 * For PostGIS: geography/geometry column (options.geoColumn, default 'location').
 * Optional: property_type, amenities, bedrooms, bathrooms, destination_id.
 *
 * Index for spatial: CREATE INDEX idx_properties_geo ON properties USING GIST (location);
 */

import { query } from "../../plugin/db.ts";
import type { CandidateProperty, SearchPlan } from "../types.ts";

// ─── Hard limits ────────────────────────────────────────────────────────────

/** Maximum candidate rows returned per search. Prevents unbounded result sets. */
export const CANDIDATE_HARD_LIMIT = 1_000;

/** Ceiling when overriding via plan.options.candidateHardLimit. */
const CANDIDATE_HARD_LIMIT_MAX = 3_000;

function resolveCandidateLimit(plan: SearchPlan): number {
  const opt = plan.options?.candidateHardLimit;
  if (typeof opt === "number" && Number.isFinite(opt) && opt > 0) {
    return Math.min(Math.floor(opt), CANDIDATE_HARD_LIMIT_MAX);
  }
  return CANDIDATE_HARD_LIMIT;
}

// ─── Column opt-in (safe names) ─────────────────────────────────────────────

const CAPACITY_COLUMNS = ["max_guests", "maximum_guests", "capacity"] as const;
const GEO_COLUMNS = ["location", "geo"] as const;

function getCapacityColumn(plan: SearchPlan): (typeof CAPACITY_COLUMNS)[number] | null {
  const c = plan.options?.capacityColumn;
  if (typeof c === "string" && CAPACITY_COLUMNS.includes(c as (typeof CAPACITY_COLUMNS)[number]))
    return c as (typeof CAPACITY_COLUMNS)[number];
  return null;
}

function getGeoColumn(plan: SearchPlan): (typeof GEO_COLUMNS)[number] {
  const c = plan.options?.geoColumn;
  if (typeof c === "string" && GEO_COLUMNS.includes(c as (typeof GEO_COLUMNS)[number]))
    return c as (typeof GEO_COLUMNS)[number];
  return "location";
}

// ─── Query builder ──────────────────────────────────────────────────────────

function buildCandidateSql(plan: SearchPlan): { text: string; values: unknown[] } {
  const conditions: string[] = [];
  const values: unknown[] = [];
  const selectParts: string[] = ["p.id", "p.name", "p.city", "p.country"];

  let pos = 1;

  // --- Capacity ---
  const capCol = getCapacityColumn(plan);
  if (capCol) {
    conditions.push(`p.${capCol} >= $${pos}`);
    values.push(plan.guests);
    pos++;

    if (capCol === "maximum_guests") selectParts.push("p.maximum_guests AS max_guests");
    else if (capCol === "capacity") selectParts.push("p.capacity AS max_guests");
    else selectParts.push("p.max_guests");
  }

  // --- Geo ---
  const geoCol = getGeoColumn(plan); // e.g. "location"
  let withParams = "";

  if (plan.geo) {
    // longitude, latitude as parameters
    values.push(plan.geo.lon, plan.geo.lat);
    const lonParam = pos++;
    const latParam = pos++;

    withParams = `
WITH params AS (
  SELECT
    ST_SetSRID(ST_MakePoint($${lonParam}, $${latParam}), 4326)::geography AS p
)`;

    conditions.push(
      `ST_DWithin(p.${geoCol}::geography, params.p, $${pos})`
    );
    values.push(plan.radius * 1000); // meters
    pos++;

    selectParts.push(
      `ST_Distance(p.${geoCol}::geography, params.p) AS distance_meters`
    );
  }

  // --- Limit ---
  const hardLimit = resolveCandidateLimit(plan);
  values.push(hardLimit);
  const limitParam = pos;

  const whereClause = conditions.length ? conditions.join(" AND ") : "TRUE";

  const text = `
${withParams}
SELECT ${selectParts.join(", ")}
FROM properties p
${plan.geo ? ", params" : ""}
WHERE ${whereClause}
ORDER BY p.id
LIMIT $${limitParam};
`.trim();

  return { text, values };
}


// ─── Row mapping ─────────────────────────────────────────────────────────────

interface CandidateRow {
  id: string;
  name: string | null;
  city: string | null;
  country: string | null;
  distance_meters: string | null;
  max_guests?: number | null;
  destination_id?: string | null;
}

function mapRowToCandidate(r: CandidateRow): CandidateProperty {
  return {
    id: String(r.id),
    name: r.name ?? "",
    propertyType: undefined,
    location: [r.city, r.country].filter(Boolean).join(", ") || undefined,
    distance_meters: r.distance_meters != null ? `${Math.floor(Number(r.distance_meters))} Meters` : undefined,
    destinationId: r.destination_id ?? undefined,
    amenities: undefined,
    bedrooms: undefined,
    bathrooms: undefined,
    maxGuests: r.max_guests != null ? Number(r.max_guests) : undefined,
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Run the candidate query: capacity, PostGIS spatial filter (lat/lon + radius), and hard limit.
 * Returns properties mapped to CandidateProperty.
 */
export async function runCandidateQuery(plan: SearchPlan): Promise<CandidateProperty[]> {
  const { text, values } = buildCandidateSql(plan);
  const t0 = performance.now();
  const rows = await query<Record<string, unknown>>(text, values);
  const t1 = performance.now();
  console.log(`Query time: ${Math.round(t1 - t0)}ms`);
  return rows.map((r: Record<string, unknown>) => mapRowToCandidate(r as unknown as CandidateRow));
}
