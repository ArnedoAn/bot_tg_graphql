-- CreateTable
CREATE TABLE "user_settings" (
    "user_id" TEXT NOT NULL,
    "menu_mode" TEXT NOT NULL DEFAULT 'simple',

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id")
);
