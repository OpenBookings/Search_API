import { z } from "zod";
import { SearchQuerySchema } from "./search.validator.ts";
import { coordTransform } from "./coord-transform.ts";

export async function search(queryParams: z.input<typeof SearchQuerySchema>) {
    const query = SearchQuerySchema.safeParse(queryParams);

    if (!query.success) {
        const errorMessages = query.error.issues.map((e) => {
            const path = e.path.length ? e.path.join('.') : 'value';
            return `${path}: ${e.message}`;
        }).join("; ");
        return {
            error: `Invalid query parameters: ${errorMessages}`,
            status: 400,
        };
    }

    const output = await coordTransform(query.data.lat, query.data.lon);

    return {
        results: output,
    };
}