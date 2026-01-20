import type { AvailableProperty, PricedProperty, SearchPlan } from "../types.js";

/** Pricing stage: attach totalPrice, currency, breakdown. (Stub: returns [].) */
export async function pricing(
  plan: SearchPlan,
  properties: AvailableProperty[]
): Promise<PricedProperty[]> {
  void plan;
  void properties;
  return [];
}
