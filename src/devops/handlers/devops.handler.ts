import { Injectable } from '@nestjs/common';
import { BotService } from '../../shared/instances/bot.service';
import TelegramBot from 'node-telegram-bot-api';
import { DevopsService } from '../devops.service';

@Injectable()
export class DevopsHandler {
  private readonly bot: TelegramBot;
  private readonly errorMessage = 'Ha ocurrido un error inesperado';

  constructor(
    private readonly devopsService: DevopsService,
    private readonly botInstance: BotService,
  ) {
    this.bot = this.botInstance.getBot();
  }

  getMenuOptions(): TelegramBot.InlineKeyboardButton[][] {
    return [
      [{ text: '🔄 Actualizar DNS', callback_data: 'devops:dns_update' }],
      [{ text: '📋 Listar Subdominios', callback_data: 'devops:list_subdomains' }],
      [{ text: '➕ Agregar Subdominio', callback_data: 'devops:add_subdomain' }],
      [{ text: '🗑️ Eliminar Subdominio', callback_data: 'devops:delete_subdomain' }],
      [{ text: '🔌 Test Conexión SSH', callback_data: 'devops:test_connection' }],
      [{ text: '⬅️ Volver al menú', callback_data: 'menu:main' }],
    ];
  }

  async showMenu(chatId: number) {
    await this.botInstance.sendMessageToUser(
      chatId,
      '🔧 *DevOps Menu*\n\nSelecciona una opción:',
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
      case 'dns_update':
        await this.dnsUpdateAction(chatId);
        break;
      case 'list_subdomains':
        await this.listSubdomainsAction(chatId);
        break;
      case 'list_subdomains_detailed':
        await this.listSubdomainsAction(chatId, true);
        break;
      case 'add_subdomain':
        await this.addSubdomainAction(chatId);
        break;
      case 'delete_subdomain':
        await this.deleteSubdomainAction(chatId);
        break;
      case 'test_connection':
        await this.testConnectionAction(chatId);
        break;
    }
  }

  private async dnsUpdateAction(chatId: number) {
    try {
      await this.botInstance.sendMessageToUser(
        chatId,
        '🔄 Iniciando actualización de DNS...',
      );

      const result = await this.devopsService.executeDNSUpdate();

      let responseMessage = '';
      if (result.success) {
        responseMessage = `✅ DNS actualizado exitosamente\n\n`;
        if (result.stdout) {
          responseMessage += `📋 Resultado:\n${result.stdout}`;
        }
      } else {
        responseMessage = `❌ Error al actualizar DNS\n\n`;
        if (result.stderr) {
          responseMessage += `⚠️ Error:\n${result.stderr}`;
        }
      }

      await this.botInstance.sendMessageToUser(chatId, responseMessage);
    } catch (err) {
      await this.botInstance.sendMessageToUser(
        chatId,
        `❌ ${err.message || this.errorMessage}`,
      );
    }
  }

  private async testConnectionAction(chatId: number) {
    try {
      await this.botInstance.sendMessageToUser(
        chatId,
        '🔍 Probando conexión SSH...',
      );

      const isConnected = await this.devopsService.testConnection();

      const responseMessage = isConnected
        ? '✅ Conexión SSH exitosa'
        : '❌ Fallo en la conexión SSH';

      await this.botInstance.sendMessageToUser(chatId, responseMessage);
    } catch (err) {
      await this.botInstance.sendMessageToUser(
        chatId,
        `❌ ${err.message || this.errorMessage}`,
      );
    }
  }

  private async addSubdomainAction(chatId: number) {
    try {
      const promptMsg = await this.botInstance.sendMessageToUser(
        chatId,
        '🌐 Ingresa el nombre del subdominio que deseas agregar:\n\n_Ejemplo: api, blog, app_',
        {
          parse_mode: 'Markdown',
          reply_markup: { force_reply: true },
        },
      );

      const subdomain = await this.botInstance.getOnReplyMessageResponse(
        chatId,
        promptMsg.message_id,
      );

      await this.botInstance.sendMessageToUser(
        chatId,
        `🔄 Agregando subdominio "${subdomain}"...`,
      );

      const result = await this.devopsService.addDNSSubdomain(subdomain);

      let responseMessage = '';
      if (result.success) {
        responseMessage = `✅ Subdominio "${subdomain}" agregado exitosamente\n\n`;
        if (result.stdout) {
          responseMessage += `📋 Resultado:\n${result.stdout}`;
        }
      } else {
        responseMessage = `❌ Error al agregar subdominio\n\n`;
        if (result.stderr) {
          responseMessage += `⚠️ Error:\n${result.stderr}`;
        }
      }

      await this.botInstance.sendMessageToUser(chatId, responseMessage);
    } catch (err) {
      await this.botInstance.sendMessageToUser(
        chatId,
        `❌ ${err.message || this.errorMessage}`,
      );
    }
  }

  private async listSubdomainsAction(chatId: number, detailed: boolean = false) {
    try {
      await this.botInstance.sendMessageToUser(
        chatId,
        '📋 Obteniendo lista de subdominios...',
      );

      const result = await this.devopsService.listDNSSubdomains(detailed);

      let responseMessage = '';
      if (result.success) {
        responseMessage = `✅ *Subdominios registrados:*\n\n`;
        if (result.stdout) {
          responseMessage += `\`\`\`\n${result.stdout}\n\`\`\``;
        } else {
          responseMessage += '_No hay subdominios registrados_';
        }

        // Offer detailed view if not already detailed
        if (!detailed) {
          await this.botInstance.sendMessageToUser(chatId, responseMessage, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔍 Ver detallado', callback_data: 'devops:list_subdomains_detailed' }],
                [{ text: '⬅️ Volver al menú', callback_data: 'menu:devops' }],
              ],
            },
          });
          return;
        }
      } else {
        responseMessage = `❌ Error al listar subdominios\n\n`;
        if (result.stderr) {
          responseMessage += `⚠️ Error:\n${result.stderr}`;
        }
      }

      await this.botInstance.sendMessageToUser(chatId, responseMessage, {
        parse_mode: 'Markdown',
      });
    } catch (err) {
      await this.botInstance.sendMessageToUser(
        chatId,
        `❌ ${err.message || this.errorMessage}`,
      );
    }
  }

  private async deleteSubdomainAction(chatId: number) {
    try {
      const promptMsg = await this.botInstance.sendMessageToUser(
        chatId,
        '🗑️ Ingresa el nombre del subdominio que deseas eliminar:\n\n⚠️ _Esta acción no se puede deshacer_',
        {
          parse_mode: 'Markdown',
          reply_markup: { force_reply: true },
        },
      );

      const subdomain = await this.botInstance.getOnReplyMessageResponse(
        chatId,
        promptMsg.message_id,
      );

      await this.botInstance.sendMessageToUser(
        chatId,
        `🔄 Eliminando subdominio "${subdomain}"...`,
      );

      const result = await this.devopsService.deleteDNSSubdomain(subdomain);

      let responseMessage = '';
      if (result.success) {
        responseMessage = `✅ Subdominio "${subdomain}" eliminado exitosamente\n\n`;
        if (result.stdout) {
          responseMessage += `📋 Resultado:\n${result.stdout}`;
        }
      } else {
        responseMessage = `❌ Error al eliminar subdominio\n\n`;
        if (result.stderr) {
          responseMessage += `⚠️ Error:\n${result.stderr}`;
        }
      }

      await this.botInstance.sendMessageToUser(chatId, responseMessage);
    } catch (err) {
      await this.botInstance.sendMessageToUser(
        chatId,
        `❌ ${err.message || this.errorMessage}`,
      );
    }
  }

  // Legacy handlers for direct commands
  async dnsUpdateHandler(msg: TelegramBot.Message) {
    await this.dnsUpdateAction(msg.chat.id);
  }

  async testConnectionHandler(msg: TelegramBot.Message) {
    await this.testConnectionAction(msg.chat.id);
  }

  async addSubdomainHandler(msg: TelegramBot.Message) {
    await this.addSubdomainAction(msg.chat.id);
  }

  async listSubdomainsHandler(msg: TelegramBot.Message) {
    await this.listSubdomainsAction(msg.chat.id);
  }

  async deleteSubdomainHandler(msg: TelegramBot.Message) {
    await this.deleteSubdomainAction(msg.chat.id);
  }
}
