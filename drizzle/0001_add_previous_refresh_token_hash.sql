ALTER TABLE "platform_sessions" ADD COLUMN IF NOT EXISTS "previous_refresh_token_hash" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_platform_sessions_prev_rf_hash" ON "platform_sessions" USING btree ("previous_refresh_token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_platform_sessions_rf_hash" ON "platform_sessions" USING btree ("refresh_token_hash");