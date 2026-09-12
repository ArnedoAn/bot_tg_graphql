# PROJECT KNOWLEDGE BASE

**Generated:** 2026-08-09
**Commit:** 882854d
**Branch:** main

## OVERVIEW

Personal Telegram bot — NestJS + Prisma + PostgreSQL. Polls Telegram commands, integrates Transcaribe transit card, Pico y Placa vehicle restrictions, Gmail/Firefly III Finance (onboarding wizard + cron), DevOps SSH ops, and scheduled reminders. Monorepo with Bun-based MCP Finance server.

## STRUCTURE

```
bot_tg_graphql/
├── src/
│   ├── main.ts                  # Nest bootstrap, morgan, PORT
│   ├── app.module.ts            # Root module — imports all feature modules
│   ├── app.controller.ts        # POST /notify (x-api-key), GET /health
│   ├── telegram/                # Central command router (ALL bot.onText + callback_query)
│   ├── shared/                  # BotService singleton + 9 Prisma entity services
│   │   ├── instances/           # BotService (TelegramBot), UserMenuModeService
│   │   ├── prisma/              # PrismaClient + entity services (Tarjeta, Vehicle, Reminder, User, UserSettings, FeatureFlags, FinanceOnboarding, BotAsset)
│   │   ├── constants/           # Feature flag keys (dotted strings)
│   │   └── interfaces/          # Result { success, result: any }
│   ├── transcaribe/             # Transit card balance via Sondapay API + stored proc api_card_call()
│   ├── picoyplaca/              # Vehicle plate restriction via Cheerio scrape pyphoy.com + filtrar_autos_por_digitos()
│   ├── finance/                 # Gmail/Firefly III onboarding wizard + batch processing + status cron (LARGEST module)
│   ├── devops/                  # SSH remote ops (node-ssh): DNS, subdomains
│   ├── admin/                   # Admin-only: feature toggles, Gmail whitelist, APK file_id
│   └── reminders/               # ⚠️ DEAD STUB — RemindersService empty class, never wired
├── packages/
│   └── mcp-finance/             # Bun MCP server — 18 tools wrapping Finance API. NOT NestJS.
├── prisma/schema.prisma         # 10 flat models, no relations, raw $queryRaw stored procs
├── .github/workflows/           # 2 overlapping deploy workflows (Coolify), no lint/test
└── test/                        # E2E spec only
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add new Telegram command | `src/telegram/telegram.service.ts` | Register in `setupListeners()` (onText) + `setupCallbackHandlers()` (callback_query) |
| New feature module | Follow `src/transcaribe/` pattern | `*.module.ts` → `*.service.ts` → `handlers/*.handler.ts` → register in telegram.service |
| Database models | `prisma/schema.prisma` | 10 flat models (no relations). Run `pnpm db:init` after changes. |
| Bot instance | `src/shared/instances/bot.service.ts` | NEVER create `new TelegramBot()` directly |
| External API calls | `src/{module}/*.service.ts` | Services only, no Telegram deps |
| Scheduled tasks | `src/picoyplaca/handlers/` + `src/finance/finance-status-cron.service.ts` | `@Cron()` from `@nestjs/schedule` |
| Menu system | `telegram.service.ts` → `getMainMenuOptions()` + `setupCallbackHandlers()` | callback_data: `module:action` format |
| Feature flags | `src/shared/constants/feature-flag-keys.ts` + `prisma/schema.prisma` FeatureFlag | Dotted keys: `finance.section.health` |
| Admin commands | `src/admin/admin.handler.ts` | Gated by `chatId === process.env.ADMIN_ID` |
| MCP server | `packages/mcp-finance/src/index.ts` | Bun runtime. 18 tools. POSTs /notify to bot. |

## CODE MAP

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| TelegramService | @Injectable | `src/telegram/telegram.service.ts` (411L) | Central dispatcher: registers ALL handlers, menu, callback routing |
| BotService | @Injectable | `src/shared/instances/bot.service.ts` | Singleton TelegramBot — polling starts in constructor |
| PrismaService | @Injectable | `src/shared/prisma/prisma.service.ts` | PrismaClient + OnModuleInit $connect. PROVIDED but NOT EXPORTED from PrismaModule |
| UserMenuModeService | @Injectable | `src/shared/instances/user-menu-mode.service.ts` | Simple/advanced menu toggle via UserSettingsService |
| TranscaribeHandler | @Injectable | `src/transcaribe/handlers/transcaribe.handler.ts` | /init /saldo /historial /info + force_reply flows |
| TranscaribeService | @Injectable | `src/transcaribe/transcaribe.service.ts` | Sondapay API (plain HTTP), stored proc api_card_call() |
| PicoyplacaHandler | @Injectable | `src/picoyplaca/handlers/picoyplaca.handler.ts` | /pico /addCar /allCars + @Cron('0 19 * * *') daily alert |
| PicoyplacaService | @Injectable | `src/picoyplaca/picoyplaca.service.ts` | Cheerio scrape pyphoy.com, stored proc filtrar_autos_por_digitos() |
| FinanceHandler | @Injectable | `src/finance/handlers/finance.handler.ts` (1974L!) | Onboarding wizard state machine, 20+ callback actions, in-memory state |
| FinanceService | @Injectable | `src/finance/finance.service.ts` (466L) | Finance Analyzer REST API client |
| FinanceStatusCronService | @Injectable | `src/finance/finance-status-cron.service.ts` (299L) | @Cron EVERY_DAY_AT_8AM: Gmail/Firefly connectivity poll |
| DevopsHandler | @Injectable | `src/devops/handlers/devops.handler.ts` (418L) | /dnsupdate /testconnection /addsubdomain /listsubdomains /deletesubdomain |
| DevopsService | @Injectable | `src/devops/devops.service.ts` | SSH via node-ssh, DNS/Caddy scripts |
| AdminHandler | @Injectable | `src/admin/admin.handler.ts` (267L) | Feature toggle admin, Gmail whitelist, APK file_id registration |
| Result | interface | `src/shared/interfaces/result.interface.ts` | `{ success: boolean; result: any }` — all service returns |
| TarjetaService | @Injectable | `src/shared/prisma/tarjeta.service.ts` | DB: Tarjeta entity + raw SQL api_card_call() |
| VehicleService | @Injectable | `src/shared/prisma/vehicle.service.ts` | DB: Vehicle entity + raw SQL filtrar_autos_por_digitos() |
| FeatureFlagsService | @Injectable | `src/shared/prisma/feature-flags.service.ts` | DB: FeatureFlag toggle, OnModuleInit seeds defaults |
| FinanceOnboardingService | @Injectable | `src/shared/prisma/finance-onboarding.service.ts` | DB: FinanceOnboardingProgress step tracking |
| BotAssetService | @Injectable | `src/shared/prisma/bot-asset.service.ts` | DB: BotAsset Telegram file_id cache |
| UserService | @Injectable | `src/shared/prisma/user.service.ts` | DB: User registration |
| UserSettingsService | @Injectable | `src/shared/prisma/user-settings.service.ts` | DB: UserSettings preferences |
| ReminderService | @Injectable | `src/shared/prisma/reminder.service.ts` | DB: Reminder CRUD (⚠️ no callers — dead) |
| AppController | @Controller | `src/app.controller.ts` | GET /health, POST /notify (x-api-key → ADMIN_ID) |

## CONVENTIONS

### Architecture
- **Handler-Service separation**: Handlers handle Telegram messages (force_reply, emojis, user flow); Services are pure business logic (no Telegram deps)
- **Module wiring**: `AppModule → TelegramModule (hub) → {feature modules + SharedModule}`. AdminModule NOT in AppModule (imported transitively by TelegramModule).
- **Callback data format**: `{module}:{action}` — split on first `:`, switch on module, dispatch to handler. `menu:*` routed specially.
- **Result interface**: All service methods returning data use `Result { success: boolean; result: any }`. Always check `result.success` before accessing `result.result`.
- **Feature module template**: `*.module.ts` → `*.service.ts` → `handlers/*.handler.ts` → register in `telegram.service.ts`. Export the handler from the module.
- **PrismaService UNEXPORTED**: PrismaService is provided but NOT exported from PrismaModule. New entity services must be added inside PrismaModule; consumers get them via SharedModule re-export.
- **BotService singleton**: Polling starts in BotService constructor (not onModuleInit/onApplicationBootstrap). Rule: NEVER create `new TelegramBot()` directly.

### Tooling
- **pnpm** (not yarn): `pnpm@11.5.1` pinned via `packageManager`. README still references yarn — docs are stale.
- **SWC builder**: `nest-cli.json` → `"builder": "swc"`. Build is SWC, not tsc. Tests use ts-jest (dual transform).
- **TypeScript**: Relaxed — `strictNullChecks: false`, `noImplicitAny: false`. Codebase relies on `any`, untyped `Result`.
- **Prettier**: single quotes, trailing commas all.
- **Docker**: Multi-stage node:22-alpine. `prisma/` copied BEFORE `pnpm install --prod` so @prisma/client postinstall can generate. Migrations execute at container startup: `npx prisma migrate deploy && node dist/main`.
- **No editorconfig**, no custom NestJS guards/interceptors/pipes/filters/decorators, no class-validator. HTTP layer is morgan + /health only.

### Database
- **No relations** between Prisma models — flat standalone tables.
- **userId** = Telegram `chatId` as String in all models.
- **Snake_case mapping** (`@map`/`@@map`) for newer models; older models (Tarjeta, Vehicle, Reminder) use camelCase defaults. Follow snake_case for new models.
- **Raw SQL**: `$queryRaw` tagged templates call PostgreSQL stored procedures `api_card_call()` (Transcaribe) and `filtrar_autos_por_digitos()` (Pico y Placa).
- **Migrations**: `YYYYMMDDHHMMSS_snake_name/` naming. Applied via `prisma migrate deploy` at container startup.
- **db:init** = `prisma generate` ONLY (not migrate). Run after schema changes.

### Environment
- **Canonical token name**: `TELEGRAM_TOKEN` (code reads this). `.env.example` has both `TELEGRAM_BOT_TOKEN` (stale from README) and `TELEGRAM_TOKEN` with comment "Código usa TELEGRAM_TOKEN". Never add `TELEGRAM_BOT_TOKEN` to new code.
- **Admin check**: `String(chatId) === process.env.ADMIN_ID` inline string compare. No guard/pipe.
- **No env validation**: ConfigModule.forRoot() without validationSchema — missing/typo env vars silently pass.

## ANTI-PATTERNS (THIS PROJECT)

- **Never** instantiate `TelegramBot` directly — use `BotService` from `SharedModule`
- **Never** put Telegram API calls in Services — keep in Handlers
- **Never** skip `result.success` check before accessing `result.result`
- **Never** run `pnpm db:init` in production — Prisma client generated at Docker build time
- **Never** use `findMany()` without checking `result.success`
- **Never** return raw Prisma objects from handlers — always wrap in `Result`
- **Never** reference `TELEGRAM_BOT_TOKEN` — canonical name is `TELEGRAM_TOKEN`

## UNIQUE STYLES

- Emoji-heavy Telegram responses (🚍💰🔧 etc.)
- `force_reply` for conversation flows (card number, vehicle plate, finance token)
- Telegram `chatId` stored as `userId` String in all Prisma models
- SSH via `node-ssh` library, not native SSH
- Web scraping with `cheerio` for Pico y Placa (not API)
- In-memory state Maps in FinanceHandler (lost on restart, never cleaned — known leak)
- Spanish error strings in shared/prisma services
- Feature flag keys as dotted strings: `finance.section.health`, `devops.section.health`
- Inline menu via `{ reply_markup: { inline_keyboard: ... } }` with `menu:{module}` callbacks

## COMMANDS

```bash
pnpm start:dev        # Dev with hot reload (SWC watch)
pnpm build            # SWC build → dist/
pnpm start:prod       # node dist/main
pnpm db:init          # Prisma generate (client regeneration after schema changes)
pnpm dlx prisma migrate dev  # Apply migrations locally
pnpm dlx prisma studio       # DB browser
pnpm test             # Jest unit tests (ts-jest)
pnpm test:e2e         # E2E tests
pnpm lint             # ESLint --fix
pnpm format           # Prettier on src/ + test/
docker compose up -d  # PostgreSQL + app (dev)
```

## NOTES

### Known Debt
- **`src/finance/handlers/finance.handler.ts`** — 1974 lines. Wizard state machine + 20+ callbacks in one class. Highest refactor priority.
- **`src/reminders/reminders.service.ts`** — Empty class. Module never wired. Dead code (Reminder Prisma model also unused).
- **`picoyplaca.service.ts:vehicleExist()`** — Always returns `true` (both branches return true). Users can never add vehicles via /addCar.
- **`picoyplaca.handler.ts:174`** — Notifications sent to `ADMIN_ID` instead of `vehicle.userId`. All Pico y Placa alerts go to admin.
- **`bot.service.ts:getOnReplyMessageResponse()`** — No timeout. Force_reply promise hangs forever if user ignores. Leaks event listener.
- **`.toPromise()` usage**: `transcaribe.service.ts:122`, `picoyplaca.service.ts:32` — deprecated in RxJS 7 (removed in 8). Use `firstValueFrom()`.

### Gotchas
- Bot polling starts in `BotService` constructor (during DI bootstrap). Errors during bootstrap can orphan a polling process.
- `NOTIFY_API_KEY` unset → `/notify` endpoint open (line 39 comparison: `undefined !== undefined` passes).
- Two overlapping GitHub Actions deploy workflows (`deploy.yml` + `deploy-ghcr.yml`) — both trigger Coolify, no CI tests.
- `@Cron` uses server local timezone. Finance 8AM + Pico y Placa 7PM depend on server TZ.
- `AGENTS.md` files in `.omo/`, `.sisyphus/`, `src/shared/` are gitignored/untracked — knowledge base lost on clone.
- README documents yarn commands + `TELEGRAM_BOT_TOKEN` — both stale. Use pnpm + `TELEGRAM_TOKEN`.

### External APIs
- **Transcaribe**: `http://recaudo.sondapay.com/...` (plain HTTP — no HTTPS!). Hardcoded URL in service.
- **Pico y Placa**: Scrapes `https://www.pyphoy.com/cartagena/particulares` with Cheerio. Brittle CSS selector (`.sc-4e15c505-0.juuwzm...`).
- **Finance**: `https://financeapi.toothless.codes` — configurable via `FINANCE_API_URL` env.
- **Deploy**: Coolify via GET `/api/v1/deploy?uuid=...` or POST webhook. Registry: `registry.toothless.codes`.

### Misc
- `packages/mcp-finance/` NOT included in Docker image — runs separately with Bun.
- `src/shared/prisma/prisma.service.ts`: PrismaService PROVIDED but NOT EXPORTED from PrismaModule. External modules cannot inject it directly.
- `transcaribe/picoyplaca` modules import PrismaModule redundantly (SharedModule already re-exports it). Safe but noisy.
- Operations helper (`transcaribe/helpers/operations.helper.ts`): hardcoded fare 3000 + manual UTC offset calculation (brittle timezone math).
- `.github/copilot-instructions.md` — supplementary architecture doc for Copilot.

Respond terse like smart caveman. All technical substance stay. Only fluff die.

Rules:
- Drop: articles (a/an/the), filler (just/really/basically), pleasantries, hedging
- Fragments OK. Short synonyms. Technical terms exact. Code unchanged.
- Pattern: [thing] [action] [reason]. [next step].
- Not: "Sure! I'd be happy to help you with that."
- Yes: "Bug in auth middleware. Fix:"

Switch level: /caveman lite|full|ultra|wenyan-lite|wenyan-full|wenyan-ultra
Stop: "stop caveman" or "normal mode"

Auto-Clarity: drop caveman for security warnings, irreversible actions, user confused. Resume after.

Boundaries: code/commits/PRs written normal.
