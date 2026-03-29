import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosRequestConfig } from 'axios';
import { firstValueFrom } from 'rxjs';
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

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
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

  private buildUserHeaders(userId: string): AxiosRequestConfig {
    return {
      headers: {
        'X-User-Id': userId,
      },
    };
  }

  private logUserRequest(userId: string, operation: string, url: string): void {
    this.logger.log(`[userId=${userId}] ${operation} -> ${url}`);
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
    try {
      const requestBody: BatchProcessingRequest = {
        max_emails: maxEmails,
        dry_run: dryRun,
        after_date: afterDate || this.getYesterdayDate(),
        use_known_senders: true,
      };

      this.logger.log(`Launching batch processing: ${JSON.stringify(requestBody)}`);
      const url = `${this.apiBaseUrl}/api/v1/processing/batch`;
      this.logUserRequest(userId, 'launchBatchProcessing', url);
      const response = await firstValueFrom(
        this.httpService.post<BatchProcessingJobEnqueueResponse>(
          url,
          requestBody,
          this.buildUserHeaders(userId),
        ),
      );

      return { success: true, result: response.data };
    } catch (error) {
      this.logger.error(`Batch processing failed: ${error.message}`);
      return {
        success: false,
        result: error.response?.data?.detail || error.message,
      };
    }
  }

  /**
   * Get async batch processing job status
   */
  async getProcessingJobStatus(userId: string, jobId: string): Promise<Result> {
    try {
      const url = `${this.apiBaseUrl}/api/v1/processing/jobs/${jobId}`;
      this.logUserRequest(userId, 'getProcessingJobStatus', url);
      const response = await firstValueFrom(
        this.httpService.get<ProcessingJobStatusResponse>(url, this.buildUserHeaders(userId)),
      );
      return { success: true, result: response.data };
    } catch (error) {
      this.logger.error(`Get processing job status failed: ${error.message}`);
      return {
        success: false,
        result: error.response?.data?.detail || error.message,
      };
    }
  }

  /**
   * Check Gmail authentication status
   */
  async getGmailAuthStatus(userId: string): Promise<Result> {
    try {
      const url = `${this.apiBaseUrl}/api/v1/auth/status`;
      this.logUserRequest(userId, 'getGmailAuthStatus', url);
      const response = await firstValueFrom(
        this.httpService.get<AuthStatus>(url, this.buildUserHeaders(userId)),
      );
      return { success: true, result: response.data };
    } catch (error) {
      this.logger.error(`Auth status check failed: ${error.message}`);
      return {
        success: false,
        result: error.response?.data?.detail || error.message,
      };
    }
  }

  /**
   * Get Gmail OAuth authorization URL for re-authentication
   */
  async getGmailAuthUrl(userId: string): Promise<Result> {
    try {
      const url = `${this.apiBaseUrl}/api/v1/auth/url`;
      this.logUserRequest(userId, 'getGmailAuthUrl', url);
      const response = await firstValueFrom(
        this.httpService.get(url, this.buildUserHeaders(userId)),
      );
      return { success: true, result: response.data };
    } catch (error) {
      this.logger.error(`Get auth URL failed: ${error.message}`);
      return {
        success: false,
        result: error.response?.data?.detail || error.message,
      };
    }
  }

  /**
   * Check Firefly III connection status
   */
  async getFireflyStatus(userId: string): Promise<Result> {
    try {
      const url = `${this.apiBaseUrl}/api/v1/auth/firefly/status`;
      this.logUserRequest(userId, 'getFireflyStatus', url);
      const response = await firstValueFrom(
        this.httpService.get(url, this.buildUserHeaders(userId)),
      );
      return { success: true, result: response.data };
    } catch (error) {
      this.logger.error(`Firefly status check failed: ${error.message}`);
      return {
        success: false,
        result: error.response?.data?.detail || error.message,
      };
    }
  }

  /**
   * Set Firefly personal access token
   */
  async setFireflyToken(userId: string, token: string): Promise<Result> {
    try {
      const url = `${this.apiBaseUrl}/api/v1/auth/firefly/token`;
      this.logUserRequest(userId, 'setFireflyToken', url);
      const body: FireflyTokenRequest = { token };

      const response = await firstValueFrom(
        this.httpService.put(url, body, this.buildUserHeaders(userId)),
      );

      return { success: true, result: response.data };
    } catch (error) {
      this.logger.error(`Set Firefly token failed: ${error.message}`);
      return {
        success: false,
        result: error.response?.data?.detail || error.message,
      };
    }
  }

  /**
   * Check DeepSeek AI connection status
   */
  async getDeepSeekStatus(userId: string): Promise<Result> {
    try {
      const url = `${this.apiBaseUrl}/api/v1/auth/deepseek/status`;
      this.logUserRequest(userId, 'getDeepSeekStatus', url);
      const response = await firstValueFrom(
        this.httpService.get(url, this.buildUserHeaders(userId)),
      );
      return { success: true, result: response.data };
    } catch (error) {
      this.logger.error(`DeepSeek status check failed: ${error.message}`);
      return {
        success: false,
        result: error.response?.data?.detail || error.message,
      };
    }
  }

  /**
   * Get full health check
   */
  async getHealthCheck(userId: string): Promise<Result> {
    try {
      const url = `${this.apiBaseUrl}/api/v1/health`;
      this.logUserRequest(userId, 'getHealthCheck', url);
      const response = await firstValueFrom(
        this.httpService.get<HealthCheck>(url, this.buildUserHeaders(userId)),
      );
      return { success: true, result: response.data };
    } catch (error) {
      this.logger.error(`Health check failed: ${error.message}`);
      return {
        success: false,
        result: error.response?.data?.detail || error.message,
      };
    }
  }

  /**
   * Get processing statistics
   */
  async getStatistics(userId: string): Promise<Result> {
    try {
      const url = `${this.apiBaseUrl}/api/v1/processing/statistics`;
      this.logUserRequest(userId, 'getStatistics', url);
      const response = await firstValueFrom(
        this.httpService.get(url, this.buildUserHeaders(userId)),
      );
      return { success: true, result: response.data };
    } catch (error) {
      this.logger.error(`Statistics fetch failed: ${error.message}`);
      return {
        success: false,
        result: error.response?.data?.detail || error.message,
      };
    }
  }

  /**
   * Get audit logs
   */
  async getAuditLogs(userId: string, limit: number = 10, status?: string): Promise<Result> {
    try {
      let url = `${this.apiBaseUrl}/api/v1/processing/audit?limit=${limit}`;
      if (status) {
        url += `&status=${status}`;
      }
      this.logUserRequest(userId, 'getAuditLogs', url);
      const response = await firstValueFrom(
        this.httpService.get(url, this.buildUserHeaders(userId)),
      );
      return { success: true, result: response.data };
    } catch (error) {
      this.logger.error(`Audit logs fetch failed: ${error.message}`);
      return {
        success: false,
        result: error.response?.data?.detail || error.message,
      };
    }
  }

  /**
   * Retry failed emails
   */
  async retryFailed(userId: string, limit: number = 50): Promise<Result> {
    try {
      const url = `${this.apiBaseUrl}/api/v1/processing/retry-failed?limit=${limit}`;
      this.logUserRequest(userId, 'retryFailed', url);
      const response = await firstValueFrom(
        this.httpService.post(url, undefined, this.buildUserHeaders(userId)),
      );
      return { success: true, result: response.data };
    } catch (error) {
      this.logger.error(`Retry failed emails failed: ${error.message}`);
      return {
        success: false,
        result: error.response?.data?.detail || error.message,
      };
    }
  }

  /**
   * Get scheduler status
   */
  async getSchedulerStatus(userId: string): Promise<Result> {
    try {
      const url = `${this.apiBaseUrl}/api/v1/scheduler/status`;
      this.logUserRequest(userId, 'getSchedulerStatus', url);
      const response = await firstValueFrom(
        this.httpService.get(url, this.buildUserHeaders(userId)),
      );
      return { success: true, result: response.data };
    } catch (error) {
      this.logger.error(`Scheduler status fetch failed: ${error.message}`);
      return {
        success: false,
        result: error.response?.data?.detail || error.message,
      };
    }
  }

  /**
   * Trigger scheduler job manually
   */
  async triggerSchedulerJob(userId: string, jobId: string): Promise<Result> {
    try {
      const url = `${this.apiBaseUrl}/api/v1/scheduler/jobs/${jobId}/trigger`;
      this.logUserRequest(userId, 'triggerSchedulerJob', url);
      const response = await firstValueFrom(
        this.httpService.post(url, undefined, this.buildUserHeaders(userId)),
      );
      return { success: true, result: response.data };
    } catch (error) {
      this.logger.error(`Trigger job failed: ${error.message}`);
      return {
        success: false,
        result: error.response?.data?.detail || error.message,
      };
    }
  }

  /**
   * Sync all data from Firefly III
   */
  async syncAll(userId: string): Promise<Result> {
    try {
      const url = `${this.apiBaseUrl}/api/v1/sync/all`;
      this.logUserRequest(userId, 'syncAll', url);
      const response = await firstValueFrom(
        this.httpService.post(url, undefined, this.buildUserHeaders(userId)),
      );
      return { success: true, result: response.data };
    } catch (error) {
      this.logger.error(`Sync all failed: ${error.message}`);
      return {
        success: false,
        result: error.response?.data?.detail || error.message,
      };
    }
  }

  /**
   * Get known senders list
   */
  async getKnownSenders(userId: string): Promise<Result> {
    try {
      const url = `${this.apiBaseUrl}/api/v1/senders/`;
      this.logUserRequest(userId, 'getKnownSenders', url);
      const response = await firstValueFrom(
        this.httpService.get(url, this.buildUserHeaders(userId)),
      );
      return { success: true, result: response.data };
    } catch (error) {
      this.logger.error(`Get senders failed: ${error.message}`);
      return {
        success: false,
        result: error.response?.data?.detail || error.message,
      };
    }
  }

  /**
   * Learn senders from emails
   */
  async learnSenders(
    userId: string,
    emailCount: number = 100,
    daysBack: number = 30,
  ): Promise<Result> {
    try {
      const url = `${this.apiBaseUrl}/api/v1/senders/learn`;
      this.logUserRequest(userId, 'learnSenders', url);
      const response = await firstValueFrom(
        this.httpService.post(
          url,
          { email_count: emailCount, days_back: daysBack },
          this.buildUserHeaders(userId),
        ),
      );
      return { success: true, result: response.data };
    } catch (error) {
      this.logger.error(`Learn senders failed: ${error.message}`);
      return {
        success: false,
        result: error.response?.data?.detail || error.message,
      };
    }
  }
}
