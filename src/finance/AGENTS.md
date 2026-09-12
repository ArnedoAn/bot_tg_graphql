# Finance Module

**Parent:** `../AGENTS.md (root)`

## OVERVIEW

Gmail/Firefly III onboarding wizard + batch transaction processing via external Finance Analyzer REST API + daily status cron. LARGEST module in project — 2739 total lines across 3 files.

## STRUCTURE

```
finance/
├── finance.module.ts                # Imports SharedModule, HttpModule; exports FinanceHandler + FinanceStatusCronService
├── finance.service.ts (466L)        # REST client for Finance Analyzer API (batch, auth, senders, scheduler, statistics)
├── handlers/finance.handler.ts (1974L!) # Onboarding wizard state machine, 20+ callback actions
└── finance-status-cron.service.ts (299L) # @Cron EVERY_DAY_AT_8AM: polls Gmail/Firefly status per user
```

## WHERE TO LOOK

| Task | Location | Notes |
|---|---|---|
| Onboarding wizard flow | handlers/finance.handler.ts | State machine via in-memory Maps + FinanceOnboardingService DB |
| API calls (batch, auth) | finance.service.ts | POST /api/v1/processing/batch, GET /api/v1/auth/status, etc. |
| Daily status check | finance-status-cron.service.ts | @Cron EVERY_DAY_AT_8AM, iterates users, reports via BotService |
| Senders management | finance.service.ts | /api/v1/senders/* + /api/v1/scheduler/* |
| Callback routing | handlers/finance.handler.ts | handleCallback(chatId, action) — dispatched from TelegramService |

## CONVENTIONS (module only)

- Wizard state machine: in-memory `Map<chatId, state>` (userDateState, wizardAfterToken) — lost on restart, never cleaned (memory leak)
- Handler uses `force_reply` + `sleep(ms)` for guided step-by-step onboarding
- API client uses `firstValueFrom(httpService.axiosRef...)` with typed interfaces
- Cron uses `ConfigService` for env defaults (CRON_DELAY_MS, FINANCE_API_URL, etc.)
- FinanceStatusCronService injected into AdminHandler (cross-module dependency: admin → finance)

## ANTI-PATTERNS

- **Never** rely on in-memory Maps persisting — they reset on restart; always checkpoint to FinanceOnboardingService DB
- **Never** add callback actions without registering in handleCallback switch
- **Never** skip env validation — FINANCE_API_URL must be set or falls back to hardcoded toothless.codes URL
- Handler is 1974 lines — DO NOT add to it without refactoring first

## NOTES

- Known debt: finance.handler.ts = 1974 lines (highest refactor priority in project)
- Hardcoded onboarding URLs (fireflyHome, fireflyProfile, financeWeb, financeSetup) at top of handler — toothless.codes domain
- `sleep(ms)` helper in handler for polling loops
- Cron timezone = server local (server must be Colombia TZ for 8AM to be correct)
- API default: https://financeapi.toothless.codes (overridable via FINANCE_API_URL)
- finance.service.ts exports typed interfaces: BatchResult, AuthStatus, SenderInfo, Statistics, SchedulerStatus
- In-memory Maps grow unbounded — entries never removed
