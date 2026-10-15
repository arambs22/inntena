CREATE TABLE "etsy_listing_samples" (
	"key" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp NOT NULL
);
--> statement-breakpoint
DROP TABLE "etsy_supply";--> statement-breakpoint
CREATE TABLE "etsy_supply" (
	"term" text NOT NULL,
	"taxonomy_id" integer DEFAULT 0 NOT NULL,
	"shop_location" text DEFAULT '' NOT NULL,
	"listing_count" integer NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "etsy_supply_term_taxonomy_id_shop_location_pk" PRIMARY KEY("term","taxonomy_id","shop_location")
);
--> statement-breakpoint
ALTER TABLE "keywords" ADD COLUMN "etsy_taxonomy_id" integer;
