import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, ClientChannel, ConnectConfig } from 'ssh2';

export interface SSHConfig {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKey?: Buffer | string;
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
  private readonly DNS_UPDATE_COMMAND =
    '/usr/bin/python3 /home/andres/dns-update/dns.py';

  constructor(private readonly configService: ConfigService) {
    this.sshConfig = {
      host: this.configService.get<string>('SSH_HOST', 'localhost'),
      port: this.configService.get<number>('SSH_PORT', 22),
      username: this.configService.get<string>('SSH_USERNAME', 'andres'),
      password: this.configService.get<string>('SSH_PASSWORD'),
      privateKey: this.configService.get<string>('SSH_PRIVATE_KEY'),
    };
  }

  /**
   * Execute a Python script on the Docker host via SSH
   * @param scriptPath - Path to the Python script on the remote server
   * @param args - Arguments to pass to the Python script
   * @returns Promise with execution result
   */
  async executeDNSUpdate(): Promise<ScriptExecutionResult> {
    try {
      const isAlive = await this.testConnection();
      if (!isAlive) {
        throw new Error('SSH connection is not available');
      }
      this.logger.log('Starting DNS update via SSH...');
      const result = await this.executeSSHCommand(this.DNS_UPDATE_COMMAND);
      this.logger.log('DNS update completed.');
      return result;
    } catch (error) {
      this.logger.error(`DNS update failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute a custom command on the Docker host via SSH
   * @param command - Command to execute
   * @returns Promise with execution result
   */
  async executeSSHCommand(command: string): Promise<ScriptExecutionResult> {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      let stdout = '';
      let stderr = '';

      conn
        .on('ready', () => {
          this.logger.log('SSH connection established');

          conn.exec(command, (err, stream: ClientChannel) => {
            if (err) {
              conn.end();
              return reject(err);
            }

            stream
              .on('close', (code: number, signal: string) => {
                this.logger.log(
                  `Command finished with exit code: ${code}, signal: ${signal}`,
                );
                conn.end();

                resolve({
                  success: code === 0,
                  stdout: stdout.trim(),
                  stderr: stderr.trim(),
                  exitCode: code,
                });
              })
              .on('data', (data: Buffer) => {
                stdout += data.toString();
                this.logger.debug(`STDOUT: ${data.toString()}`);
              })
              .stderr.on('data', (data: Buffer) => {
                stderr += data.toString();
                this.logger.warn(`STDERR: ${data.toString()}`);
              });
          });
        })
        .on('error', (err) => {
          this.logger.error(`SSH connection error: ${err.message}`);
          reject(err);
        })
        .connect(this.buildSSHConfig());
    });
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
   * Build SSH configuration object
   * @private
   */
  private buildSSHConfig(): ConnectConfig {
    const config: ConnectConfig = {
      host: this.sshConfig.host,
      port: this.sshConfig.port,
      username: this.sshConfig.username,
    };

    // Prefer private key authentication over password
    if (this.sshConfig.privateKey) {
      config.privateKey = this.sshConfig.privateKey;
    } else if (this.sshConfig.password) {
      config.password = this.sshConfig.password;
    }

    return config;
  }
}
