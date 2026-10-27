ALTER TABLE "platform_sessions" ADD COLUMN IF NOT EXISTS "last_rotated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform_sessions" ADD COLUMN IF NOT EXISTS "token_family_history" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_platform_sessions_last_rotated" ON "platform_sessions" USING btree ("last_rotated_at");