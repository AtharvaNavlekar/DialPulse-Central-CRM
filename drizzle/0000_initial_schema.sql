CREATE TABLE "audit_logs" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"actor_id" varchar(64) NOT NULL,
	"actor_email" varchar(255) NOT NULL,
	"actor_role" varchar(50) NOT NULL,
	"action" varchar(100) NOT NULL,
	"target_type" varchar(50) NOT NULL,
	"target_id" varchar(128),
	"result" varchar(20) NOT NULL,
	"ip_address" varchar(64),
	"user_agent" text,
	"details" text,
	"impersonation_context" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_records" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"invoice_number" varchar(100) NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(10) DEFAULT 'INR' NOT NULL,
	"status" varchar(50) NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_records_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"key" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"is_globally_enabled" boolean DEFAULT false NOT NULL,
	"rollout_percentage" integer DEFAULT 0 NOT NULL,
	"target_tenants" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_flags_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "impersonation_sessions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"staff_user_id" varchar(64) NOT NULL,
	"staff_user_email" varchar(255) NOT NULL,
	"target_tenant_id" varchar(64) NOT NULL,
	"target_user_id" varchar(128) NOT NULL,
	"target_user_email" varchar(255) NOT NULL,
	"reason" text NOT NULL,
	"ticket_reference" varchar(100),
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"ip_address" varchar(64),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "platform_permissions" (
	"code" varchar(100) PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"category" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_role_permissions" (
	"role" varchar(50) NOT NULL,
	"permission_code" varchar(100) NOT NULL,
	CONSTRAINT "platform_role_permissions_role_permission_code_pk" PRIMARY KEY("role","permission_code")
);
--> statement-breakpoint
CREATE TABLE "platform_sessions" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"user_agent" text,
	"ip_address" varchar(64),
	"is_revoked" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_users" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"platform_role" varchar(50) NOT NULL,
	"is_platform_staff" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"severity" varchar(20) NOT NULL,
	"description" text NOT NULL,
	"source_ip" varchar(64),
	"actor_identifier" varchar(255),
	"metadata" text,
	"is_resolved" boolean DEFAULT false NOT NULL,
	"resolved_by" varchar(64),
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"plan" varchar(50) DEFAULT 'starter' NOT NULL,
	"region" varchar(50) DEFAULT 'ap-south-1' NOT NULL,
	"owner_email" varchar(255) NOT NULL,
	"contact_name" varchar(255),
	"phone" varchar(50),
	"max_users" integer DEFAULT 10 NOT NULL,
	"active_users_count" integer DEFAULT 0 NOT NULL,
	"suspended_at" timestamp with time zone,
	"suspension_reason" text,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impersonation_sessions" ADD CONSTRAINT "impersonation_sessions_staff_user_id_platform_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impersonation_sessions" ADD CONSTRAINT "impersonation_sessions_target_tenant_id_tenants_id_fk" FOREIGN KEY ("target_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_role_permissions" ADD CONSTRAINT "platform_role_permissions_permission_code_platform_permissions_code_fk" FOREIGN KEY ("permission_code") REFERENCES "public"."platform_permissions"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_sessions" ADD CONSTRAINT "platform_sessions_user_id_platform_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_logs_actor" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_action" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_impersonation_staff" ON "impersonation_sessions" USING btree ("staff_user_id");--> statement-breakpoint
CREATE INDEX "idx_impersonation_tenant" ON "impersonation_sessions" USING btree ("target_tenant_id");--> statement-breakpoint
CREATE INDEX "idx_role_permissions_role" ON "platform_role_permissions" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_platform_sessions_user" ON "platform_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_platform_sessions_expires" ON "platform_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_platform_sessions_rf_hash" ON "platform_sessions" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "idx_platform_users_email" ON "platform_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_platform_users_role" ON "platform_users" USING btree ("platform_role");--> statement-breakpoint
CREATE INDEX "idx_sec_events_severity" ON "security_events" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "idx_sec_events_type" ON "security_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_tenants_status" ON "tenants" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_tenants_slug" ON "tenants" USING btree ("slug");