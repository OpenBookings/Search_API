import type { AvailableProperty, SearchPlan } from "../types.js";

/** Stay-rules stage: apply min/max stay, arrival rules. (Stub: pass-through.) */
export async function stayRules(
  plan: SearchPlan,
  properties: AvailableProperty[]
): Promise<AvailableProperty[]> {
  void plan;
  return properties;
}
