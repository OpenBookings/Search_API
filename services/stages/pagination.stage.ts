import type { PricedProperty, SearchResult, SearchPlan } from "../types.js";

/** Pagination stage: page, pageSize, total, totalPages. (Stub: passthrough shape.) */
export async function pagination(
  plan: SearchPlan,
  properties: PricedProperty[]
): Promise<SearchResult> {
  const total = properties.length;
  const totalPages = Math.max(1, Math.ceil(total / plan.pageSize));
  const start = (plan.page - 1) * plan.pageSize;
  const page = properties.slice(start, start + plan.pageSize);
  return {
    properties: page,
    pagination: {
      page: plan.page,
      pageSize: plan.pageSize,
      total,
      totalPages,
    },
  };
}
