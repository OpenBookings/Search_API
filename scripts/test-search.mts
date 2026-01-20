/**
 * Test search pipeline with real DB — run with: npx tsx scripts/test-search.mts
 *
 * Uses the database connection from database/index.ts (via candidate → runCandidateQuery → query).
 * 1. Verifies DB connectivity
 * 2. Runs candidate stage (DB-backed) and logs counts
 * 3. Runs full search pipeline and logs the result
 * 4. Closes the pool on exit
 */

import "dotenv/config";
import { query, close } from "../database/index.js";
import { buildSearchPlan } from "../services/search/search.plan.js";
import { candidate } from "../services/search/stages/candidate.stage.js";

function elapsed(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

const input = {
  latitude: 52.3676,
  longitude: 4.9041,
  checkIn: "2026-01-12",
  checkOut: "2026-01-14",
  adults: 2,
  filters: {
    radiusKm: 100,
  }
};

async function main() {
  const t0 = performance.now();
  try {
    console.log("Test search (DB-backed candidate stage)\n");
    console.log("Input:", input, "\n");

    // 2. Candidate stage (DB: capacity, PostGIS lat/lon+radius, hard limit)
    const t1 = performance.now();
    const plan = buildSearchPlan(input);
    const candidates = await candidate(plan);
    console.log(`✓ Candidate stage: ${candidates.length} candidates (${elapsed(performance.now() - t1)})`);
    if (candidates.length > 0) {
      const sample = candidates.slice(0, 3).map((c) => ({ id: c.id, name: c.name, location: c.location, distance_meters: c.distance_meters }));
      console.log("  Sample:", JSON.stringify(sample, null, 2));
    }
    console.log("");
  } finally {
    await close().catch(() => {});
  }
  console.log(`Total time: ${elapsed(performance.now() - t0)}`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
