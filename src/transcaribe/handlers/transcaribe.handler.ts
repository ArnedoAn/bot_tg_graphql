import { Injectable } from '@nestjs/common';
import { TranscaribeService } from '../transcaribe.service';
import { BotInstance } from 'src/shared/instances/bot.instance';
import TelegramBot from 'node-telegram-bot-api';
import { CONSTANTS } from '../helpers/operations.helper';

@Injectable()
export class TranscaribeHandler {
  private readonly bot: TelegramBot;
  private readonly errorMessage = `Ha ocurrido un error, intenta de nuevo.`;
  private readonly options = {
    reply_markup: {
      keyboard: [[{ text: '+' }, { text: '-' }]],
      resize_keyboard: true,
    },
  };
  private readonly TARIFA: number;
  private readonly responseMessages = {
    GOOD: {
      init: {
        first: `Ingresa el saldo inicial de tu tarjeta ($COP):`,
        second: `Tarjeta creada con éxito.`,
      },
      addOrSubstract: (balance: number) => `Saldo actual (Pasajes): ${balance}`,
      cardBalance: (balance: number) =>
        `Tu saldo es: $${balance} \n${Math.trunc(
          balance / this.TARIFA,
        )} pasajes disponibles.`,
      setBalance: {
        first: `Ingresa el nuevo saldo de tu tarjeta ($COP):`,
        second: (balance: number) =>
          `Saldo actualizado con éxito.\n` +
          this.responseMessages.GOOD.cardBalance(balance),
      },
      deleteCardHistory: `Historial borrado con éxito.`,
      deleteCard: `Tarjeta borrada con éxito.`,
      cardHistory: (history: any) => history.map(this.formatTransaction),
    },
    BAD: {
      init: {
        first: `Ya tienes una tarjeta registrada.`,
        second: (amount: number) =>
          `Cantidad no válida: $${amount}. Debe ser mayor o igual a 0 . `,
      },
      add: `Ha ocurrido un error, intenta de nuevo.`,
      subtract: `Ha ocurrido un error, intenta de nuevo.`,
      verifyBalance: `No tienes saldo suficiente.`,
      verifyUser: `No tienes una tarjeta registrada, usa el comando /init para crear una.`,
      cardBalance: `No tienes una tarjeta registrada, usa el comando /init para crear una.`,
    },
  };
  constructor(
    private readonly transcaribeService: TranscaribeService,
    private readonly botInstace: BotInstance,
  ) {
    this.bot = this.botInstace.getBot();
    this.TARIFA = CONSTANTS.tarifa;
  }

  private formatTransaction(transaction: any): string {
    const formattedDate = new Date(transaction.fecha).toLocaleString('es-CO', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      timeZoneName: 'short',
    });

    const amountColor = transaction.monto >= 0 ? '🟢' : '🔴'; // Puedes cambiar por emojis
    const formattedAmount = new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
    }).format(transaction.monto);

    return `${formattedDate}\n${amountColor} ${formattedAmount}`;
  }

  private async verifyUser(chatId: string) {
    const result = await this.transcaribeService.getCardBalance(chatId);
    if (!result) {
      return false;
    }
    return true;
  }

  private verifyBalance(balance: number, amount: number) {
    if (balance - amount < 0) {
      return false;
    }
    return true;
  }

  private async verifyBalanceHandler(
    msg: TelegramBot.Message,
    count: number = 1,
  ) {
    const balance = await this.transcaribeService.getCardBalance(
      msg.chat.id.toString(),
    );
    if (
      this.verifyBalance(
        balance.saldoDisponible,
        Math.abs(count) * this.TARIFA,
      ) == false
    ) {
      throw new Error(this.responseMessages.BAD.verifyBalance);
    }
  }

  private async verifyUserHandler(msg: TelegramBot.Message) {
    if ((await this.verifyUser(msg.chat.id.toString())) == false) {
      throw new Error(this.responseMessages.BAD.verifyUser);
    }
  }

  private async verifyAmountHandler(amount: number) {
    if (amount < 0 || amount / this.TARIFA < 0) {
      throw new Error(this.responseMessages.BAD.init.second(amount));
    }
  }

  private async sendMessageToUser(
    chatId: number,
    message: string,
    options: TelegramBot.SendMessageOptions = null,
  ): Promise<TelegramBot.Message> {
    return await this.bot.sendMessage(chatId, message, options);
  }

  private async getNumberOnReplyMessageResponse(
    chatId: number,
    message_id: number,
  ): Promise<number> {
    return new Promise((resolve) => {
      this.bot.onReplyToMessage(chatId, message_id, (msgToReply) => {
        resolve(parseInt(msgToReply.text || '0'));
      });
    });
  }

  async initHandler(msg: TelegramBot.Message) {
    try {
      if (await this.verifyUser(msg.chat.id.toString()))
        throw new Error(this.responseMessages.BAD.init.first);

      const count = await this.sendMessageToUser(
        msg.chat.id,
        this.responseMessages.GOOD.init.first,
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );

      const newCardBalance = await this.getNumberOnReplyMessageResponse(
        msg.chat.id,
        count.message_id,
      );

      await this.verifyAmountHandler(newCardBalance);

      const cardCreated = await this.transcaribeService.newUserCard(
        msg.chat.id.toString(),
        newCardBalance,
      );
      if (!cardCreated.success) throw new Error(cardCreated.result);
      await this.bot.sendMessage(
        msg.chat.id,
        this.responseMessages.GOOD.init.second,
      );
    } catch (err) {
      await this.sendMessageToUser(
        msg.chat.id,
        err.message.replace('Error:', '') || this.errorMessage,
        this.options,
      );
      return;
    }
  }

  async addMoneyToCardHandler(msg: TelegramBot.Message, count: number = 1) {
    try {
      await this.verifyUserHandler(msg);
      const result = await this.transcaribeService.cardOperation(
        count,
        msg.chat.id.toString(),
      );
      if (!result.success) throw new Error(result.result);
      await this.transcaribeService.registerCardOperation(
        count,
        msg.chat.id.toString(),
      );
      await this.sendMessageToUser(
        msg.chat.id,
        this.responseMessages.GOOD.addOrSubstract(result.result),
        this.options,
      );
      return;
    } catch (err) {
      await this.sendMessageToUser(
        msg.chat.id,
        err.message.replace('Error:', '') || this.responseMessages.BAD.add,
        this.options,
      );
      return;
    }
  }

  async subtractMoneyFromCardHandler(
    msg: TelegramBot.Message,
    count: number = -1,
  ) {
    try {
      await this.verifyUserHandler(msg);
      await this.verifyBalanceHandler(msg);
      const result = await this.transcaribeService.cardOperation(
        count,
        msg.chat.id.toString(),
      );
      if (!result.success) throw new Error(result.result);
      await this.transcaribeService.registerCardOperation(
        count,
        msg.chat.id.toString(),
      );
      await this.sendMessageToUser(
        msg.chat.id,
        this.responseMessages.GOOD.addOrSubstract(result.result),
        this.options,
      );
      return;
    } catch (err) {
      await this.sendMessageToUser(
        msg.chat.id,
        err.message.replace('Error:', '') || this.responseMessages.BAD.subtract,
        this.options,
      );
      return;
    }
  }

  async getCardBalanceHandler(msg: TelegramBot.Message) {
    try {
      await this.verifyUserHandler(msg);
      const getCardBalance = await this.transcaribeService.getCardBalance(
        msg.chat.id.toString(),
      );
      if (!getCardBalance)
        throw new Error(this.responseMessages.BAD.cardBalance);
      await this.sendMessageToUser(
        msg.chat.id,
        this.responseMessages.GOOD.cardBalance(getCardBalance.saldoDisponible),
        this.options,
      );
    } catch (err) {
      await this.sendMessageToUser(
        msg.chat.id,
        err.message.replace('Error:', '') ||
          this.responseMessages.BAD.cardBalance,
        this.options,
      );
      return;
    }
  }

  async setBalanceHandler(msg: TelegramBot.Message) {
    try {
      await this.verifyUserHandler(msg);
      const setCount = await this.sendMessageToUser(
        msg.chat.id,
        this.responseMessages.GOOD.setBalance.first,
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );
      const newCardBalance: number = await this.getNumberOnReplyMessageResponse(
        msg.chat.id,
        setCount.message_id,
      );
      await this.verifyAmountHandler(newCardBalance);
      const balanceSeted = await this.transcaribeService.setBalance(
        msg.chat.id.toString(),
        newCardBalance,
      );
      if (!balanceSeted.success) throw new Error(balanceSeted.result);
      await this.sendMessageToUser(
        msg.chat.id,
        this.responseMessages.GOOD.setBalance.second(newCardBalance),
        this.options,
      );
    } catch (err) {
      await this.sendMessageToUser(
        msg.chat.id,
        err.message.replace('Error:', '') || this.errorMessage,
        this.options,
      );
      return;
    }
  }

  async deleteCardHistoryHandler(msg: TelegramBot.Message) {
    try {
      await this.verifyUserHandler(msg);
      const result = await this.transcaribeService.deleteCardHistory(
        msg.chat.id.toString(),
      );
      if (!result.success) throw new Error(result.result);
      await this.sendMessageToUser(
        msg.chat.id,
        this.responseMessages.GOOD.deleteCardHistory,
        this.options,
      );
    } catch (err) {
      await this.sendMessageToUser(
        msg.chat.id,
        err.message.replace('Error:', '') || this.errorMessage,
        this.options,
      );
      return;
    }
  }

  async deleteCardHandler(msg: TelegramBot.Message) {
    try {
      await this.verifyUserHandler(msg);
      const result = await this.transcaribeService.deleteCard(
        msg.chat.id.toString(),
      );
      if (!result.success) throw new Error(result.result);
      await this.sendMessageToUser(
        msg.chat.id,
        this.responseMessages.GOOD.deleteCard,
        this.options,
      );
    } catch (err) {
      await this.sendMessageToUser(
        msg.chat.id,
        err.message.replace('Error:', '') || this.errorMessage,
        this.options,
      );
      return;
    }
  }

  async getCardHistoryHandler(msg: TelegramBot.Message) {
    try {
      await this.verifyUserHandler(msg);
      const result = await this.transcaribeService.getCardHistory(
        msg.chat.id.toString(),
      );
      if (!result.success) throw new Error(result.result);
      const history = this.responseMessages.GOOD.cardHistory(result.result);
      const historyMessage = history.join('\n\n');
      await this.sendMessageToUser(msg.chat.id, historyMessage, this.options);
    } catch (err) {
      await this.sendMessageToUser(
        msg.chat.id,
        err.message.replace('Error:', '') || this.errorMessage,
        this.options,
      );
      return;
    }
  }
}
