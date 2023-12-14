import TelegramBot from 'node-telegram-bot-api';
import { Injectable } from '@nestjs/common';

@Injectable()
export class BotInstance {
  private readonly bot: TelegramBot;
  private readonly token: string;

  constructor() {
    this.token = process.env.TELEGRAM_TOKEN;
    this.bot = new TelegramBot(this.token, { polling: true });
  }

  public getBot(): TelegramBot {
    return this.bot;
  }
}
