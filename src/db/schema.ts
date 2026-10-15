import { pgTable, serial, text, integer, timestamp, unique, boolean, primaryKey, jsonb } from "drizzle-orm/pg-core";

/** Registered users. Passwords are stored as bcrypt hashes, never in plain text. */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  historyRetentionDays: integer("history_retention_days").notNull().default(15),
  termsAcceptedAt: timestamp("terms_accepted_at"),
  termsVersion: text("terms_version"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Single-use, hashed tokens emailed for email verification and password reset. Only the hash is ever stored — same principle as passwordHash. */
export const authTokens = pgTable("auth_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  purpose: text("purpose").notNull(), // "verify_email" | "reset_password"
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Keywords tracked by a specific user; each keyword belongs to exactly one user. */
export const keywords = pgTable(
  "keywords",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    term: text("term").notNull(),
    category: text("category").notNull().default("General"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    removedAt: timestamp("removed_at"),
    autoCollectPaused: boolean("auto_collect_paused").notNull().default(false),
    /** When the keyword was pinned to the top of the list; null when not pinned. Cleared on archive. */
    pinnedAt: timestamp("pinned_at"),
    /** Etsy category used to scope this keyword's supply count and listing examples; null means all categories. */
    etsyTaxonomyId: integer("etsy_taxonomy_id"),
  },
  (table) => ({
    // Uniqueness is scoped per user: different users may track the
    // same term, but a single user cannot track it twice. This still
    // matches on archived rows too — POST /api/keywords handles
    // re-adding an archived term by restoring it instead of inserting
    // a duplicate, so this constraint never blocks that.
    uniqueUserTerm: unique().on(table.userId, table.term),
  })
);

export const trendSnapshots = pgTable(
  "trend_snapshots",
  {
    id: serial("id").primaryKey(),
    keywordId: integer("keyword_id")
      .notNull()
      .references(() => keywords.id, { onDelete: "cascade" }),
    geo: text("geo").notNull().default(""),
    date: text("date").notNull(),
    value: integer("value").notNull(),
    collectedAt: timestamp("collected_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueKeywordGeoDate: unique().on(table.keywordId, table.geo, table.date),
  })
);

export const relatedQueries = pgTable("related_queries", {
  id: serial("id").primaryKey(),
  keywordId: integer("keyword_id")
    .notNull()
    .references(() => keywords.id, { onDelete: "cascade" }),
  geo: text("geo").notNull().default(""),
  query: text("query").notNull(),
  growthValue: text("growth_value").notNull(),
  collectedAt: timestamp("collected_at").defaultNow().notNull(),
});

/** Regions a user tracks in their dashboard; drives which geos the scheduled collector must cover. Worldwide ("") is implicit and never stored here. */
export const userRegions = pgTable(
  "user_regions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    geo: text("geo").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueUserGeo: unique().on(table.userId, table.geo),
  })
);

/** Tracks the outcome of the most recent collection attempt per keyword+region, for both scheduled and manual runs. Powers the per-keyword blocked indicator in the dashboard. */
export const keywordCollectionStatus = pgTable(
  "keyword_collection_status",
  {
    id: serial("id").primaryKey(),
    keywordId: integer("keyword_id")
      .notNull()
      .references(() => keywords.id, { onDelete: "cascade" }),
    geo: text("geo").notNull().default(""),
    lastAttemptAt: timestamp("last_attempt_at").notNull(),
    lastSuccessAt: timestamp("last_success_at"),
    lastErrorMessage: text("last_error_message"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  },
  (table) => ({
    uniqueKeywordGeo: unique().on(table.keywordId, table.geo),
  })
);

/**
 * Latest Etsy active-listing count per normalized search term, Etsy category and seller country. Shared by all
 * users: one cache key costs one Etsy request per refresh window no matter how many people need it. `taxonomyId` 0
 * means all categories and `shopLocation` '' means sellers anywhere; non-null sentinels keep the primary key simple.
 * One row per key, overwritten on refresh — Etsy's terms forbid keeping its content longer than needed.
 */
export const etsySupply = pgTable(
  "etsy_supply",
  {
    term: text("term").notNull(),
    taxonomyId: integer("taxonomy_id").notNull().default(0),
    shopLocation: text("shop_location").notNull().default(""),
    listingCount: integer("listing_count").notNull(),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.term, table.taxonomyId, table.shopLocation] }),
  })
);

/** One Etsy listing as shown to users, exactly as Etsy returned it. Nothing else from the listing is kept. */
export interface ListingSampleRow {
  listingId: number;
  title: string;
  price: number | null;
  currency: string | null;
  url: string;
  thumbnailUrl: string | null;
  favorites: number;
  views: number;
}

/**
 * Up to five example listings per normalized term and Etsy category (`key` = "term|taxonomyId"), shown for at most
 * six hours and then deleted, as Etsy's terms require for listing content.
 */
export const etsyListingSamples = pgTable("etsy_listing_samples", {
  key: text("key").primaryKey(),
  payload: jsonb("payload").$type<ListingSampleRow[]>().notNull(),
  fetchedAt: timestamp("fetched_at").notNull(),
});
