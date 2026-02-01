# Copilot Instructions - Bot Telegram Personal

## Architecture Overview

This is a **NestJS** Telegram bot with a modular architecture. Each feature domain follows a **Handler-Service pattern**:

```
src/
├── telegram/           # Central command router (TelegramService)
├── {module}/           # Feature modules: transcaribe, picoyplaca, devops, reminders, finance
│   ├── {module}.service.ts     # Business logic, external API calls
│   └── handlers/{module}.handler.ts  # Telegram message handling, user interaction
└── shared/             # Cross-cutting concerns
    ├── instances/bot.service.ts   # Singleton TelegramBot instance
    └── prisma/          # Database services per entity
```

**Data flow**: `TelegramService` → `Handler` → `Service` → `Prisma/External APIs`

## Key Patterns

### Handler-Service Separation
- **Handlers** (`src/{module}/handlers/`): Handle Telegram messages, manage conversation flows using `force_reply`, format responses with emojis
- **Services** (`src/{module}/{module}.service.ts`): Pure business logic, no Telegram dependencies

Example handler interaction flow (see [transcaribe.handler.ts](src/transcaribe/handlers/transcaribe.handler.ts#L30-L70)):
```typescript
const msg = await this.botInstace.sendMessageToUser(chatId, 'Prompt', { reply_markup: { force_reply: true } });
const reply = await this.botInstace.getOnReplyMessageResponse(chatId, msg.message_id);
```

### Inline Menu System
All modules use callback_data format: `{module}:{action}` with centralized routing in TelegramService:
```typescript
// In telegram.service.ts setupCallbackHandlers()
const [module, ...rest] = data.split(':');
const action = rest.join(':');
```

### Result Interface
All service methods returning data use `Result` interface ([result.interface.ts](src/shared/interfaces/result.interface.ts)):
```typescript
interface Result { success: boolean; result: any; }
```
Always check `result.success` before accessing `result.result`.

### Bot Instance Access
Never instantiate `TelegramBot` directly. Use `BotService` from `SharedModule`:
```typescript
constructor(private readonly botInstance: BotService) {
  this.bot = this.botInstance.getBot();
}
```

### Scheduled Tasks
Use `@nestjs/schedule` with `@Cron()` decorator. See [picoyplaca.handler.ts](src/picoyplaca/handlers/picoyplaca.handler.ts#L18-L21) for daily notification example.

## Module Structure

When creating a new feature module:
1. Create `{module}.module.ts`, `{module}.service.ts`
2. Create `handlers/{module}.handler.ts` for Telegram interactions
3. Export the handler, import `SharedModule` and `PrismaModule` as needed
4. Register commands in [telegram.service.ts](src/telegram/telegram.service.ts) via `this.bot.onText(/\/command/, handler)`
5. Add menu option in `getMainMenuOptions()` and callback handler in `setupCallbackHandlers()`

## Database (Prisma + PostgreSQL)

- Schema: [prisma/schema.prisma](prisma/schema.prisma)
- Entity services in `src/shared/prisma/` (TarjetaService, VehicleService, ReminderService)
- User identification: Telegram `chatId` stored as `userId` string in models
- Run `yarn db:init` after schema changes to regenerate client

## Commands & Workflows

| Command | Action |
|---------|--------|
| `yarn start:dev` | Development with hot reload |
| `yarn db:init` | Generate Prisma client |
| `yarn test` | Run unit tests |
| `yarn lint` | ESLint with auto-fix |
| `docker compose up` | Full stack (postgres + app) |

## Environment Variables

Required in `.env`:
- `TELEGRAM_TOKEN` - Bot token from BotFather
- `DATABASE_URL` - PostgreSQL connection string
- `ADMIN_ID` - Admin chat ID for system notifications
- `SSH_HOST`, `SSH_PORT`, `SSH_USERNAME` - SSH connection details
- `SSH_PRIVATE_KEY_PATH` - Path to SSH private key file (preferred)
- `SSH_PASSWORD` - SSH password (fallback if no key path)
- `FINANCE_API_URL` - Finance Analyzer API base URL (default: https://financeapi.toothless.codes)

## External Integrations

- **Transcaribe API**: HTTP calls to `recaudo.sondapay.com` for transit card balance
- **Pico y Placa**: Web scraping from `pyphoy.com/cartagena/particulares` using Cheerio
- **DevOps SSH**: Remote command execution via `node-ssh` library to Docker host
- **Finance Analyzer API**: REST API for transaction processing (see [finance.service.ts](src/finance/finance.service.ts))
  - Batch processing: `POST /api/v1/processing/batch`
  - Auth status: `GET /api/v1/auth/status`
  - Statistics: `GET /api/v1/processing/statistics`
  - Senders management: `/api/v1/senders/*`
  - Scheduler: `/api/v1/scheduler/*`

## Testing Conventions

Tests use `@nestjs/testing` with real module imports. See [transcaribe.service.spec.ts](src/transcaribe/transcaribe.service.spec.ts) for pattern. Mock external services, not internal modules.
