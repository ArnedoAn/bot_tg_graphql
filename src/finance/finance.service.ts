import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosRequestConfig } from 'axios';
import { Result } from '../shared/interfaces/result.interface';

export interface BatchProcessingRequest {
  max_emails: number;
  dry_run: boolean;
  after_date: string;
  use_known_senders: boolean;
}

export interface BatchProcessingResponse {
  total_emails: number;
  processed: number;
  created: number;
  skipped: number;
  failed: number;
  dry_run: boolean;
  processing_time_ms: number;
  results?: any[];
}

export interface BatchProcessingJobEnqueueResponse {
  job_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  poll_url?: string;
  message?: string;
}

export interface ProcessingJobStatusResponse {
  job_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  session_id?: string;
  created_at?: string;
  started_at?: string | null;
  completed_at?: string | null;
  result?: BatchProcessingResponse | null;
  error_message?: string | null;
}

export interface AuthStatus {
  gmail_authenticated: boolean;
  email?: string;
  message: string;
}

export interface HealthCheck {
  status: string;
  version: string;
  environment: string;
  services: Record<string, boolean>;
}

export interface ProcessingStatistics {
  total_processed: number;
  total_created: number;
  total_failed: number;
  [key: string]: any;
}

export interface FireflyTokenRequest {
  token: string;
}

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);
  private readonly apiBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiBaseUrl = this.configService.get<string>(
      'FINANCE_API_URL',
      'https://financeapi.toothless.codes',
    );
  }

  /**
   * Get yesterday's date in YYYY-MM-DD format
   */
  private getYesterdayDate(): string {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  }

  /**
   * Format date to YYYY-MM-DD
   */
  formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Shared request helper: builds the full URL, logs the request with the
   * user id, performs the axios call and maps errors to the Result shape.
   */
  private async request<T>(
    config: AxiosRequestConfig,
    userId: string,
    operation: string,
    errorLabel: string = operation,
  ): Promise<Result> {
    const url = `${this.apiBaseUrl}${config.url}`;
    this.logger.log(`[userId=${userId}] ${operation} -> ${url}`);
    try {
      const response = await axios.request<T>({
        ...config,
        url,
        headers: { ...config.headers, 'X-User-Id': userId },
      });
      return { success: true, result: response.data };
    } catch (error) {
      this.logger.error(`${errorLabel}: ${error.message}`);
      return {
        success: false,
        result: error.response?.data?.detail || error.message,
      };
    }
  }

  /**
   * Launch batch processing task to analyze transactions
   */
  async launchBatchProcessing(
    userId: string,
    afterDate?: string,
    maxEmails: number = 200,
    dryRun: boolean = false,
  ): Promise<Result> {
    const requestBody: BatchProcessingRequest = {
      max_emails: maxEmails,
      dry_run: dryRun,
      after_date: afterDate || this.getYesterdayDate(),
      use_known_senders: true,
    };

    this.logger.log(
      `[userId=${userId}] launchBatchProcessing after_date=${requestBody.after_date} dry_run=${requestBody.dry_run}`,
    );
    return this.request<BatchProcessingJobEnqueueResponse>(
      { method: 'post', url: '/api/v1/processing/batch', data: requestBody },
      userId,
      'launchBatchProcessing',
      'Batch processing failed',
    );
  }

  /**
   * Get async batch processing job status
   */
  async getProcessingJobStatus(userId: string, jobId: string): Promise<Result> {
    return this.request<ProcessingJobStatusResponse>(
      { method: 'get', url: `/api/v1/processing/jobs/${jobId}` },
      userId,
      'getProcessingJobStatus',
      'Get processing job status failed',
    );
  }

  /**
   * Check Gmail authentication status
   */
  async getGmailAuthStatus(userId: string): Promise<Result> {
    return this.request<AuthStatus>(
      { method: 'get', url: '/api/v1/auth/status' },
      userId,
      'getGmailAuthStatus',
      'Auth status check failed',
    );
  }

  /**
   * Get Gmail OAuth authorization URL for re-authentication
   */
  async getGmailAuthUrl(userId: string): Promise<Result> {
    return this.request(
      { method: 'get', url: '/api/v1/auth/url' },
      userId,
      'getGmailAuthUrl',
      'Get auth URL failed',
    );
  }

  /**
   * Check Firefly III connection status
   */
  async getFireflyStatus(userId: string): Promise<Result> {
    return this.request(
      { method: 'get', url: '/api/v1/auth/firefly/status' },
      userId,
      'getFireflyStatus',
      'Firefly status check failed',
    );
  }

  /**
   * Set Firefly personal access token.
   * El token viaja solo en el cuerpo HTTPS; no se registra en logs.
   * Cifrado en reposo y aislamiento por usuario deben aplicarse en el Finance API.
   */
  async setFireflyToken(userId: string, token: string): Promise<Result> {
    const body: FireflyTokenRequest = { token };
    return this.request(
      {
        method: 'put',
        url: '/api/v1/auth/firefly/token',
        data: body,
      },
      userId,
      'setFireflyToken',
      `Set Firefly token failed for userId=${userId}`,
    );
  }

  /**
   * Check DeepSeek AI connection status
   */
  async getDeepSeekStatus(userId: string): Promise<Result> {
    return this.request(
      { method: 'get', url: '/api/v1/auth/deepseek/status' },
      userId,
      'getDeepSeekStatus',
      'DeepSeek status check failed',
    );
  }

  /**
   * Get full health check
   */
  async getHealthCheck(userId: string): Promise<Result> {
    return this.request<HealthCheck>(
      { method: 'get', url: '/api/v1/health' },
      userId,
      'getHealthCheck',
      'Health check failed',
    );
  }

  /**
   * Get processing statistics
   */
  async getStatistics(userId: string): Promise<Result> {
    return this.request(
      { method: 'get', url: '/api/v1/processing/statistics' },
      userId,
      'getStatistics',
      'Statistics fetch failed',
    );
  }

  /**
   * Get audit logs
   */
  async getAuditLogs(
    userId: string,
    limit: number = 10,
    status?: string,
  ): Promise<Result> {
    let path = `/api/v1/processing/audit?limit=${limit}`;
    if (status) {
      path += `&status=${status}`;
    }
    return this.request(
      { method: 'get', url: path },
      userId,
      'getAuditLogs',
      'Audit logs fetch failed',
    );
  }

  /**
   * Retry failed emails
   */
  async retryFailed(userId: string, limit: number = 50): Promise<Result> {
    return this.request(
      {
        method: 'post',
        url: `/api/v1/processing/retry-failed?limit=${limit}`,
      },
      userId,
      'retryFailed',
      'Retry failed emails failed',
    );
  }

  /**
   * Get scheduler status
   */
  async getSchedulerStatus(userId: string): Promise<Result> {
    return this.request(
      { method: 'get', url: '/api/v1/scheduler/status' },
      userId,
      'getSchedulerStatus',
      'Scheduler status fetch failed',
    );
  }

  /**
   * Trigger scheduler job manually
   */
  async triggerSchedulerJob(userId: string, jobId: string): Promise<Result> {
    return this.request(
      { method: 'post', url: `/api/v1/scheduler/jobs/${jobId}/trigger` },
      userId,
      'triggerSchedulerJob',
      'Trigger job failed',
    );
  }

  /**
   * Sync all data from Firefly III
   */
  async syncAll(userId: string): Promise<Result> {
    return this.request(
      { method: 'post', url: '/api/v1/sync/all' },
      userId,
      'syncAll',
      'Sync all failed',
    );
  }

  /**
   * Get known senders list
   */
  async getKnownSenders(userId: string): Promise<Result> {
    return this.request(
      { method: 'get', url: '/api/v1/senders/' },
      userId,
      'getKnownSenders',
      'Get senders failed',
    );
  }

  /**
   * Learn senders from emails
   */
  async learnSenders(
    userId: string,
    emailCount: number = 100,
    daysBack: number = 30,
  ): Promise<Result> {
    return this.request(
      {
        method: 'post',
        url: '/api/v1/senders/learn',
        data: { email_count: emailCount, days_back: daysBack },
      },
      userId,
      'learnSenders',
      'Learn senders failed',
    );
  }
}
