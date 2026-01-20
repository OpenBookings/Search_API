import type { PricedProperty, SearchPlan } from "../types.js";

/** Ranking stage: sort/rank by relevance, price, etc. (Stub: pass-through.) */
export async function ranking(
  plan: SearchPlan,
  properties: PricedProperty[]
): Promise<PricedProperty[]> {
  void plan;
  return properties;
}
