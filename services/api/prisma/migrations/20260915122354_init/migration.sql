-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "totp_secret_encrypted" TEXT,
    "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'جهاز غير مسمى',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "replaced_by_id" TEXT,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "starlink_accounts" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "email_secret_encrypted" TEXT NOT NULL DEFAULT '',
    "wifi_code_encrypted" TEXT NOT NULL DEFAULT '',
    "notes_encrypted" TEXT NOT NULL DEFAULT '',
    "kit_number" TEXT NOT NULL DEFAULT '',
    "serial_number" TEXT NOT NULL DEFAULT '',
    "account_number" TEXT NOT NULL DEFAULT '',
    "subscription_id" TEXT NOT NULL DEFAULT '',
    "starlink_id" TEXT NOT NULL DEFAULT '',
    "device_name" TEXT NOT NULL DEFAULT '',
    "recharge_date" TEXT NOT NULL DEFAULT '',
    "standby_date" TEXT NOT NULL DEFAULT '',
    "balance_due" TEXT NOT NULL DEFAULT '',
    "currency" TEXT NOT NULL DEFAULT '$',
    "dish_status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "wifi_status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "alert_reason" TEXT NOT NULL DEFAULT '',
    "plan_name" TEXT NOT NULL DEFAULT '',
    "service_status" TEXT NOT NULL DEFAULT '',
    "service_location" TEXT NOT NULL DEFAULT '',
    "billing_period" TEXT NOT NULL DEFAULT '',
    "payment_due_date" TEXT NOT NULL DEFAULT '',
    "software_version" TEXT NOT NULL DEFAULT '',
    "uptime" TEXT NOT NULL DEFAULT '',
    "last_updated" TEXT NOT NULL DEFAULT '',
    "last_successful_scan_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "starlink_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "browser_sessions" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "profile_volume_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'STOPPED',
    "container_id" TEXT,
    "container_name" TEXT,
    "vnc_ticket_hash" TEXT,
    "vnc_ticket_expires_at" TIMESTAMP(3),
    "locked_at" TIMESTAMP(3),
    "locked_by_request_id" TEXT,
    "last_started_at" TIMESTAMP(3),
    "last_stopped_at" TIMESTAMP(3),
    "last_activity_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "browser_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "device_id" TEXT,
    "account_id" TEXT,
    "action" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "ip_address" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "devices_user_id_idx" ON "devices"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_device_id_idx" ON "refresh_tokens"("device_id");

-- CreateIndex
CREATE INDEX "customers_owner_user_id_idx" ON "customers"("owner_user_id");

-- CreateIndex
CREATE INDEX "starlink_accounts_customer_id_idx" ON "starlink_accounts"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "browser_sessions_account_id_key" ON "browser_sessions"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "browser_sessions_profile_volume_name_key" ON "browser_sessions"("profile_volume_name");

-- CreateIndex
CREATE INDEX "audit_log_user_id_idx" ON "audit_log"("user_id");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "starlink_accounts" ADD CONSTRAINT "starlink_accounts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "browser_sessions" ADD CONSTRAINT "browser_sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "starlink_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

