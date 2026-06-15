# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Dev
pnpm start:dev          # watch mode
pnpm start:debug        # debug + watch

# Build
pnpm build              # nest build (SWC)
pnpm start:prod         # node dist/main

# DB
pnpm db:init            # prisma generate (after schema changes)
pnpm dlx prisma migrate dev  # apply migrations
pnpm dlx prisma studio       # DB browser

# Quality
pnpm lint               # ESLint --fix
pnpm format             # Prettier on src/ + test/

# Tests
pnpm test               # Jest unit
pnpm test:watch         # Jest watch
pnpm test:cov           # Jest with coverage
pnpm test:e2e           # E2E (test/jest-e2e.json)

# Docker
docker compose up -d    # PostgreSQL 16 + app (dev)
docker compose -f docker-compose.prod.yml up -d  # prod
```

## MCP Finance Server

`packages/mcp-finance/` — Bun-based MCP server exposing 18 tools that control the Finance module via AI (Claude Desktop, etc.).

```bash
# Run
bun packages/mcp-finance/src/index.ts

# Install deps
cd packages/mcp-finance && bun install
```

**Required env vars** (set in `claude_desktop_config.json`):
- `TELEGRAM_USER_ID` — Telegram chatId (same as `ADMIN_ID` in bot)
- `FINANCE_API_URL` — Finance API base URL
- `BOT_API_URL` — Bot HTTP URL (for `/notify`)
- `NOTIFY_API_KEY` — Shared secret with bot `NOTIFY_API_KEY`

**Tools**: gmail_status, gmail_auth_url, firefly_status, set_firefly_token, deepseek_status, health, batch_process, dry_run, job_status, statistics, audit_logs, retry_failed, sync_all, get_senders, learn_senders, scheduler_status, trigger_job, notify_user.

`POST /notify` on the bot delivers Telegram messages to `ADMIN_ID`. Protected by `x-api-key` header matching `NOTIFY_API_KEY`.

## Architecture

NestJS Telegram bot with PostgreSQL + Prisma. One bot token, polling mode.

### Module layout

```
src/
├── telegram/       # Entry point — TelegramService registers all handlers on /start, text, callback_query
├── shared/         # BotService singleton + all Prisma entity services
├── transcaribe/    # Transit card balance tracking (Transcaribe bus card)
├── picoyplaca/     # Vehicle plate restriction alerts (Pico y Placa Barranquilla)
├── reminders/      # User-defined scheduled reminders
├── devops/         # Remote SSH operations + DNS script execution
├── finance/        # Gmail + Firefly III integration with guided onboarding
└── admin/          # Admin-only commands (ADMIN_ID env)
```

### Key patterns

**BotService** (`shared/instances/bot.service.ts`) — single `TelegramBot` instance, starts polling on boot. **Never** instantiate `TelegramBot` directly elsewhere.

**Handler pattern** — each module has `handlers/` containing classes injected into `TelegramService`. Handlers expose methods called by `TelegramService` for commands, text messages, and callback queries.

**Entity services** (`shared/prisma/`) — one service per Prisma model. All return `Result { success: boolean; result: any }`. Raw SQL via `$queryRaw` tagged templates for stored procedures (`api_card_call()`, `filtrar_autos_por_digitos()`).

**`userId`** = Telegram `chatId` as string in all Prisma models.

**Feature flags** — `FeatureFlag` model (key → enabled). Check before executing optional features.

**Finance cron** — `finance-status-cron.service.ts` polls Gmail/Firefly connectivity for all users, respects `CRON_DELAY_MS` and `CRON_MAX_USERS_PER_CYCLE`, throttles notifications via `NOTIFY_COOLDOWN_DAYS`.

### Data models

| Model | Purpose |
|---|---|
| `User` | Registered users (`/start`) |
| `UserSettings` | Per-user preferences (e.g., `menuMode: simple\|advanced`) |
| `Tarjeta` | Transcaribe card IDs |
| `Vehicle` | Vehicles for Pico y Placa alerts |
| `Reminder` | Scheduled user reminders |
| `FinanceOnboardingProgress` | Step-by-step Finance setup state |
| `UserIntegrationStatus` | Gmail/Firefly connection cache + notification timestamps |
| `BotAsset` | Telegram `file_id` cache (APK, etc.) |
| `FeatureFlag` | Global feature toggles |
| `GoogleWhitelist` | Gmail testing-mode email approval |

### Environment variables

See `.env.example`. Key vars:
- `DATABASE_URL` — PostgreSQL connection string
- `TELEGRAM_TOKEN` — bot token (code reads this key)
- `ADMIN_ID` — Telegram chatId with admin privileges
- `GOOGLE_TESTING_MODE` — restricts Finance Gmail to whitelisted emails
- `SSH_*` — DevOps SSH target
- `DNS_UPDATE_SCRIPT_PATH` — path to DNS update script on SSH host
- `CRON_DELAY_MS`, `CRON_MAX_USERS_PER_CYCLE`, `NOTIFY_COOLDOWN_DAYS`, `ONBOARDING_STALE_DAYS` — cron tuning
