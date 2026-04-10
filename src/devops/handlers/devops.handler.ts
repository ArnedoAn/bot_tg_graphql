import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BotService } from '../../shared/instances/bot.service';
import TelegramBot from 'node-telegram-bot-api';
import { DevopsService } from '../devops.service';

@Injectable()
export class DevopsHandler {
  private readonly bot: TelegramBot;
  private readonly errorMessage = 'Ha ocurrido un error inesperado';
  private readonly adminId: string;
  private readonly unauthorizedMessage =
    '🔒 No tienes permisos para acceder al módulo de DevOps.';

  constructor(
    private readonly devopsService: DevopsService,
    private readonly botInstance: BotService,
    private readonly configService: ConfigService,
  ) {
    this.bot = this.botInstance.getBot();
    this.adminId = this.configService.get<string>('ADMIN_ID');
  }

  private isAdmin(chatId: number): boolean {
    return String(chatId) === this.adminId;
  }

  private async denyAccess(chatId: number): Promise<void> {
    await this.botInstance.sendMessageToUser(chatId, this.unauthorizedMessage);
  }

  getMenuOptions(): TelegramBot.InlineKeyboardButton[][] {
    return [
      [{ text: '🔄 Actualizar DNS', callback_data: 'devops:dns_update' }],
      [{ text: '📋 Listar Subdominios', callback_data: 'devops:list_subdomains' }],
      [{ text: '➕ Agregar Subdominio', callback_data: 'devops:add_subdomain' }],
      [{ text: '🗑️ Eliminar Subdominio', callback_data: 'devops:delete_subdomain' }],
      [{ text: '📡 Listar Forwardings (Caddy)', callback_data: 'devops:caddy_list' }],
      [{ text: '🌐 Agregar Forwarding (Caddy)', callback_data: 'devops:caddy_add' }],
      [{ text: '🔌 Test Conexión SSH', callback_data: 'devops:test_connection' }],
      [{ text: '⬅️ Volver al menú', callback_data: 'menu:main' }],
    ];
  }

  async showMenu(chatId: number) {
    if (!this.isAdmin(chatId)) return this.denyAccess(chatId);

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
    if (!this.isAdmin(chatId)) return this.denyAccess(chatId);

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
      case 'caddy_list':
        await this.caddyListAction(chatId);
        break;
      case 'caddy_add':
        await this.caddyAddAction(chatId);
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

      const { text: subdomain } = await this.botInstance.getOnReplyMessageResponse(
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

      const { text: subdomain } = await this.botInstance.getOnReplyMessageResponse(
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

  private async caddyListAction(chatId: number) {
    try {
      await this.botInstance.sendMessageToUser(
        chatId,
        '📡 Obteniendo forwardings de Caddy...',
      );

      const result = await this.devopsService.listCaddyForwardings();

      let responseMessage = '';
      if (result.success) {
        responseMessage = `✅ *Forwardings activos en Caddy:*\n\n`;
        responseMessage += result.stdout
          ? `\`\`\`\n${result.stdout}\n\`\`\``
          : '_No se encontraron forwardings_';
      } else {
        responseMessage = `❌ Error al listar forwardings\n\n`;
        if (result.stderr) responseMessage += `⚠️ Error:\n${result.stderr}`;
      }

      await this.botInstance.sendMessageToUser(chatId, responseMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🌐 Agregar Forwarding', callback_data: 'devops:caddy_add' }],
            [{ text: '⬅️ Volver al menú DevOps', callback_data: 'menu:devops' }],
          ],
        },
      });
    } catch (err) {
      await this.botInstance.sendMessageToUser(
        chatId,
        `❌ ${err.message || this.errorMessage}`,
      );
    }
  }

  private async caddyAddAction(chatId: number) {
    try {
      const domainMsg = await this.botInstance.sendMessageToUser(
        chatId,
        '🌐 *Nuevo forwarding en Caddy*\n\nIngresa el dominio o subdominio:\n\n_Ejemplo: api.tudominio.com_',
        {
          parse_mode: 'Markdown',
          reply_markup: { force_reply: true },
        },
      );
      const { text: domain } = await this.botInstance.getOnReplyMessageResponse(
        chatId,
        domainMsg.message_id,
      );

      const portMsg = await this.botInstance.sendMessageToUser(
        chatId,
        '🔌 Ingresa el puerto local al que deseas hacer forwarding:\n\n_Ejemplo: 3000_',
        {
          parse_mode: 'Markdown',
          reply_markup: { force_reply: true },
        },
      );
      const { text: port } = await this.botInstance.getOnReplyMessageResponse(
        chatId,
        portMsg.message_id,
      );

      const descMsg = await this.botInstance.sendMessageToUser(
        chatId,
        '📝 Ingresa una descripción para este forwarding:\n\n_Se insertará como comentario antes del bloque en el Caddyfile_',
        {
          parse_mode: 'Markdown',
          reply_markup: { force_reply: true },
        },
      );
      const { text: description } = await this.botInstance.getOnReplyMessageResponse(
        chatId,
        descMsg.message_id,
      );

      await this.botInstance.sendMessageToUser(
        chatId,
        `🔄 Agregando forwarding *${domain}* → \`:${port}\`...`,
        { parse_mode: 'Markdown' },
      );

      const result = await this.devopsService.addCaddyForwarding(domain, port, description);

      let responseMessage = '';
      if (result.success) {
        responseMessage = `✅ Forwarding agregado exitosamente\n\n`;
        responseMessage += `🌐 *Dominio:* \`${domain}\`\n`;
        responseMessage += `🔌 *Puerto:* \`${port}\`\n`;
        responseMessage += `📝 *Descripción:* ${description}\n\n`;
        if (result.stdout) responseMessage += `📋 ${result.stdout}`;
      } else {
        responseMessage = `❌ Error al agregar forwarding\n\n`;
        if (result.stderr) responseMessage += `⚠️ Error:\n${result.stderr}`;
        if (result.stdout) responseMessage += `\n${result.stdout}`;
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

  // Legacy handlers for direct commands
  async dnsUpdateHandler(msg: TelegramBot.Message) {
    if (!this.isAdmin(msg.chat.id)) return this.denyAccess(msg.chat.id);
    await this.dnsUpdateAction(msg.chat.id);
  }

  async testConnectionHandler(msg: TelegramBot.Message) {
    if (!this.isAdmin(msg.chat.id)) return this.denyAccess(msg.chat.id);
    await this.testConnectionAction(msg.chat.id);
  }

  async addSubdomainHandler(msg: TelegramBot.Message) {
    if (!this.isAdmin(msg.chat.id)) return this.denyAccess(msg.chat.id);
    await this.addSubdomainAction(msg.chat.id);
  }

  async listSubdomainsHandler(msg: TelegramBot.Message) {
    if (!this.isAdmin(msg.chat.id)) return this.denyAccess(msg.chat.id);
    await this.listSubdomainsAction(msg.chat.id);
  }

  async deleteSubdomainHandler(msg: TelegramBot.Message) {
    if (!this.isAdmin(msg.chat.id)) return this.denyAccess(msg.chat.id);
    await this.deleteSubdomainAction(msg.chat.id);
  }
}
