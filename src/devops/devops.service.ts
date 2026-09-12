import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DnsApiService, DnsRecord } from './dns-api.service';

@Injectable()
export class DevopsService {
  private readonly logger = new Logger(DevopsService.name);
  private readonly dnsZone: string;

  constructor(
    configService: ConfigService,
    private readonly dnsApi: DnsApiService,
  ) {
    this.dnsZone = configService.get<string>('DNS_ZONE', 'toothless.codes');
  }

  /**
   * Force a DNS IP update via the DNS API
   * @returns Promise with the force-update result
   */
  async executeDNSUpdate(): Promise<{
    updated: boolean;
    exit_code: number;
    ip: string;
  }> {
    try {
      return await this.dnsApi.forceUpdate();
    } catch (error) {
      this.logger.error(`DNS update failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if the DNS API is reachable
   * @returns Promise<boolean>
   */
  async testConnection(): Promise<boolean> {
    try {
      const h = await this.dnsApi.checkHealth();
      return h.ok === true;
    } catch (error) {
      this.logger.error(`DNS API health check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Add a DNS subdomain/proxy entry
   * @param sub - The subdomain name to add (e.g., "api", "blog")
   * @returns Promise with the created record
   */
  async addDNSSubdomain(sub: string): Promise<DnsRecord> {
    try {
      const slug = sub
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '');
      if (!slug) {
        throw new Error('Invalid subdomain name');
      }

      const name = `${slug}.${this.dnsZone}`;
      const ip = await this.dnsApi.getPublicIp();
      return await this.dnsApi.createRecord({
        zone: this.dnsZone,
        name,
        content: ip,
        type: 'A',
        proxied: true,
        ttl: 1,
      });
    } catch (error) {
      this.logger.error(`DNS subdomain add failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * List all DNS subdomains
   * @returns Promise with the records
   */
  async listDNSSubdomains(): Promise<DnsRecord[]> {
    try {
      return await this.dnsApi.listRecords(this.dnsZone);
    } catch (error) {
      this.logger.error(`DNS subdomain list failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a DNS subdomain
   * @param sub - The subdomain name to delete
   * @returns Promise with the deletion result
   */
  async deleteDNSSubdomain(sub: string): Promise<{
    deleted: string;
    record_ids: string[];
  }> {
    try {
      const slug = sub
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '');
      if (!slug) {
        throw new Error('Invalid subdomain name');
      }

      const name = `${slug}.${this.dnsZone}`;
      return await this.dnsApi.deleteRecord(name, this.dnsZone);
    } catch (error) {
      this.logger.error(`DNS subdomain delete failed: ${error.message}`);
      throw error;
    }
  }
}
