import { Injectable } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import { BotService } from '../shared/instances/bot.service';
import { UserMenuModeService } from '../shared/instances/user-menu-mode.service';
import { UserSettingsService } from '../shared/prisma/user-settings.service';
import { PicoyplacaHandler } from '../picoyplaca/handlers/picoyplaca.handler';
import { TranscaribeHandler } from '../transcaribe/handlers/transcaribe.handler';
import { DevopsHandler } from '../devops/handlers/devops.handler';
import { FinanceHandler } from '../finance/handlers/finance.handler';

@Injectable()
export class TelegramService {
  private readonly bot: TelegramBot;

  constructor(
    private readonly botInstance: BotService,
    private readonly userMenuMode: UserMenuModeService,
    private readonly userSettings: UserSettingsService,
    private readonly picoyplacaHandler: PicoyplacaHandler,
    private readonly transcaribeHandler: TranscaribeHandler,
    private readonly devopsHandler: DevopsHandler,
    private readonly financeHandler: FinanceHandler,
  ) {
    this.bot = this.botInstance.getBot();
    this.setupListeners();
    this.setupCallbackHandlers();
  }

  private async getMainMenuOptions(chatId: number): Promise<TelegramBot.InlineKeyboardButton[][]> {
    const advanced = await this.userMenuMode.isAdvancedUser(chatId);
    const rows: TelegramBot.InlineKeyboardButton[][] = [
      [{ text: '🚍 Transcaribe', callback_data: 'menu:transcaribe' }],
      [{ text: '🚗 Pico y Placa', callback_data: 'menu:picoyplaca' }],
      [
        {
          text: advanced ? '💰 Finance Analyzer' : '💰 Finanzas',
          callback_data: 'menu:finance',
        },
      ],
    ];
    if (advanced) {
      rows.push([{ text: '🔧 DevOps', callback_data: 'menu:devops' }]);
    }
    rows.push([
      {
        text: '⚙️ Cambiar modo de menú',
        callback_data: 'menu:mode_picker',
      },
    ]);
    return rows;
  }

  /** Primera vez o /modo: elegir simple vs avanzado */
  private async showModePicker(chatId: number, messageId?: number): Promise<void> {
    const text =
      '🤖 *Modo del menú*\n\n' +
      '• *Menú simple*: solo lo necesario, textos claros en español.\n' +
      '• *Menú avanzado*: todas las opciones (Finance técnico, DevOps, etc.).\n\n' +
      'Puedes cambiar esto cuando quieras.';

    const keyboard: TelegramBot.InlineKeyboardButton[][] = [
      [
        { text: '📱 Menú simple', callback_data: 'menu:mode_simple' },
        { text: '⚙️ Menú avanzado', callback_data: 'menu:mode_advanced' },
      ],
      [{ text: '⬅️ Volver al menú principal', callback_data: 'menu:main' }],
    ];

    if (messageId) {
      await this.bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard },
      });
    } else {
      await this.botInstance.sendMessageToUser(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard },
      });
    }
  }

  /** /start: si no hay preferencia, selector; si ya eligió, menú de módulos */
  private async showEntryOrMainMenu(chatId: number): Promise<void> {
    const chosen = await this.userMenuMode.hasChosenMenuMode(chatId);
    if (!chosen) {
      await this.showModePicker(chatId);
      return;
    }
    await this.showMainMenu(chatId);
  }

  private async showMainMenu(chatId: number, messageId?: number): Promise<void> {
    const advanced = await this.userMenuMode.isAdvancedUser(chatId);
    const intro = advanced
      ? '🤖 *Menú principal*\n\nElige un módulo:'
      : '🤖 *Menú principal*\n\nElige lo que necesitas:';
    const keyboard = await this.getMainMenuOptions(chatId);

    if (messageId) {
      await this.bot.editMessageText(intro, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard },
      });
    } else {
      await this.botInstance.sendMessageToUser(chatId, intro, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard },
      });
    }
  }

  private setupCallbackHandlers() {
    this.bot.on('callback_query', async (query) => {
      const chatId = query.message.chat.id;
      const data = query.data;

      await this.bot.answerCallbackQuery(query.id);

      const [module, ...rest] = data.split(':');
      const action = rest.join(':');

      switch (module) {
        case 'menu':
          await this.handleMenuNavigation(chatId, action, query.message.message_id);
          break;
        case 'transcaribe':
          await this.transcaribeHandler.handleCallback(chatId, action);
          break;
        case 'picoyplaca':
          await this.picoyplacaHandler.handleCallback(chatId, action);
          break;
        case 'devops':
          if (!(await this.userMenuMode.isAdvancedUser(chatId))) {
            await this.botInstance.sendMessageToUser(
              chatId,
              '🔒 DevOps solo está en *menú avanzado*. Usa *Cambiar modo de menú* en el inicio.',
              { parse_mode: 'Markdown' },
            );
            break;
          }
          await this.devopsHandler.handleCallback(chatId, action);
          break;
        case 'finance':
          await this.financeHandler.handleCallback(chatId, action, query.message.message_id);
          break;
      }
    });
  }

  private async handleMenuNavigation(
    chatId: number,
    action: string,
    messageId?: number,
  ): Promise<void> {
    const uid = String(chatId);

    switch (action) {
      case 'main':
        await this.showMainMenu(chatId, messageId);
        break;
      case 'mode_picker':
        await this.showModePicker(chatId, messageId);
        break;
      case 'mode_simple':
        await this.userSettings.setMenuMode(uid, 'simple');
        await this.showMainMenu(chatId, messageId);
        break;
      case 'mode_advanced':
        await this.userSettings.setMenuMode(uid, 'advanced');
        await this.showMainMenu(chatId, messageId);
        break;
      case 'transcaribe':
        await this.transcaribeHandler.showMenu(chatId);
        break;
      case 'picoyplaca':
        await this.picoyplacaHandler.showMenu(chatId);
        break;
      case 'devops':
        if (!(await this.userMenuMode.isAdvancedUser(chatId))) {
          await this.botInstance.sendMessageToUser(
            chatId,
            '🔒 DevOps solo está disponible en *menú avanzado*. Pulsa *Cambiar modo de menú* y elige avanzado.',
            { parse_mode: 'Markdown' },
          );
          return;
        }
        await this.devopsHandler.showMenu(chatId);
        break;
      case 'finance':
        await this.financeHandler.showMenu(chatId);
        break;
    }
  }

  private async setupListeners() {
    this.bot.onText(/\/start/, async (msg: TelegramBot.Message) => {
      await this.showEntryOrMainMenu(msg.chat.id);
    });

    this.bot.onText(/\/menu/, async (msg: TelegramBot.Message) => {
      await this.showMainMenu(msg.chat.id);
    });

    this.bot.onText(/\/modo/, async (msg: TelegramBot.Message) => {
      await this.showModePicker(msg.chat.id);
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

    this.bot.onText(/\/(addCar|addcar)/, async (msg: TelegramBot.Message) => {
      await this.picoyplacaHandler.addVehicleHandler(msg);
    });

    this.bot.onText(/\/(allCars|allcars)/, async (msg: TelegramBot.Message) => {
      await this.picoyplacaHandler.getVehiclesHandler(msg);
    });

    this.bot.onText(/\/noti/, async (msg: TelegramBot.Message) => {
      await this.picoyplacaHandler.notifyHandler();
    });
  }
}
