import { Injectable } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import { BotInstance } from 'src/shared/instances/bot.instance';
import { PicoyplacaHandler } from 'src/picoyplaca/handlers/picoyplaca.handler';
import { TranscaribeHandler } from 'src/transcaribe/handlers/transcaribe.handler';

@Injectable()
export class TelegramService {
  private readonly bot: TelegramBot;

  constructor(
    private readonly botInstance: BotInstance,
    private readonly picoyplacaHandler: PicoyplacaHandler,
    private readonly transcaribeHandler: TranscaribeHandler,
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
    this.bot.onText(/\/init/, async (msg: TelegramBot.Message) => {
      await this.transcaribeHandler.initHandler(msg);
    });

    this.bot.onText(/^\+$/, async (msg: TelegramBot.Message) => {
      await this.transcaribeHandler.addMoneyToCardHandler(msg);
    });

    this.bot.onText(/^\-$/, async (msg: TelegramBot.Message) => {
      await this.transcaribeHandler.subtractMoneyFromCardHandler(msg);
    });

    this.bot.onText(/\/saldo/, async (msg: TelegramBot.Message) => {
      await this.transcaribeHandler.getCardBalanceHandler(msg);
    });

    this.bot.onText(/\/actualizar/, async (msg: TelegramBot.Message) => {
      await this.transcaribeHandler.setBalanceHandler(msg);
    });

    this.bot.onText(/\/borrarhistorial/, async (msg: TelegramBot.Message) => {
      await this.transcaribeHandler.deleteCardHistoryHandler(msg);
    });

    this.bot.onText(/\/borrartarjeta/, async (msg: TelegramBot.Message) => {
      await this.transcaribeHandler.deleteCardHandler(msg);
    });

    this.bot.onText(/\/historial/, async (msg: TelegramBot.Message) => {
      await this.transcaribeHandler.getCardHistoryHandler(msg);
    });
  }

  private async picoYPlacaListeners() {
    this.bot.onText(/\/pico/, async (msg: TelegramBot.Message) => {
      await this.picoyplacaHandler.picoHandler(msg);
    });
  }
}
