import { Injectable } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import { BotInstance } from 'src/shared/instances/bot.instance';
import { PicoyplacaHandler } from 'src/picoyplaca/handlers/picoyplaca.handler';

@Injectable()
export class TelegramService {
  private readonly bot: TelegramBot;

  constructor(
    private readonly botInstance: BotInstance,
    private readonly picoyplacaHandler: PicoyplacaHandler,
  ) {
    this.bot = this.botInstance.getBot();
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
      await this.picoyplacaHandler.picoHandler(msg);
    });
  }
}
