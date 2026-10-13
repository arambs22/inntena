CREATE TABLE "etsy_supply" (
	"term" text PRIMARY KEY NOT NULL,
	"listing_count" integer NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "terms_accepted_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "terms_version" text;