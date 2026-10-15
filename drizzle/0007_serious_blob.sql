CREATE TABLE "discover_rising" (
	"id" serial PRIMARY KEY NOT NULL,
	"seed" text NOT NULL,
	"query" text NOT NULL,
	"growth_value" text NOT NULL,
	"collected_at" timestamp DEFAULT now() NOT NULL
);
