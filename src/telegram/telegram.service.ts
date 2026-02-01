import { Injectable } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import { BotService } from '../shared/instances/bot.service';
import { PicoyplacaHandler } from '../picoyplaca/handlers/picoyplaca.handler';
import { TranscaribeHandler } from '../transcaribe/handlers/transcaribe.handler';
import { DevopsHandler } from '../devops/handlers/devops.handler';
import { FinanceHandler } from '../finance/handlers/finance.handler';

@Injectable()
export class TelegramService {
  private readonly bot: TelegramBot;

  constructor(
    private readonly botInstance: BotService,
    private readonly picoyplacaHandler: PicoyplacaHandler,
    private readonly transcaribeHandler: TranscaribeHandler,
    private readonly devopsHandler: DevopsHandler,
    private readonly financeHandler: FinanceHandler,
  ) {
    this.bot = this.botInstance.getBot();
    this.setupListeners();
    this.setupCallbackHandlers();
  }

  private getMainMenuOptions(): TelegramBot.InlineKeyboardButton[][] {
    return [
      [{ text: '🚍 Transcaribe', callback_data: 'menu:transcaribe' }],
      [{ text: '🚗 Pico y Placa', callback_data: 'menu:picoyplaca' }],
      [{ text: '💰 Finance Analyzer', callback_data: 'menu:finance' }],
      [{ text: '🔧 DevOps', callback_data: 'menu:devops' }],
    ];
  }

  private async showMainMenu(chatId: number) {
    await this.botInstance.sendMessageToUser(
      chatId,
      '🤖 *Menú Principal*\n\nSelecciona un módulo:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: this.getMainMenuOptions(),
        },
      },
    );
  }

  private setupCallbackHandlers() {
    this.bot.on('callback_query', async (query) => {
      const chatId = query.message.chat.id;
      const data = query.data;

      // Acknowledge the callback
      await this.bot.answerCallbackQuery(query.id);

      const [module, ...rest] = data.split(':');
      const action = rest.join(':'); // Rejoin in case action contains ':'

      switch (module) {
        case 'menu':
          await this.handleMenuNavigation(chatId, action);
          break;
        case 'transcaribe':
          await this.transcaribeHandler.handleCallback(chatId, action);
          break;
        case 'picoyplaca':
          await this.picoyplacaHandler.handleCallback(chatId, action);
          break;
        case 'devops':
          await this.devopsHandler.handleCallback(chatId, action);
          break;
        case 'finance':
          await this.financeHandler.handleCallback(chatId, action, query.message.message_id);
          break;
      }
    });
  }

  private async handleMenuNavigation(chatId: number, action: string) {
    switch (action) {
      case 'main':
        await this.showMainMenu(chatId);
        break;
      case 'transcaribe':
        await this.transcaribeHandler.showMenu(chatId);
        break;
      case 'picoyplaca':
        await this.picoyplacaHandler.showMenu(chatId);
        break;
      case 'devops':
        await this.devopsHandler.showMenu(chatId);
        break;
      case 'finance':
        await this.financeHandler.showMenu(chatId);
        break;
    }
  }

  private async setupListeners() {
    this.bot.onText(/\/start/, async (msg: TelegramBot.Message) => {
      await this.showMainMenu(msg.chat.id);
    });

    this.bot.onText(/\/menu/, async (msg: TelegramBot.Message) => {
      await this.showMainMenu(msg.chat.id);
    });

    this.transcaribeListeners();
    this.picoYPlacaListeners();
    this.devopsListeners();
    this.financeListeners();
  }

  private async financeListeners() {
    this.bot.onText(/\/analyze/, async (msg: TelegramBot.Message) => {
      await this.financeHandler.batchProcessHandler(msg);
    });

    this.bot.onText(/\/finance/, async (msg: TelegramBot.Message) => {
      await this.financeHandler.showMenu(msg.chat.id);
    });
  }

  private async devopsListeners() {
    this.bot.onText(/\/dnsupdate/, async (msg: TelegramBot.Message) => {
      await this.devopsHandler.dnsUpdateHandler(msg);
    });

    this.bot.onText(/\/testconnection/, async (msg: TelegramBot.Message) => {
      await this.devopsHandler.testConnectionHandler(msg);
    });

    this.bot.onText(/\/addsubdomain/, async (msg: TelegramBot.Message) => {
      await this.devopsHandler.addSubdomainHandler(msg);
    });

    this.bot.onText(/\/listsubdomains/, async (msg: TelegramBot.Message) => {
      await this.devopsHandler.listSubdomainsHandler(msg);
    });

    this.bot.onText(/\/deletesubdomain/, async (msg: TelegramBot.Message) => {
      await this.devopsHandler.deleteSubdomainHandler(msg);
    });
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

    this.bot.onText(/\/noti/, async (msg: TelegramBot.Message) => {
      await this.picoyplacaHandler.notifyHandler();
    });
  }
}
