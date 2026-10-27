ALTER TABLE "platform_users" ADD COLUMN IF NOT EXISTS "mfa_secret_encrypted" text;
--> statement-breakpoint
ALTER TABLE "platform_users" ADD COLUMN IF NOT EXISTS "mfa_pending_secret_encrypted" text;
--> statement-breakpoint
ALTER TABLE "platform_users" ADD COLUMN IF NOT EXISTS "mfa_recovery_code_hashes" text;
--> statement-breakpoint
ALTER TABLE "platform_users" ADD COLUMN IF NOT EXISTS "mfa_last_totp_step" bigint;
--> statement-breakpoint
ALTER TABLE "platform_users" ADD COLUMN IF NOT EXISTS "mfa_failed_attempts" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "platform_users" ADD COLUMN IF NOT EXISTS "mfa_locked_until" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "platform_sessions" ADD COLUMN IF NOT EXISTS "mfa_verified_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "platform_sessions" ADD COLUMN IF NOT EXISTS "mfa_step_up_until" timestamp with time zone;
