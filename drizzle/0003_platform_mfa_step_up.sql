CREATE TABLE IF NOT EXISTS "platform_mfa_credentials" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"encrypted_secret" text NOT NULL,
	"secret_iv" varchar(64) NOT NULL,
	"secret_tag" varchar(64) NOT NULL,
	"recovery_code_hashes" text NOT NULL,
	"last_used_step" integer,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"step_up_verified_at" timestamp with time zone,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_mfa_credentials_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "platform_mfa_credentials_user_id_platform_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "platform_users"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_mfa_credentials_user" ON "platform_mfa_credentials" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "platform_sessions" ADD COLUMN IF NOT EXISTS "mfa_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_sessions" ADD COLUMN IF NOT EXISTS "step_up_completed_at" timestamp with time zone;
