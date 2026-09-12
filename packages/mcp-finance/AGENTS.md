# MCP-FINANCE (Bun MCP Server)

**Parent:** `../../AGENTS.md` (root)

## OVERVIEW

Bun-based MCP server wrapping the Finance Analyzer REST API. Exposes 18 MCP tools for finance operations. Runs independently from the NestJS bot — communicates back via POST /notify with a shared `NOTIFY_API_KEY`.

## STRUCTURE

```
mcp-finance/
├── package.json          # Bun runtime, type: module, deps: @modelcontextprotocol/sdk + zod
├── bun.lock              # Bun lockfile (NOT pnpm)
├── tsconfig.json         # ESM, modern target
└── src/
    ├── index.ts (251L)      # MCP server setup, 18 server.tool() registrations, SSE transport
    └── finance-client.ts    # HTTP client wrapping Finance Analyzer REST API + notifyBot()
```

## WHERE TO LOOK

| Task | Location | Notes |
|---|---|---|
| Add new MCP tool | `src/index.ts` | `server.tool(name, description, zodSchema, handler)` — copy existing block |
| Fix API call | `src/finance-client.ts` | All HTTP to Finance Analyzer lives here |
| Change transport | `src/index.ts` | Currently SSE (`SSEServerTransport`); swap to stdio easily |
| Notify bot | `src/finance-client.ts` `notifyBot()` | POST to BOT_API_URL/notify with x-api-key |

## CONVENTIONS

- **Bun runtime, NOT Node** — `bun run src/index.ts`, `bun --watch` for dev
- ESM module (`"type": "module"` in package.json)
- Every tool has a zod `inputSchema` for parameter validation
- Tool naming: descriptive, kebab-case-ish (e.g. `finance-balance`, `get-transactions`)
- `finance-client.ts` returns typed responses; ALL HTTP goes through it
- Env vars: `FINANCE_API_URL` (default `https://financeapi.toothless.codes`), `TELEGRAM_USER_ID` (required), `BOT_API_URL` (default `http://localhost:3000`), `NOTIFY_API_KEY` (required, throws if missing)
- Hardcoded `USER_ID` = Telegram user id from `TELEGRAM_USER_ID` — single-user server

## ANTI-PATTERNS

- **Never** add direct HTTP calls in `index.ts` — use `finance-client.ts`
- **Never** skip zod `inputSchema` on new tools
- **Never** run with Node — Bun-only (`bun.lock`, no pnpm/node_modules workflow)
- **Never** add another hardcoded user — `TELEGRAM_USER_ID` is the single source

## COMMANDS

```bash
bun run src/index.ts      # Start MCP server (SSE transport)
bun --watch src/index.ts  # Dev with hot reload
```

## NOTES

- NOT included in Docker image — runs separately from the bot
- Notifies NestJS bot via POST `{BOT_API_URL}/notify`, auth `x-api-key: NOTIFY_API_KEY`
- 18 tools registered at startup via `server.tool()` — full list in `src/index.ts`
- Uses `@modelcontextprotocol/sdk` `Server` class with `SSEServerTransport`
- No README in package; this file is the only doc
