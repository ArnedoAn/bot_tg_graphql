import { Injectable } from '@nestjs/common';
import { BotService } from '../../shared/instances/bot.service';
import TelegramBot from 'node-telegram-bot-api';
import { DevopsService } from '../devops.service';

@Injectable()
export class DevopsHandler {
  private readonly bot: TelegramBot;
  private readonly errorMessage = 'Ha ocurrido un error inesperado';

  constructor(
    private readonly devopsService: DevopsService,
    private readonly botInstance: BotService,
  ) {
    this.bot = this.botInstance.getBot();
  }

  async dnsUpdateHandler(msg: TelegramBot.Message) {
    try {
      await this.botInstance.sendMessageToUser(
        msg.chat.id,
        '🔄 Iniciando actualización de DNS...',
      );

      const result = await this.devopsService.executeDNSUpdate();

      let responseMessage = '';
      
      if (result.success) {
        responseMessage = `✅ DNS actualizado exitosamente\n\n`;
        if (result.stdout) {
          responseMessage += `📋 Resultado:\n${result.stdout}`;
        }
      } else {
        responseMessage = `❌ Error al actualizar DNS\n\n`;
        if (result.stderr) {
          responseMessage += `⚠️ Error:\n${result.stderr}`;
        }
        if (result.exitCode) {
          responseMessage += `\n\nCódigo de salida: ${result.exitCode}`;
        }
      }

      await this.botInstance.sendMessageToUser(msg.chat.id, responseMessage);
    } catch (err) {
      await this.botInstance.sendMessageToUser(
        msg.chat.id,
        `❌ ${err.message || this.errorMessage}`,
      );
      return;
    }
  }

  async testConnectionHandler(msg: TelegramBot.Message) {
    try {
      await this.botInstance.sendMessageToUser(
        msg.chat.id,
        '🔍 Probando conexión SSH...',
      );

      const isConnected = await this.devopsService.testConnection();

      const responseMessage = isConnected
        ? '✅ Conexión SSH exitosa'
        : '❌ Fallo en la conexión SSH';

      await this.botInstance.sendMessageToUser(msg.chat.id, responseMessage);
    } catch (err) {
      await this.botInstance.sendMessageToUser(
        msg.chat.id,
        `❌ ${err.message || this.errorMessage}`,
      );
      return;
    }
  }
}
