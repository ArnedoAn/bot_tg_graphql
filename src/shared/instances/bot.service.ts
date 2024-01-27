import TelegramBot from 'node-telegram-bot-api';
import { Injectable } from '@nestjs/common';

@Injectable()
export class BotService {
  private readonly bot: TelegramBot;
  private readonly token: string;

  constructor() {
    this.token = process.env.TELEGRAM_TOKEN;
    this.bot = new TelegramBot(this.token, { polling: true });
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
