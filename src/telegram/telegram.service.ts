import { Injectable } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import { BotService } from '../shared/instances/bot.service';
import { PicoyplacaHandler } from '../picoyplaca/handlers/picoyplaca.handler';
import { TranscaribeHandler } from '../transcaribe/handlers/transcaribe.handler';

@Injectable()
export class TelegramService {
  private readonly bot: TelegramBot;

  constructor(
    private readonly botInstance: BotService,
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

    this.bot.onText(/\/info/, async (msg: TelegramBot.Message) => {
      await this.transcaribeHandler.getInfoHandler(msg);
    });

    this.bot.onText(/\/saldo/, async (msg: TelegramBot.Message) => {
      await this.transcaribeHandler.balanceHandler(msg);
    });

    this.bot.onText(/\/historial/, async (msg: TelegramBot.Message) => {
      await this.transcaribeHandler.cardHistoryHandler(msg);
    });
  }

  private async picoYPlacaListeners() {
    this.bot.onText(/\/pico/, async (msg: TelegramBot.Message) => {
      await this.picoyplacaHandler.picoHandler(msg);
    });

    this.bot.onText(/\/addCar/, async (msg: TelegramBot.Message) => {
      await this.picoyplacaHandler.addVehicleHandler(msg);
    });

    this.bot.onText(/\/allCars/, async (msg: TelegramBot.Message) => {
      await this.picoyplacaHandler.getVehiclesHandler(msg);
    });
  }
}
