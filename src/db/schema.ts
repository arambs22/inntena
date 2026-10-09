import { pgTable, serial, text, integer, timestamp, unique, boolean } from "drizzle-orm/pg-core";

/** Registered users. Passwords are stored as bcrypt hashes, never in plain text. */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  historyRetentionDays: integer("history_retention_days").notNull().default(15),
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