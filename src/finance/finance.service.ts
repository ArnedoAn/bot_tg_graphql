import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
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

  /**
   * Launch batch processing task to analyze transactions
   */
  async launchBatchProcessing(
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
      const response = await this.httpService
        .post<BatchProcessingResponse>(url, requestBody)
        .toPromise();

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
   * Check Gmail authentication status
   */
  async getGmailAuthStatus(): Promise<Result> {
    try {
      const url = `${this.apiBaseUrl}/api/v1/auth/status`;
      const response = await this.httpService.get<AuthStatus>(url).toPromise();
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
  async getGmailAuthUrl(): Promise<Result> {
    try {
      const url = `${this.apiBaseUrl}/api/v1/auth/url`;
      const response = await this.httpService.get(url).toPromise();
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
  async getFireflyStatus(): Promise<Result> {
    try {
      const url = `${this.apiBaseUrl}/api/v1/auth/firefly/status`;
      const response = await this.httpService.get(url).toPromise();
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
   * Check DeepSeek AI connection status
   */
  async getDeepSeekStatus(): Promise<Result> {
    try {
      const url = `${this.apiBaseUrl}/api/v1/auth/deepseek/status`;
      const response = await this.httpService.get(url).toPromise();
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
  async getHealthCheck(): Promise<Result> {
    try {
      const url = `${this.apiBaseUrl}/api/v1/health`;
      const response = await this.httpService.get<HealthCheck>(url).toPromise();
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
  async getStatistics(): Promise<Result> {
    try {
      const url = `${this.apiBaseUrl}/api/v1/processing/statistics`;
      const response = await this.httpService.get(url).toPromise();
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
  async getAuditLogs(limit: number = 10, status?: string): Promise<Result> {
    try {
      let url = `${this.apiBaseUrl}/api/v1/processing/audit?limit=${limit}`;
      if (status) {
        url += `&status=${status}`;
      }
      const response = await this.httpService.get(url).toPromise();
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
  async retryFailed(limit: number = 50): Promise<Result> {
    try {
      const url = `${this.apiBaseUrl}/api/v1/processing/retry-failed?limit=${limit}`;
      const response = await this.httpService.post(url).toPromise();
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
  async getSchedulerStatus(): Promise<Result> {
    try {
      const url = `${this.apiBaseUrl}/api/v1/scheduler/status`;
      const response = await this.httpService.get(url).toPromise();
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
  async triggerSchedulerJob(jobId: string): Promise<Result> {
    try {
      const url = `${this.apiBaseUrl}/api/v1/scheduler/jobs/${jobId}/trigger`;
      const response = await this.httpService.post(url).toPromise();
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
  async syncAll(): Promise<Result> {
    try {
      const url = `${this.apiBaseUrl}/api/v1/sync/all`;
      const response = await this.httpService.post(url).toPromise();
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
  async getKnownSenders(): Promise<Result> {
    try {
      const url = `${this.apiBaseUrl}/api/v1/senders/`;
      const response = await this.httpService.get(url).toPromise();
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
  async learnSenders(emailCount: number = 100, daysBack: number = 30): Promise<Result> {
    try {
      const url = `${this.apiBaseUrl}/api/v1/senders/learn`;
      const response = await this.httpService
        .post(url, { email_count: emailCount, days_back: daysBack })
        .toPromise();
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
