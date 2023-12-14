import { Injectable } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
//import TelegramBot from 'node-telegram-bot-api';

@Injectable()
export class TelegramService {
  private readonly bot: any;
  private readonly token: string;
  private readonly options = {
    reply_markup: {
      keyboard: [[{ text: '+' }, { text: '-' }]],
      resize_keyboard: true,
    },
  };

  constructor() {
    this.token = process.env.TELEGRAM_TOKEN;
    this.bot = new TelegramBot(this.token, { polling: true });

    this.setupListeners();
  }

  private async setupListeners() {
    this.bot.onText(/\/start/, async (msg: TelegramBot.Message) => {
      await this.bot.sendMessage(msg.chat.id, 'Hello, I am a bot!');
    });

    this.transcaribeListeners();
    this.picoYPlacaListeners();
  }

  private async transcaribeListeners() {
    this.bot.onText(/\+/, async (msg: TelegramBot.Message) => {
      await this.bot.sendMessage(msg.chat.id, 'You pressed +');
    });

    this.bot.onText(/\-/, async (msg: TelegramBot.Message) => {
      await this.bot.sendMessage(msg.chat.id, 'You pressed -');
    });

    this.bot.onText(/\/saldo/, async (msg: TelegramBot.Message) => {
      await this.bot.sendMessage(msg.chat.id, 'Your saldo is 0');
    });

    this.bot.onText(/\/actualizar/, async (msg: TelegramBot.Message) => {
      await this.bot.sendMessage(msg.chat.id, 'Updating saldo...');
    });

    this.bot.onText(/\/borrarhistorial/, async (msg: TelegramBot.Message) => {
      await this.bot.sendMessage(msg.chat.id, 'Deleting history...');
    });

    this.bot.onText(/\/borrartarjeta/, async (msg: TelegramBot.Message) => {
      await this.bot.sendMessage(msg.chat.id, 'Your history is empty');
    });

    this.bot.onText(/\/historial/, async (msg: TelegramBot.Message) => {
      await this.bot.sendMessage(msg.chat.id, 'Your history is empty');
    });
  }

  private async picoYPlacaListeners() {
    this.bot.onText(/\/pico/, async (msg: TelegramBot.Message) => {
      await this.bot.sendMessage(msg.chat.id, 'You pressed pico');
    });
  }
}
