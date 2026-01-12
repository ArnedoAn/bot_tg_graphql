import { Injectable } from '@nestjs/common';
import {
  CONSTANTS as Const,
  setUTCDate as dateFormat,
} from '../helpers/operations.helper';
import { BotService } from '../../shared/instances/bot.service';
import TelegramBot from 'node-telegram-bot-api';
import { TranscaribeService } from '../transcaribe.service';

@Injectable()
export class TranscaribeHandler {
  private readonly bot: TelegramBot;
  private readonly TARIFA: number;
  private readonly errorMessage = 'Ha ocurrido un error inesperado';
  constructor(
    private readonly transcaribeService: TranscaribeService,
    private readonly botInstace: BotService,
  ) {
    this.bot = this.botInstace.getBot();
    this.TARIFA = Const.tarifa;
  }

  getMenuOptions(): TelegramBot.InlineKeyboardButton[][] {
    return [
      [{ text: '💳 Registrar Tarjeta', callback_data: 'transcaribe:init' }],
      [{ text: '💰 Consultar Saldo', callback_data: 'transcaribe:saldo' }],
      [{ text: '📜 Ver Historial', callback_data: 'transcaribe:historial' }],
      [{ text: '⬅️ Volver al menú', callback_data: 'menu:main' }],
    ];
  }

  async showMenu(chatId: number) {
    await this.botInstace.sendMessageToUser(
      chatId,
      '🚍 *Transcaribe Menu*\n\nSelecciona una opción:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: this.getMenuOptions(),
        },
      },
    );
  }

  async handleCallback(chatId: number, action: string) {
    switch (action) {
      case 'init':
        await this.initAction(chatId);
        break;
      case 'saldo':
        await this.balanceAction(chatId);
        break;
      case 'historial':
        await this.cardHistoryAction(chatId);
        break;
    }
  }

  private async verifyUser(chatId: string) {
    const result = await this.transcaribeService.userExists(chatId);
    if (!result) {
      return false;
    }
    return true;
  }

  private async initAction(chatId: number) {
    try {
      if (await this.verifyUser(chatId.toString()))
        throw new Error('Ya tienes una tarjeta registrada');

      const firtMsg = await this.botInstace.sendMessageToUser(
        chatId,
        'Ingresa el número de la tarjeta que deseas registrar',
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );

      const cardApi = await this.botInstace.getOnReplyMessageResponse(
        chatId,
        firtMsg.message_id,
      );

      const secondMsg = await this.botInstace.sendMessageToUser(
        chatId,
        'Ingresa el Api Key de la tarjeta',
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );

      const apiKey = await this.botInstace.getOnReplyMessageResponse(
        chatId,
        secondMsg.message_id,
      );

      const cardCreated = await this.transcaribeService.createCard(
        chatId.toString(),
        cardApi,
        apiKey,
      );

      if (!cardCreated.success) throw new Error(cardCreated.result);
      await this.bot.sendMessage(chatId, 'Tarjeta registrada exitosamente');
    } catch (err) {
      await this.botInstace.sendMessageToUser(
        chatId,
        err.message.replace('Error:', '') || this.errorMessage,
      );
    }
  }

  private async balanceAction(chatId: number) {
    try {
      if (!(await this.verifyUser(chatId.toString())))
        throw new Error('No tienes una tarjeta registrada');

      const balance = await this.transcaribeService.getBalance(
        chatId.toString(),
      );
      if (!balance.success) throw new Error(balance.result);
      await this.botInstace.sendMessageToUser(chatId, balance.result);
    } catch (err) {
      await this.botInstace.sendMessageToUser(
        chatId,
        err.message || this.errorMessage,
      );
    }
  }

  private async cardHistoryAction(chatId: number) {
    try {
      if (!(await this.verifyUser(chatId.toString())))
        throw new Error('No tienes una tarjeta registrada');

      const history = await this.transcaribeService.getHistory(
        chatId.toString(),
      );
      if (!history.success) throw new Error(history.result);
      for (const message of history.result) {
        await this.botInstace.sendMessageToUser(chatId, message);
      }
    } catch (err) {
      await this.botInstace.sendMessageToUser(
        chatId,
        err.message || this.errorMessage,
      );
    }
  }

  // Legacy handlers for direct commands
  async initHandler(msg: TelegramBot.Message) {
    await this.initAction(msg.chat.id);
  }

  async balanceHandler(msg: TelegramBot.Message) {
    await this.balanceAction(msg.chat.id);
  }

  async cardHistoryHandler(msg: TelegramBot.Message) {
    await this.cardHistoryAction(msg.chat.id);
  }

  async getInfoHandler(msg: TelegramBot.Message) {
    try {
      const cardInfo = await this.transcaribeService.getCardInfo(
        msg.chat.id.toString(),
      );
      if (!cardInfo) throw new Error("cardInfo.result doesn't exist");
      await this.botInstace.sendMessageToUser(msg.chat.id, 'Funcionando');
    } catch (err) {
      console.error(err.message);
      await this.botInstace.sendMessageToUser(msg.chat.id, this.errorMessage);
      return;
    }
  }
}
