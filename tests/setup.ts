import { beforeEach, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "../src/db/client.js";

beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE TABLE auth_tokens, keyword_collection_status, related_queries, trend_snapshots, keywords, user_regions, etsy_supply, users RESTART IDENTITY CASCADE`
  );
});

afterAll(async () => {
  await pool.end();
});
