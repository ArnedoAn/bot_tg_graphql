import { Injectable } from '@nestjs/common';
import TelegramBot, { InlineKeyboardButton } from 'node-telegram-bot-api';
import { BotService } from '../../shared/instances/bot.service';
import { UserMenuModeService } from '../../shared/instances/user-menu-mode.service';
import { FinanceService, BatchProcessingResponse } from '../finance.service';
import {
  financeTitle as financeTitleHelper,
  getUserId as getUserIdHelper,
  editOrSend as editOrSendHelper,
} from './finance.helpers';

@Injectable()
export class FinanceStatusHandler {
  private readonly bot: TelegramBot;
  private readonly errorMessage = 'Ha ocurrido un error inesperado';

  constructor(
    private readonly financeService: FinanceService,
    private readonly botInstance: BotService,
    private readonly userMenuMode: UserMenuModeService,
  ) {
    this.bot = this.botInstance.getBot();
  }

  private async isAdvanced(chatId: number): Promise<boolean> {
    return this.userMenuMode.isAdvancedUser(chatId);
  }

  /**
   * Show user id sent to Finance API (header X-User-Id)
   */
  async showApiUserId(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const adv = await this.isAdvanced(chatId);
    const userId = getUserIdHelper(chatId);
    const text = adv
      ? `${financeTitleHelper(adv)}\n\n` +
        `🆔 *User ID para la API*\n\n` +
        `Este valor se envía en el header *X-User-Id* en todas las peticiones al Finance API:\n\n` +
        `\`${userId}\`\n\n` +
        `_Equivale a tu Telegram chat id (string)._`
      : `${financeTitleHelper(adv)}\n\n` +
        `🆔 *Tu código de usuario*\n\n` +
        `Si el soporte te lo pide, envía este número:\n\n` +
        `\`${userId}\`\n\n` +
        `_Es tu identificador en Telegram (solo para este bot)._`;

    const keyboard = [
      [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
    ];
    await editOrSendHelper(this.bot, chatId, messageId, text, keyboard);
  }

  /**
   * Show Gmail authentication status
   */
  async showGmailStatus(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const adv = await this.isAdvanced(chatId);
    const loadingText = `${financeTitleHelper(adv)}\n\n⏳ Comprobando Gmail...`;

    if (messageId) {
      await this.bot.editMessageText(loadingText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
    }

    const result = await this.financeService.getGmailAuthStatus(
      getUserIdHelper(chatId),
    );

    let text: string;
    if (result.success) {
      const data = result.result;
      if (adv) {
        const status = data.gmail_authenticated
          ? '✅ Autenticado'
          : '❌ No autenticado';
        text =
          `${financeTitleHelper(adv)}\n\n` +
          `🔐 *Estado de Gmail*\n\n` +
          `• Estado: ${status}\n` +
          `• Email: ${data.email || 'N/A'}\n` +
          `• Mensaje: ${data.message}`;
      } else {
        const ok = data.gmail_authenticated;
        text =
          `${financeTitleHelper(adv)}\n\n` +
          `✉️ *Gmail*\n\n` +
          (ok
            ? `✅ *Conectado*\nCuenta: ${data.email || '—'}\n\n${data.message || ''}`
            : `❌ *Aún no conectado*\nUsa *Conectar o renovar Gmail* para iniciar sesión.\n\n${data.message || ''}`);
      }
    } else {
      text = adv
        ? `${financeTitleHelper(adv)}\n\n❌ Error: ${result.result}`
        : `${financeTitleHelper(adv)}\n\n❌ No se pudo comprobar Gmail. Intenta más tarde.\n\n_Detalle: ${result.result}_`;
    }

    const keyboard = [
      [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
    ];
    await editOrSendHelper(this.bot, chatId, messageId, text, keyboard);
  }

  /**
   * Show Gmail reconnect with auth URL
   */
  async showGmailReconnect(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const adv = await this.isAdvanced(chatId);
    const loadingText = `${financeTitleHelper(adv)}\n\n⏳ Preparando enlace seguro...`;

    if (messageId) {
      await this.bot.editMessageText(loadingText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
    }

    const result = await this.financeService.getGmailAuthUrl(
      getUserIdHelper(chatId),
    );

    let text: string;
    let keyboard: InlineKeyboardButton[][];

    if (result.success) {
      const data = result.result;
      text = adv
        ? `${financeTitleHelper(adv)}\n\n` +
          `🔗 *Reconectar Gmail*\n\n` +
          `Para volver a autenticar Gmail, haz clic en el botón de abajo:\n\n` +
          `⚠️ _Este enlace expira en pocos minutos_`
        : `${financeTitleHelper(adv)}\n\n` +
          `🔗 *Conectar Gmail*\n\n` +
          `Pulsa el botón, inicia sesión con Google y vuelve aquí.\n\n` +
          `⚠️ _El enlace caduca en pocos minutos._`;

      keyboard = [
        [
          {
            text: adv ? '🔐 Autenticar Gmail' : '🔐 Abrir Google',
            url: data.authorization_url,
          },
        ],
        [
          {
            text: '🔄 Comprobar de nuevo',
            callback_data: 'finance:gmail_status',
          },
        ],
        [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
      ];
    } else {
      text = adv
        ? `${financeTitleHelper(adv)}\n\n❌ Error: ${result.result}`
        : `${financeTitleHelper(adv)}\n\n❌ No se pudo abrir el enlace. Intenta de nuevo.\n\n_Detalle: ${result.result}_`;
      keyboard = [
        [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
      ];
    }

    await editOrSendHelper(this.bot, chatId, messageId, text, keyboard);
  }

  /**
   * Show full health check
   */
  async showHealthCheck(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const adv = await this.isAdvanced(chatId);
    const loadingText = `${financeTitleHelper(adv)}\n\n⏳ Revisando que todo funcione...`;

    if (messageId) {
      await this.bot.editMessageText(loadingText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
    }

    const [healthResult, fireflyResult, deepseekResult] = await Promise.all([
      this.financeService.getHealthCheck(getUserIdHelper(chatId)),
      this.financeService.getFireflyStatus(getUserIdHelper(chatId)),
      this.financeService.getDeepSeekStatus(getUserIdHelper(chatId)),
    ]);

    let text: string;

    if (adv) {
      text = `${financeTitleHelper(adv)}\n\n🏥 *Health Check*\n\n`;

      if (healthResult.success) {
        const h = healthResult.result;
        text += `*General:*\n`;
        text += `• Estado: ${h.status === 'healthy' ? '✅' : '❌'} ${h.status}\n`;
        text += `• Versión: ${h.version}\n`;
        text += `• Ambiente: ${h.environment}\n\n`;

        if (h.services) {
          text += `*Servicios:*\n`;
          for (const [service, status] of Object.entries(h.services)) {
            text += `• ${service}: ${status ? '✅' : '❌'}\n`;
          }
        }
      } else {
        text += `❌ API no disponible\n`;
      }

      text += `\n*Firefly III:* `;
      text += fireflyResult.success
        ? `✅ ${fireflyResult.result?.connected ? 'Conectado' : 'Disponible'}`
        : `❌ Error`;

      text += `\n*DeepSeek AI:* `;
      text += deepseekResult.success
        ? `✅ ${deepseekResult.result?.connected ? 'Conectado' : 'Disponible'}`
        : `❌ Error`;
    } else {
      const apiOk =
        healthResult.success && healthResult.result?.status === 'healthy';
      const fireflyOk =
        fireflyResult.success && fireflyResult.result?.connected;
      text =
        `${financeTitleHelper(adv)}\n\n` +
        `✅ *Estado del servicio*\n\n` +
        `• Servicio principal: ${apiOk ? '✅ Todo bien' : '⚠️ Hay un problema'}\n` +
        `• Conexión con Firefly: ${fireflyOk ? '✅ Lista' : '⚠️ Revisa o sincroniza'}\n\n` +
        `_Si algo falla, revisa Gmail y el token de Firefly._`;
    }

    const keyboard = [
      [{ text: '🔄 Actualizar', callback_data: 'finance:health' }],
      [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
    ];
    await editOrSendHelper(this.bot, chatId, messageId, text, keyboard);
  }

  /**
   * Show processing statistics
   */
  async showStatistics(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const loadingText =
      '💰 *Finance Analyzer*\n\n⏳ Obteniendo estadísticas...';

    if (messageId) {
      await this.bot.editMessageText(loadingText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
    }

    const result = await this.financeService.getStatistics(
      getUserIdHelper(chatId),
    );

    let text = `💰 *Finance Analyzer*\n\n📊 *Estadísticas*\n\n`;

    if (result.success) {
      const stats = result.result;
      for (const [key, value] of Object.entries(stats)) {
        const label = key
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (l) => l.toUpperCase());
        text += `• ${label}: ${value}\n`;
      }
    } else {
      text += `❌ Error: ${result.result}`;
    }

    const keyboard = [
      [{ text: '🔄 Actualizar', callback_data: 'finance:stats' }],
      [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
    ];
    await editOrSendHelper(this.bot, chatId, messageId, text, keyboard);
  }

  /**
   * Show audit logs
   */
  async showAuditLogs(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const loadingText =
      '💰 *Finance Analyzer*\n\n⏳ Obteniendo logs de auditoría...';

    if (messageId) {
      await this.bot.editMessageText(loadingText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
    }

    const result = await this.financeService.getAuditLogs(
      getUserIdHelper(chatId),
      10,
    );

    let text = `💰 *Finance Analyzer*\n\n📜 *Últimos 10 logs*\n\n`;

    if (result.success) {
      const logs = result.result.logs || result.result;
      if (Array.isArray(logs) && logs.length > 0) {
        for (const log of logs.slice(0, 10)) {
          const status =
            log.status === 'created'
              ? '✅'
              : log.status === 'failed'
                ? '❌'
                : '⏭️';
          const date = log.created_at
            ? new Date(log.created_at).toLocaleString('es-CO')
            : 'N/A';
          text += `${status} \`${(log.email_id || 'unknown').substring(0, 12)}...\`\n`;
          text += `   ${date}\n`;
        }
      } else {
        text += `No hay logs disponibles.`;
      }
    } else {
      text += `❌ Error: ${result.result}`;
    }

    const keyboard = [
      [{ text: '🔄 Actualizar', callback_data: 'finance:audit' }],
      [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
    ];
    await editOrSendHelper(this.bot, chatId, messageId, text, keyboard);
  }

  /**
   * Show scheduler status
   */
  async showSchedulerStatus(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const loadingText =
      '💰 *Finance Analyzer*\n\n⏳ Obteniendo estado del scheduler...';

    if (messageId) {
      await this.bot.editMessageText(loadingText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
    }

    const result = await this.financeService.getSchedulerStatus(
      getUserIdHelper(chatId),
    );

    let text = `💰 *Finance Analyzer*\n\n⏰ *Estado del Scheduler*\n\n`;

    if (result.success) {
      const data = result.result;
      text += `• Running: ${data.running ? '✅ Sí' : '❌ No'}\n`;
      if (data.jobs && Array.isArray(data.jobs)) {
        text += `\n*Jobs:*\n`;
        for (const job of data.jobs) {
          text += `• ${job.id || job.name}: ${job.next_run || 'N/A'}\n`;
        }
      }
    } else {
      text += `❌ Error: ${result.result}`;
    }

    const keyboard = [
      [{ text: '🔄 Actualizar', callback_data: 'finance:scheduler' }],
      [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
    ];
    await editOrSendHelper(this.bot, chatId, messageId, text, keyboard);
  }

  /**
   * Retry failed emails
   */
  async retryFailedAction(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const loadingText =
      '💰 *Finance Analyzer*\n\n⏳ Reintentando emails fallidos...';

    if (messageId) {
      await this.bot.editMessageText(loadingText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
    }

    const result = await this.financeService.retryFailed(
      getUserIdHelper(chatId),
      50,
    );

    let text = `💰 *Finance Analyzer*\n\n🔄 *Reintentar Fallidos*\n\n`;

    if (result.success) {
      const data = result.result as BatchProcessingResponse;
      text +=
        `✅ *Procesamiento completado*\n\n` +
        `• Total: ${data.total_emails}\n` +
        `• Creados: ${data.created}\n` +
        `• Fallidos: ${data.failed}\n` +
        `• Tiempo: ${data.processing_time_ms}ms`;
    } else {
      text += `❌ Error: ${result.result}`;
    }

    const keyboard = [
      [{ text: '🔄 Reintentar de nuevo', callback_data: 'finance:retry' }],
      [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
    ];
    await editOrSendHelper(this.bot, chatId, messageId, text, keyboard);
  }

  /**
   * Show known senders
   */
  async showKnownSenders(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const loadingText =
      '💰 *Finance Analyzer*\n\n⏳ Obteniendo senders conocidos...';

    if (messageId) {
      await this.bot.editMessageText(loadingText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
    }

    const result = await this.financeService.getKnownSenders(
      getUserIdHelper(chatId),
    );

    let text = `💰 *Finance Analyzer*\n\n📧 *Senders Conocidos*\n\n`;

    if (result.success) {
      const senders = result.result;
      if (Array.isArray(senders) && senders.length > 0) {
        for (const sender of senders.slice(0, 15)) {
          const status = sender.is_active ? '✅' : '❌';
          text += `${status} *${sender.sender_name}*\n`;
          text += `   \`${sender.keyword}\`\n`;
          text += `   Emails: ${sender.emails_matched} | Tipo: ${sender.sender_type}\n\n`;
        }
        if (senders.length > 15) {
          text += `_...y ${senders.length - 15} más_`;
        }
      } else {
        text += `No hay senders configurados.`;
      }
    } else {
      text += `❌ Error: ${result.result}`;
    }

    const keyboard = [
      [{ text: '🧠 Aprender Nuevos', callback_data: 'finance:learn' }],
      [{ text: '🔄 Actualizar', callback_data: 'finance:senders' }],
      [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
    ];
    await editOrSendHelper(this.bot, chatId, messageId, text, keyboard);
  }

  /**
   * Learn new senders from emails
   */
  async learnSendersAction(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const loadingText =
      '💰 *Finance Analyzer*\n\n⏳ Aprendiendo nuevos senders...';

    if (messageId) {
      await this.bot.editMessageText(loadingText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
    }

    const result = await this.financeService.learnSenders(
      getUserIdHelper(chatId),
      100,
      30,
    );

    let text = `💰 *Finance Analyzer*\n\n🧠 *Aprender Senders*\n\n`;

    if (result.success) {
      const data = result.result;
      text +=
        `✅ *Aprendizaje completado*\n\n` +
        `• Emails analizados: ${data.emails_analyzed}\n` +
        `• Senders aprendidos: ${data.senders_learned}\n`;

      if (data.new_senders && data.new_senders.length > 0) {
        text += `\n*Nuevos senders:*\n`;
        for (const sender of data.new_senders.slice(0, 5)) {
          text += `• ${sender.sender_name || sender.keyword}\n`;
        }
      }
    } else {
      text += `❌ Error: ${result.result}`;
    }

    const keyboard = [
      [{ text: '📧 Ver Senders', callback_data: 'finance:senders' }],
      [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
    ];
    await editOrSendHelper(this.bot, chatId, messageId, text, keyboard);
  }

  /**
   * Sync Firefly data
   */
  async syncFireflyAction(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const adv = await this.isAdvanced(chatId);
    const loadingText = `${financeTitleHelper(adv)}\n\n⏳ Sincronizando con Firefly...`;

    if (messageId) {
      await this.bot.editMessageText(loadingText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
    }

    const result = await this.financeService.syncAll(getUserIdHelper(chatId));

    let text: string;

    if (result.success) {
      const data = result.result;
      if (adv) {
        text = `${financeTitleHelper(adv)}\n\n🔄 *Sincronización Firefly*\n\n`;
        text += `✅ *Sincronización completada*\n\n`;
        if (data.accounts !== undefined)
          text += `• Cuentas: ${data.accounts}\n`;
        if (data.categories !== undefined)
          text += `• Categorías: ${data.categories}\n`;
        if (data.message) text += `\n${data.message}`;
      } else {
        text =
          `${financeTitleHelper(adv)}\n\n` +
          `✅ *Datos actualizados en Firefly*\n\n` +
          (data.accounts !== undefined
            ? `• Cuentas sincronizadas: ${data.accounts}\n`
            : '') +
          (data.categories !== undefined
            ? `• Categorías: ${data.categories}\n`
            : '') +
          (data.message ? `\n${data.message}` : '');
      }
    } else {
      text = adv
        ? `${financeTitleHelper(adv)}\n\n🔄 *Sincronización Firefly*\n\n❌ Error: ${result.result}`
        : `${financeTitleHelper(adv)}\n\n❌ No se pudo sincronizar con Firefly.\n\n_Detalle: ${result.result}_`;
    }

    const keyboard = [
      [{ text: '🔄 Sincronizar de nuevo', callback_data: 'finance:sync' }],
      [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
    ];
    await editOrSendHelper(this.bot, chatId, messageId, text, keyboard);
  }

  async handleCallback(
    chatId: number,
    action: string,
    messageId?: number,
  ): Promise<boolean> {
    switch (action) {
      case 'stats':
        await this.showStatistics(chatId, messageId);
        return true;
      case 'audit':
        await this.showAuditLogs(chatId, messageId);
        return true;
      case 'gmail_status':
        await this.showGmailStatus(chatId, messageId);
        return true;
      case 'gmail_reconnect':
        await this.showGmailReconnect(chatId, messageId);
        return true;
      case 'health':
        await this.showHealthCheck(chatId, messageId);
        return true;
      case 'show_user_id':
        await this.showApiUserId(chatId, messageId);
        return true;
      case 'scheduler':
        await this.showSchedulerStatus(chatId, messageId);
        return true;
      case 'retry':
        await this.retryFailedAction(chatId, messageId);
        return true;
      case 'senders':
        await this.showKnownSenders(chatId, messageId);
        return true;
      case 'learn':
        await this.learnSendersAction(chatId, messageId);
        return true;
      case 'sync':
        await this.syncFireflyAction(chatId, messageId);
        return true;
      case 'noop':
        return true;
      default:
        return false;
    }
  }
}
