const BASE_URL = process.env.FINANCE_API_URL ?? "https://financeapi.toothless.codes";
const USER_ID = process.env.TELEGRAM_USER_ID!;
const BOT_URL = process.env.BOT_API_URL ?? "http://localhost:3000";
const NOTIFY_KEY = process.env.NOTIFY_API_KEY!;

if (!USER_ID) throw new Error("TELEGRAM_USER_ID env var is required");
if (!NOTIFY_KEY) throw new Error("NOTIFY_API_KEY env var is required");

const userHeaders = {
  "X-User-Id": USER_ID,
  "Content-Type": "application/json",
};

async function api<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  let url = `${BASE_URL}${path}`;
  if (params) {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join("&");
    if (qs) url += `?${qs}`;
  }
  const res = await fetch(url, {
    method,
    headers: userHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.detail ?? `HTTP ${res.status} ${path}`);
  return data as T;
}

// --- Auth ---

export const gmailStatus = () =>
  api("GET", "/api/v1/auth/status");

export const gmailAuthUrl = () =>
  api("GET", "/api/v1/auth/url");

export const fireflyStatus = () =>
  api("GET", "/api/v1/auth/firefly/status");

export const setFireflyToken = (token: string) =>
  api("PUT", "/api/v1/auth/firefly/token", { token });

export const deepseekStatus = () =>
  api("GET", "/api/v1/auth/deepseek/status");

// --- Health ---

export const healthCheck = () =>
  api("GET", "/api/v1/health");

// --- Processing ---

export const batchProcess = (afterDate?: string, maxEmails = 200, dryRun = false) =>
  api("POST", "/api/v1/processing/batch", {
    after_date: afterDate ?? yesterday(),
    max_emails: maxEmails,
    dry_run: dryRun,
    use_known_senders: true,
  });

export const jobStatus = (jobId: string) =>
  api("GET", `/api/v1/processing/jobs/${jobId}`);

export const statistics = () =>
  api("GET", "/api/v1/processing/statistics");

export const auditLogs = (limit = 10, status?: string) =>
  api("GET", "/api/v1/processing/audit", undefined, { limit, status });

export const retryFailed = (limit = 50) =>
  api("POST", `/api/v1/processing/retry-failed`, undefined, { limit });

// --- Sync ---

export const syncAll = () =>
  api("POST", "/api/v1/sync/all");

// --- Senders ---

export const getSenders = () =>
  api("GET", "/api/v1/senders/");

export const learnSenders = (emailCount = 100, daysBack = 30) =>
  api("POST", "/api/v1/senders/learn", { email_count: emailCount, days_back: daysBack });

// --- Scheduler ---

export const schedulerStatus = () =>
  api("GET", "/api/v1/scheduler/status");

export const triggerJob = (jobId: string) =>
  api("POST", `/api/v1/scheduler/jobs/${jobId}/trigger`);

// --- Notify via bot ---

export async function notifyUser(message: string): Promise<void> {
  const res = await fetch(`${BOT_URL}/notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": NOTIFY_KEY },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error(`Notify failed: HTTP ${res.status}`);
}

// --- Helpers ---

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}
