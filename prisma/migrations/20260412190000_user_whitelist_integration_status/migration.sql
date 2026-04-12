-- CreateTable
CREATE TABLE "users" (
    "user_id" TEXT NOT NULL,
    "username" TEXT,
    "first_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "google_whitelist" (
    "user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_whitelist_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_integration_status" (
    "user_id" TEXT NOT NULL,
    "gmail_connected" BOOLEAN NOT NULL DEFAULT false,
    "firefly_connected" BOOLEAN NOT NULL DEFAULT false,
    "gmail_ever_connected" BOOLEAN NOT NULL DEFAULT false,
    "firefly_ever_connected" BOOLEAN NOT NULL DEFAULT false,
    "last_checked_at" TIMESTAMP(3),
    "last_notified_at" TIMESTAMP(3),
    "last_onboarding_reminder_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_integration_status_pkey" PRIMARY KEY ("user_id")
);
