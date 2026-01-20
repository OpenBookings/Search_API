/**
 * Search Service — Table of contents
 *
 * Orchestrates the search pipeline: plan → candidate → availability → stayRules
 * → pricing → ranking → pagination. Returns the paginated SearchResult.
 */

import { buildSearchPlan } from "./search.plan.js";
import type { SearchInput, SearchResult } from "./types.js";

// ─── Stages (table of contents) ─────────────────────────────────────────────

import { candidate } from "./stages/candidate.stage.js";
import { availability } from "./stages/availability.stage.js";
import { stayRules } from "./stages/stayRules.stage.js";
import { pricing } from "./stages/pricing.stage.js";
import { ranking } from "./stages/ranking.stage.js";
import { pagination } from "./stages/pagination.stage.js";

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Run the full search pipeline and return a result.
 */
export async function search(input: SearchInput): Promise<SearchResult> {
  // 1. Build plan (validates input, normalizes)
  const plan = buildSearchPlan(input);

  // 2. Candidate — resolve plan → property candidates
  const candidates = await candidate(plan);

  // 3. Availability — filter by availability for check-in/out
  const available = await availability(plan, candidates);

  // 4. Stay rules — min/max stay, arrival rules
  const afterStayRules = await stayRules(plan, available);

  // 5. Pricing — attach totalPrice, currency, breakdown
  const priced = await pricing(plan, afterStayRules);

  // 6. Ranking — sort by relevance, price, etc.
  const ranked = await ranking(plan, priced);

  // 7. Pagination — page, pageSize, total, totalPages
  return pagination(plan, ranked);
}
