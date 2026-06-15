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

// ─── Auth / Status ────────────────────────────────────────────────────────────

server.tool(
  "finance_gmail_status",
  "Check if Gmail OAuth is connected and which email is authenticated",
  {},
  async () => {
    try { return ok(await fc.gmailStatus()); }
    catch (e) { return err(e); }
  },
);

server.tool(
  "finance_gmail_auth_url",
  "Get the Gmail OAuth authorization URL. Returns a URL the user must open in a browser to connect Gmail",
  {},
  async () => {
    try { return ok(await fc.gmailAuthUrl()); }
    catch (e) { return err(e); }
  },
);

server.tool(
  "finance_firefly_status",
  "Check if the Firefly III personal access token is valid and connected",
  {},
  async () => {
    try { return ok(await fc.fireflyStatus()); }
    catch (e) { return err(e); }
  },
);

server.tool(
  "finance_set_firefly_token",
  "Store a Firefly III personal access token. Get it from Firefly III → Profile → OAuth → Personal Access Tokens",
  { token: z.string().min(10).describe("Firefly III personal access token") },
  async ({ token }) => {
    try { return ok(await fc.setFireflyToken(token)); }
    catch (e) { return err(e); }
  },
);

server.tool(
  "finance_deepseek_status",
  "Check if the DeepSeek AI integration is connected",
  {},
  async () => {
    try { return ok(await fc.deepseekStatus()); }
    catch (e) { return err(e); }
  },
);

server.tool(
  "finance_health",
  "Full health check of the Finance API — shows status of all internal services (Gmail, Firefly, DeepSeek, DB)",
  {},
  async () => {
    try { return ok(await fc.healthCheck()); }
    catch (e) { return err(e); }
  },
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
  async ({ after_date, max_emails }) => {
    try { return ok(await fc.batchProcess(after_date, max_emails, false)); }
    catch (e) { return err(e); }
  },
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
  async ({ after_date, max_emails }) => {
    try { return ok(await fc.batchProcess(after_date, max_emails, true)); }
    catch (e) { return err(e); }
  },
);

server.tool(
  "finance_job_status",
  "Poll the status of an async batch processing job. Status: queued → running → completed | failed",
  {
    job_id: z.string().describe("Job ID returned by finance_batch_process or finance_dry_run"),
  },
  async ({ job_id }) => {
    try { return ok(await fc.jobStatus(job_id)); }
    catch (e) { return err(e); }
  },
);

server.tool(
  "finance_statistics",
  "Get aggregate processing statistics — total emails processed, transactions created, failures",
  {},
  async () => {
    try { return ok(await fc.statistics()); }
    catch (e) { return err(e); }
  },
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
  async ({ limit, status }) => {
    try { return ok(await fc.auditLogs(limit, status)); }
    catch (e) { return err(e); }
  },
);

server.tool(
  "finance_retry_failed",
  "Reprocess emails that previously failed. Useful after fixing a Firefly/Gmail connection issue",
  {
    limit: z.number().int().min(1).max(200).optional()
      .describe("Max failed emails to retry (default 50)"),
  },
  async ({ limit }) => {
    try { return ok(await fc.retryFailed(limit)); }
    catch (e) { return err(e); }
  },
);

// ─── Sync ─────────────────────────────────────────────────────────────────────

server.tool(
  "finance_sync_all",
  "Sync all data from Firefly III — refreshes accounts, categories, and budgets cache",
  {},
  async () => {
    try { return ok(await fc.syncAll()); }
    catch (e) { return err(e); }
  },
);

// ─── Senders ──────────────────────────────────────────────────────────────────

server.tool(
  "finance_get_senders",
  "List all known email senders that the Finance API uses to match transactions",
  {},
  async () => {
    try { return ok(await fc.getSenders()); }
    catch (e) { return err(e); }
  },
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
  async ({ email_count, days_back }) => {
    try { return ok(await fc.learnSenders(email_count, days_back)); }
    catch (e) { return err(e); }
  },
);

// ─── Scheduler ────────────────────────────────────────────────────────────────

server.tool(
  "finance_scheduler_status",
  "Get the Finance API scheduler status and list of configured background jobs",
  {},
  async () => {
    try { return ok(await fc.schedulerStatus()); }
    catch (e) { return err(e); }
  },
);

server.tool(
  "finance_trigger_job",
  "Manually trigger a scheduler job by its ID. Get job IDs from finance_scheduler_status",
  {
    job_id: z.string().describe("Scheduler job ID to trigger"),
  },
  async ({ job_id }) => {
    try { return ok(await fc.triggerJob(job_id)); }
    catch (e) { return err(e); }
  },
);

// ─── Notify ───────────────────────────────────────────────────────────────────

server.tool(
  "finance_notify_user",
  "Send a Telegram message to the configured user via the bot. Use to report async results (e.g. when a batch job completes)",
  {
    message: z.string().min(1).max(4096).describe("Message text to send via Telegram"),
  },
  async ({ message }) => {
    try {
      await fc.notifyUser(message);
      return ok({ sent: true });
    } catch (e) { return err(e); }
  },
);

// ─── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
