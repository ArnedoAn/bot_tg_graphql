-- CreateTable
CREATE TABLE "finance_onboarding_progress" (
    "user_id" TEXT NOT NULL,
    "current_step" TEXT NOT NULL DEFAULT 'start',
    "gmail_done" BOOLEAN NOT NULL DEFAULT false,
    "firefly_token_done" BOOLEAN NOT NULL DEFAULT false,
    "web_ui_done" BOOLEAN NOT NULL DEFAULT false,
    "apk_manual_done" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_onboarding_progress_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "bot_assets" (
    "id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "file_unique_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key")
);
