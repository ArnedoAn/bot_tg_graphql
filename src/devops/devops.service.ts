import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NodeSSH } from 'node-ssh';

export interface SSHConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKeyPath?: string;
}

export interface ScriptExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

@Injectable()
export class DevopsService {
  private readonly logger = new Logger(DevopsService.name);
  private readonly sshConfig: SSHConfig;
  private readonly DNS_SCRIPT_PATH: string;
  private readonly CADDY_SCRIPT_PATH: string;
  private ssh: NodeSSH;

  constructor(private readonly configService: ConfigService) {
    this.ssh = new NodeSSH();
    this.sshConfig = {
      host: this.configService.get<string>('SSH_HOST', 'localhost'),
      port: this.configService.get<number>('SSH_PORT', 22),
      username: this.configService.get<string>('SSH_USERNAME', 'andres'),
      password: this.configService.get<string>('SSH_PASSWORD'),
      privateKeyPath: this.configService.get<string>('SSH_PRIVATE_KEY_PATH'),
    };

    // Get DNS script path from env or use default
    this.DNS_SCRIPT_PATH = this.configService.get<string>(
      'DNS_UPDATE_SCRIPT_PATH',
      '/home/andres/dns-update/dns.py',
    );

    this.CADDY_SCRIPT_PATH = this.configService.get<string>(
      'CADDY_SCRIPT_PATH',
      '/home/andres/caddy-manager/caddy-manager.sh',
    );
  }

  private getDNSCommand(args: string = ''): string {
    return `/usr/bin/python3 ${this.DNS_SCRIPT_PATH} ${args}`.trim();
  }

  /**
   * Execute a Python script on the Docker host via SSH
   * @returns Promise with execution result
   */
  async executeDNSUpdate(): Promise<ScriptExecutionResult> {
    try {
      const isAlive = await this.testConnection();
      if (!isAlive) {
        throw new Error('SSH connection is not available');
      }
      this.logger.log('Starting DNS update via SSH...');
      const result = await this.executeSSHCommand(this.getDNSCommand());
      this.logger.log('DNS update completed.');
      return result;
    } catch (error) {
      this.logger.error(`DNS update failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Establish SSH connection using node-ssh
   * @private
   */
  private async connect(): Promise<void> {
    const connectionConfig: any = {
      host: this.sshConfig.host,
      port: this.sshConfig.port,
      username: this.sshConfig.username,
    };

    // Prefer private key file path over password
    if (this.sshConfig.privateKeyPath) {
      connectionConfig.privateKeyPath = this.sshConfig.privateKeyPath;
    } else if (this.sshConfig.password) {
      connectionConfig.password = this.sshConfig.password;
    }

    await this.ssh.connect(connectionConfig);
    this.logger.log('SSH connection established');
  }

  /**
   * Execute a custom command on the Docker host via SSH
   * @param command - Command to execute
   * @returns Promise with execution result
   */
  async executeSSHCommand(command: string): Promise<ScriptExecutionResult> {
    try {
      await this.connect();

      const result = await this.ssh.execCommand(command);

      this.logger.log(`Command finished with exit code: ${result.code}`);

      return {
        success: result.code === 0,
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim(),
        exitCode: result.code ?? -1,
      };
    } catch (error) {
      this.logger.error(`SSH command error: ${error.message}`);
      throw error;
    } finally {
      this.ssh.dispose();
    }
  }

  /**
   * Check if SSH connection is available
   * @returns Promise<boolean>
   */
  async testConnection(): Promise<boolean> {
    try {
      const result = await this.executeSSHCommand('echo "Connection test"');
      return result.success;
    } catch (error) {
      this.logger.error(`Connection test failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Add a DNS subdomain/proxy entry
   * @param subdomain - The subdomain name to add (e.g., "api", "blog")
   * @returns Promise with execution result
   */
  async addDNSSubdomain(subdomain: string): Promise<ScriptExecutionResult> {
    try {
      // Sanitize subdomain input
      const sanitized = subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (!sanitized) {
        throw new Error('Invalid subdomain name');
      }

      this.logger.log(`Adding DNS subdomain: ${sanitized}`);
      const command = this.getDNSCommand(`--add "${sanitized}"`);
      const result = await this.executeSSHCommand(command);
      this.logger.log(`DNS subdomain add completed for: ${sanitized}`);
      return result;
    } catch (error) {
      this.logger.error(`DNS subdomain add failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * List all DNS subdomains
   * @param detailed - Whether to show detailed information
   * @returns Promise with execution result
   */
  async listDNSSubdomains(detailed: boolean = false): Promise<ScriptExecutionResult> {
    try {
      this.logger.log('Listing DNS subdomains...');
      const args = detailed ? '--list --detailed' : '--list';
      const command = this.getDNSCommand(args);
      const result = await this.executeSSHCommand(command);
      this.logger.log('DNS subdomain list completed.');
      return result;
    } catch (error) {
      this.logger.error(`DNS subdomain list failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a DNS subdomain
   * @param subdomain - The subdomain name to delete
   * @returns Promise with execution result
   */
  async deleteDNSSubdomain(subdomain: string): Promise<ScriptExecutionResult> {
    try {
      // Sanitize subdomain input
      const sanitized = subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (!sanitized) {
        throw new Error('Invalid subdomain name');
      }

      this.logger.log(`Deleting DNS subdomain: ${sanitized}`);
      const command = this.getDNSCommand(`--delete "${sanitized}"`);
      const result = await this.executeSSHCommand(command);
      this.logger.log(`DNS subdomain delete completed for: ${sanitized}`);
      return result;
    } catch (error) {
      this.logger.error(`DNS subdomain delete failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * List all Caddy reverse proxy forwardings
   * @returns Promise with execution result containing parsed forwarding entries
   */
  async listCaddyForwardings(): Promise<ScriptExecutionResult> {
    try {
      this.logger.log('Listing Caddy forwardings...');
      const result = await this.executeSSHCommand(`bash ${this.CADDY_SCRIPT_PATH} --list`);
      this.logger.log('Caddy forwardings list completed.');
      return result;
    } catch (error) {
      this.logger.error(`Caddy list failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Add a new Caddy reverse proxy forwarding
   * @param domain - The domain to expose (e.g. api.example.com)
   * @param port - The local port to forward to
   * @param description - Optional description/comment added before the config block
   * @returns Promise with execution result
   */
  async addCaddyForwarding(
    domain: string,
    port: string,
    description: string = '',
  ): Promise<ScriptExecutionResult> {
    try {
      const sanitizedDomain = domain.trim().toLowerCase();
      const sanitizedPort = port.trim().replace(/[^0-9]/g, '');
      const sanitizedDesc = description.trim().replace(/'/g, '');

      if (!sanitizedDomain) throw new Error('Invalid domain');
      if (!sanitizedPort) throw new Error('Invalid port');

      this.logger.log(`Adding Caddy forwarding: ${sanitizedDomain} -> :${sanitizedPort}`);

      const command = `bash ${this.CADDY_SCRIPT_PATH} --add --domain '${sanitizedDomain}' --port '${sanitizedPort}' --description '${sanitizedDesc}'`;
      const result = await this.executeSSHCommand(command);
      this.logger.log(`Caddy forwarding add completed for: ${sanitizedDomain}`);
      return result;
    } catch (error) {
      this.logger.error(`Caddy forwarding add failed: ${error.message}`);
      throw error;
    }
  }
}
