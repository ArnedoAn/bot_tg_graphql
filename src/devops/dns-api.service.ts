import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';

export interface DnsRecord {
  id: string;
  name: string;
  type: string;
  content: string;
  proxied: boolean;
  ttl: number;
}

export interface CreateRecordInput {
  zone?: string;
  name: string;
  content: string;
  type?: string;
  proxied?: boolean;
  ttl?: number;
}

const DEFAULT_BASE_URL = 'https://dns-api.homelab.local';
const DEFAULT_ZONE = 'toothless.codes';
const REQUEST_TIMEOUT = 10000;

@Injectable()
export class DnsApiService {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly defaultZone: string;
  private readonly timeout = REQUEST_TIMEOUT;

  constructor(private readonly configService: ConfigService) {
    const token = this.configService.get<string>('CF_DNS_API_TOKEN');
    if (!token) {
      throw new Error('CF_DNS_API_TOKEN is required for the DNS API client');
    }
    this.token = token;

    const base =
      this.configService.get<string>('DNS_API_BASE_URL') ?? DEFAULT_BASE_URL;
    this.baseUrl = base.replace(/\/+$/, '');

    this.defaultZone =
      this.configService.get<string>('DNS_ZONE') ?? DEFAULT_ZONE;
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}` };
  }

  private handleError(err: unknown): Error {
    const axiosErr = err as AxiosError;
    if (axiosErr.code === 'ECONNABORTED' || axiosErr.code === 'ETIMEDOUT') {
      return new Error(`DNS API request timed out after ${this.timeout}ms`);
    }
    if (axiosErr.response) {
      const status = axiosErr.response.status;
      const body = axiosErr.response.data as { error?: string } | undefined;
      const message = body?.error ?? axiosErr.message;
      return new Error(`DNS API error (HTTP ${status}): ${message}`);
    }
    return new Error(
      `Cannot reach DNS API at ${this.baseUrl}: ${axiosErr.message}`,
    );
  }

  async checkHealth(): Promise<{ ok: boolean; public_ip?: string }> {
    try {
      const res = await axios.get<{ ok: boolean; public_ip?: string }>(
        `${this.baseUrl}/api/health`,
        { timeout: this.timeout },
      );
      return res.data;
    } catch (err) {
      const axiosErr = err as AxiosError;
      if (axiosErr.response?.data) {
        return axiosErr.response.data as {
          ok: boolean;
          public_ip?: string;
        };
      }
      throw this.handleError(err);
    }
  }

  async getPublicIp(): Promise<string> {
    try {
      const res = await axios.get<{ ok: boolean; public_ip?: string }>(
        `${this.baseUrl}/api/health`,
        { timeout: this.timeout },
      );
      const ip = res.data?.public_ip;
      if (!ip) {
        throw new Error('DNS API health response did not include public_ip');
      }
      return ip;
    } catch (err) {
      throw this.handleError(err);
    }
  }

  async listRecords(zone?: string): Promise<DnsRecord[]> {
    const z = zone ?? this.defaultZone;
    try {
      const res = await axios.get<DnsRecord[]>(
        `${this.baseUrl}/api/records?zone=${z}`,
        {
          timeout: this.timeout,
          headers: this.authHeaders(),
        },
      );
      return res.data;
    } catch (err) {
      throw this.handleError(err);
    }
  }

  async createRecord(input: CreateRecordInput): Promise<DnsRecord> {
    const zone = input.zone ?? this.defaultZone;
    const body = {
      zone,
      name: input.name,
      content: input.content,
      type: input.type ?? 'A',
      proxied: input.proxied ?? true,
      ttl: input.ttl ?? 1,
    };
    try {
      const res = await axios.post<DnsRecord>(
        `${this.baseUrl}/api/records`,
        body,
        {
          timeout: this.timeout,
          headers: this.authHeaders(),
        },
      );
      return res.data;
    } catch (err) {
      throw this.handleError(err);
    }
  }

  async deleteRecord(
    name: string,
    zone?: string,
  ): Promise<{ deleted: string; record_ids: string[] }> {
    const z = zone ?? this.defaultZone;
    try {
      const res = await axios.delete<{
        deleted: string;
        record_ids: string[];
      }>(`${this.baseUrl}/api/records/${encodeURIComponent(name)}?zone=${z}`, {
        timeout: this.timeout,
        headers: this.authHeaders(),
      });
      return res.data;
    } catch (err) {
      throw this.handleError(err);
    }
  }

  async forceUpdate(): Promise<{
    updated: boolean;
    exit_code: number;
    ip: string;
  }> {
    try {
      const res = await axios.post<{
        updated: boolean;
        exit_code: number;
        ip: string;
      }>(
        `${this.baseUrl}/api/ip`,
        {},
        {
          timeout: this.timeout,
          headers: this.authHeaders(),
        },
      );
      return res.data;
    } catch (err) {
      throw this.handleError(err);
    }
  }
}
