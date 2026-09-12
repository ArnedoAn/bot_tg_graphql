import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fc from "./finance-client.js";

const server = new McpServer({
  name: "finance-bot",
  version: "0.1.0",
});

function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function err(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return {
    content: [{ type: "text" as const, text: `Error: ${msg}` }],
    isError: true,
  };
}

async function run<T>(fn: () => Promise<T>): Promise<ReturnType<typeof ok> | ReturnType<typeof err>> {
  try { return ok(await fn()); }
  catch (e) { return err(e); }
}

// ─── Auth / Status ────────────────────────────────────────────────────────────

server.tool(
  "finance_gmail_status",
  "Check if Gmail OAuth is connected and which email is authenticated",
  {},
  async () => { return run(() => fc.gmailStatus()); },
);

server.tool(
  "finance_gmail_auth_url",
  "Get the Gmail OAuth authorization URL. Returns a URL the user must open in a browser to connect Gmail",
  {},
  async () => { return run(() => fc.gmailAuthUrl()); },
);

server.tool(
  "finance_firefly_status",
  "Check if the Firefly III personal access token is valid and connected",
  {},
  async () => { return run(() => fc.fireflyStatus()); },
);

server.tool(
  "finance_set_firefly_token",
  "Store a Firefly III personal access token. Get it from Firefly III → Profile → OAuth → Personal Access Tokens",
  { token: z.string().min(10).describe("Firefly III personal access token") },
  async ({ token }) => { return run(() => fc.setFireflyToken(token)); },
);

server.tool(
  "finance_deepseek_status",
  "Check if the DeepSeek AI integration is connected",
  {},
  async () => { return run(() => fc.deepseekStatus()); },
);

server.tool(
  "finance_health",
  "Full health check of the Finance API — shows status of all internal services (Gmail, Firefly, DeepSeek, DB)",
  {},
  async () => { return run(() => fc.healthCheck()); },
);

// ─── Processing ───────────────────────────────────────────────────────────────

server.tool(
  "finance_batch_process",
  "Launch async email batch processing. Reads Gmail emails from afterDate and creates Firefly transactions. Returns a job_id to poll with finance_job_status",
  {
    after_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
      .describe("Process emails after this date (YYYY-MM-DD). Defaults to yesterday"),
    max_emails: z.number().int().min(1).max(500).optional()
      .describe("Max emails to process (default 200)"),
  },
  async ({ after_date, max_emails }) => { return run(() => fc.batchProcess(after_date, max_emails, false)); },
);

server.tool(
  "finance_dry_run",
  "Simulate email batch processing without creating Firefly transactions. Useful to preview what would be processed",
  {
    after_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
      .describe("Process emails after this date (YYYY-MM-DD). Defaults to yesterday"),
    max_emails: z.number().int().min(1).max(500).optional()
      .describe("Max emails to process (default 200)"),
  },
  async ({ after_date, max_emails }) => { return run(() => fc.batchProcess(after_date, max_emails, true)); },
);

server.tool(
  "finance_job_status",
  "Poll the status of an async batch processing job. Status: queued → running → completed | failed",
  {
    job_id: z.string().describe("Job ID returned by finance_batch_process or finance_dry_run"),
  },
  async ({ job_id }) => { return run(() => fc.jobStatus(job_id)); },
);

server.tool(
  "finance_statistics",
  "Get aggregate processing statistics — total emails processed, transactions created, failures",
  {},
  async () => { return run(() => fc.statistics()); },
);

server.tool(
  "finance_audit_logs",
  "Get the last N transaction processing audit log entries, optionally filtered by status",
  {
    limit: z.number().int().min(1).max(200).optional()
      .describe("Number of entries to return (default 10)"),
    status: z.enum(["completed", "failed", "skipped"]).optional()
      .describe("Filter by processing status"),
  },
  async ({ limit, status }) => { return run(() => fc.auditLogs(limit, status)); },
);

server.tool(
  "finance_retry_failed",
  "Reprocess emails that previously failed. Useful after fixing a Firefly/Gmail connection issue",
  {
    limit: z.number().int().min(1).max(200).optional()
      .describe("Max failed emails to retry (default 50)"),
  },
  async ({ limit }) => { return run(() => fc.retryFailed(limit)); },
);

// ─── Sync ─────────────────────────────────────────────────────────────────────

server.tool(
  "finance_sync_all",
  "Sync all data from Firefly III — refreshes accounts, categories, and budgets cache",
  {},
  async () => { return run(() => fc.syncAll()); },
);

// ─── Senders ──────────────────────────────────────────────────────────────────

server.tool(
  "finance_get_senders",
  "List all known email senders that the Finance API uses to match transactions",
  {},
  async () => { return run(() => fc.getSenders()); },
);

server.tool(
  "finance_learn_senders",
  "Auto-detect new transaction senders by scanning recent Gmail emails",
  {
    email_count: z.number().int().min(1).max(1000).optional()
      .describe("Number of emails to scan (default 100)"),
    days_back: z.number().int().min(1).max(365).optional()
      .describe("How many days back to scan (default 30)"),
  },
  async ({ email_count, days_back }) => { return run(() => fc.learnSenders(email_count, days_back)); },
);

// ─── Scheduler ────────────────────────────────────────────────────────────────

server.tool(
  "finance_scheduler_status",
  "Get the Finance API scheduler status and list of configured background jobs",
  {},
  async () => { return run(() => fc.schedulerStatus()); },
);

server.tool(
  "finance_trigger_job",
  "Manually trigger a scheduler job by its ID. Get job IDs from finance_scheduler_status",
  {
    job_id: z.string().describe("Scheduler job ID to trigger"),
  },
  async ({ job_id }) => { return run(() => fc.triggerJob(job_id)); },
);

// ─── Notify ───────────────────────────────────────────────────────────────────

server.tool(
  "finance_notify_user",
  "Send a Telegram message to the configured user via the bot. Use to report async results (e.g. when a batch job completes)",
  {
    message: z.string().min(1).max(4096).describe("Message text to send via Telegram"),
  },
  async ({ message }) => { return run(async () => { await fc.notifyUser(message); return { sent: true }; }); },
);

// ─── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
