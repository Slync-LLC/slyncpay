ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "two_factor_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "two_factor_enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subject_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"impersonator_id" uuid
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sessions_subject" ON "sessions" ("subject_id","subject_type","revoked_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sessions_expires" ON "sessions" ("expires_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"identifier_type" text NOT NULL,
	"purpose" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_email_otp_lookup" ON "email_otp_codes" ("identifier","identifier_type","purpose","used_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_email_otp_expires" ON "email_otp_codes" ("expires_at");
