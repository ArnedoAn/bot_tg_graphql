import TelegramBot from 'node-telegram-bot-api';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);
  private readonly bot: TelegramBot;
  private readonly token: string;

  constructor() {
    this.token = process.env.TELEGRAM_TOKEN;
    this.bot = new TelegramBot(this.token, { polling: true });
    void this.configureInternalMenu();
  }

  private async configureInternalMenu(): Promise<void> {
    try {
      await this.bot.setMyCommands([
        { command: 'start', description: 'Inicia el bot y muestra el menu principal' },
        { command: 'menu', description: 'Abre el menu principal' },
        { command: 'finance', description: 'Abre el modulo de finanzas' },
        { command: 'analyze', description: 'Procesa transacciones de emails' },
        { command: 'init', description: 'Registra tu tarjeta Transcaribe' },
        { command: 'saldo', description: 'Consulta saldo de Transcaribe' },
        { command: 'historial', description: 'Consulta historial de tarjeta' },
        { command: 'pico', description: 'Consulta pico y placa del dia' },
        { command: 'addcar', description: 'Agrega un vehiculo para alertas' },
        { command: 'allcars', description: 'Lista tus vehiculos registrados' },
      ]);

      this.logger.log('Menu interno de comandos configurado');
    } catch (error) {
      this.logger.warn(`No se pudo configurar el menu interno: ${error.message}`);
    }
  }

  public getBot(): TelegramBot {
    return this.bot;
  }

  async sendMessageToUser(
    chatId: number,
    message: string,
    options: TelegramBot.SendMessageOptions = {},
  ): Promise<TelegramBot.Message> {
    return await this.bot.sendMessage(chatId, message, options);
  }

  async getOnReplyMessageResponse(
    chatId: number,
    message_id: number,
  ): Promise<string> {
    return new Promise((resolve) => {
      this.bot.onReplyToMessage(chatId, message_id, (msgToReply) => {
        resolve(msgToReply.text);
      });
    });
  }
}
