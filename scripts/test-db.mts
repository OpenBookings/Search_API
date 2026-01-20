/**
 * Test database connection — run with: npx tsx scripts/test-db.mts
 */

import { getClient, query } from "../database/index.js";

function elapsed(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

async function main() {
  console.log("Testing DB connection...\n");

  // connect to the database
  const t0 = performance.now();
  const client = await getClient();
  try {
    console.log(`Client connected (${elapsed(performance.now() - t0)})\n`);

    // Properties query
    const t2 = performance.now();
    try {
      const output = await query<{ one: number }>("SELECT * FROM properties LIMIT 1");
      console.log(`✓ query OK (${elapsed(performance.now() - t2)}):`, JSON.stringify(output, null, 2));
    } catch (e) {
      console.error("❌ query failed:", e);
      process.exit(1);
    }
  } finally {
    client.release();
  }
  console.log("\nConnection test passed. Finished successfully.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});