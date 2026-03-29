import { Injectable, Logger } from '@nestjs/common';
import TelegramBot, { InlineKeyboardButton } from 'node-telegram-bot-api';
import { BotService } from '../../shared/instances/bot.service';
import {
  FinanceService,
  BatchProcessingResponse,
  BatchProcessingJobEnqueueResponse,
  ProcessingJobStatusResponse,
} from '../finance.service';

@Injectable()
export class FinanceHandler {
  private readonly logger = new Logger(FinanceHandler.name);
  private readonly bot: TelegramBot;
  private readonly errorMessage = 'Ha ocurrido un error inesperado';

  // Store user state for date selection
  private userDateState: Map<
    number,
    { year: number; month: number; dryRun: boolean }
  > = new Map();

  constructor(
    private readonly financeService: FinanceService,
    private readonly botInstance: BotService,
  ) {
    this.bot = this.botInstance.getBot();
  }

  private getUserId(chatId: number): string {
    return chatId.toString();
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get menu options for Finance module
   */
  getMenuOptions(): InlineKeyboardButton[][] {
    return [
      [
        { text: '🚀 Procesar Transacciones', callback_data: 'finance:batch' },
        { text: '🔍 Modo Prueba', callback_data: 'finance:dryrun' },
      ],
      [
        { text: '📊 Estadísticas', callback_data: 'finance:stats' },
        { text: '📜 Auditoría', callback_data: 'finance:audit' },
      ],
      [
        { text: '🔐 Estado Gmail', callback_data: 'finance:gmail_status' },
        { text: '🔗 Reconectar Gmail', callback_data: 'finance:gmail_reconnect' },
      ],
      [
        { text: '🔑 Configurar Firefly Token', callback_data: 'finance:firefly_token' },
      ],
      [
        { text: '🏥 Health Check', callback_data: 'finance:health' },
      ],
      [
        { text: '⏰ Scheduler', callback_data: 'finance:scheduler' },
        { text: '🔄 Reintentar Fallidos', callback_data: 'finance:retry' },
      ],
      [
        { text: '📧 Ver Senders', callback_data: 'finance:senders' },
        { text: '🧠 Aprender Senders', callback_data: 'finance:learn' },
      ],
      [{ text: '🔄 Sincronizar Firefly', callback_data: 'finance:sync' }],
      [{ text: '⬅️ Volver al menú', callback_data: 'menu:main' }],
    ];
  }

  /**
   * Show finance menu
   */
  async showMenu(chatId: number, messageId?: number): Promise<void> {
    const text = '💰 *Finance Analyzer*\n\nSelecciona una opción:';

    const options = {
      parse_mode: 'Markdown' as const,
      reply_markup: {
        inline_keyboard: this.getMenuOptions(),
      },
    };

    if (messageId) {
      await this.bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        ...options,
      });
    } else {
      await this.bot.sendMessage(chatId, text, options);
    }
  }

  /**
   * Handle callback queries
   */
  async handleCallback(
    chatId: number,
    action: string,
    messageId?: number,
  ): Promise<boolean> {
    // Calendar navigation
    if (action.startsWith('cal_')) {
      await this.handleCalendarNavigation(chatId, action, messageId);
      return true;
    }

    // Date selection
    if (action.startsWith('date_')) {
      await this.handleDateSelection(chatId, action, messageId);
      return true;
    }

    switch (action) {
      case 'menu':
        await this.showMenu(chatId, messageId);
        return true;
      case 'batch':
        await this.initDateSelector(chatId, messageId, false);
        return true;
      case 'dryrun':
        await this.initDateSelector(chatId, messageId, true);
        return true;
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
      case 'firefly_token':
        await this.setFireflyTokenAction(chatId, messageId);
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
      case 'batch_process':
        await this.initDateSelector(chatId, messageId, false);
        return true;
      case 'noop':
        return true;
      default:
        return false;
    }
  }

  /**
   * Initialize date selector calendar
   */
  private async initDateSelector(
    chatId: number,
    messageId: number | undefined,
    dryRun: boolean,
  ): Promise<void> {
    const now = new Date();
    this.userDateState.set(chatId, {
      year: now.getFullYear(),
      month: now.getMonth(),
      dryRun,
    });

    await this.showDateSelector(chatId, messageId, dryRun);
  }

  /**
   * Generate calendar keyboard for date selection
   */
  private generateCalendarKeyboard(
    year: number,
    month: number,
    dryRun: boolean,
  ): InlineKeyboardButton[][] {
    const keyboard: InlineKeyboardButton[][] = [];
    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];

    // Header with month/year navigation
    keyboard.push([
      { text: '◀️', callback_data: `finance:cal_prev_${year}_${month}` },
      { text: `${months[month]} ${year}`, callback_data: 'finance:noop' },
      { text: '▶️', callback_data: `finance:cal_next_${year}_${month}` },
    ]);

    // Day headers
    keyboard.push([
      { text: 'Lu', callback_data: 'finance:noop' },
      { text: 'Ma', callback_data: 'finance:noop' },
      { text: 'Mi', callback_data: 'finance:noop' },
      { text: 'Ju', callback_data: 'finance:noop' },
      { text: 'Vi', callback_data: 'finance:noop' },
      { text: 'Sa', callback_data: 'finance:noop' },
      { text: 'Do', callback_data: 'finance:noop' },
    ]);

    // Days
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startingDay = (firstDay.getDay() + 6) % 7; // Monday = 0

    let week: InlineKeyboardButton[] = [];
    // Empty cells before first day
    for (let i = 0; i < startingDay; i++) {
      week.push({ text: ' ', callback_data: 'finance:noop' });
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      week.push({
        text: String(day),
        callback_data: `finance:date_${dateStr}_${dryRun ? 'dry' : 'live'}`,
      });

      if (week.length === 7) {
        keyboard.push(week);
        week = [];
      }
    }

    // Fill remaining days
    if (week.length > 0) {
      while (week.length < 7) {
        week.push({ text: ' ', callback_data: 'finance:noop' });
      }
      keyboard.push(week);
    }

    // Quick options
    keyboard.push([
      {
        text: '📅 Ayer',
        callback_data: `finance:date_yesterday_${dryRun ? 'dry' : 'live'}`,
      },
      {
        text: '📅 Última semana',
        callback_data: `finance:date_lastweek_${dryRun ? 'dry' : 'live'}`,
      },
    ]);

    keyboard.push([{ text: '🔙 Volver', callback_data: 'menu:finance' }]);

    return keyboard;
  }

  /**
   * Show date selector
   */
  private async showDateSelector(
    chatId: number,
    messageId: number | undefined,
    dryRun: boolean,
  ): Promise<void> {
    const state = this.userDateState.get(chatId);
    const year = state?.year || new Date().getFullYear();
    const month = state?.month || new Date().getMonth();

    const mode = dryRun ? '🔍 Modo Prueba' : '🚀 Modo Real';
    const text = `💰 *Finance Analyzer*\n\n${mode}\n\n📅 Selecciona la fecha desde la cual procesar:`;

    const options = {
      parse_mode: 'Markdown' as const,
      reply_markup: {
        inline_keyboard: this.generateCalendarKeyboard(year, month, dryRun),
      },
    };

    if (messageId) {
      await this.bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        ...options,
      });
    } else {
      await this.bot.sendMessage(chatId, text, options);
    }
  }

  /**
   * Handle calendar navigation
   */
  private async handleCalendarNavigation(
    chatId: number,
    action: string,
    messageId?: number,
  ): Promise<void> {
    if (action === 'noop') return;

    const state = this.userDateState.get(chatId);
    if (!state) return;

    if (action.startsWith('cal_prev_')) {
      const parts = action.split('_');
      state.year = parseInt(parts[2]);
      state.month = parseInt(parts[3]) - 1;
      if (state.month < 0) {
        state.month = 11;
        state.year--;
      }
    } else if (action.startsWith('cal_next_')) {
      const parts = action.split('_');
      state.year = parseInt(parts[2]);
      state.month = parseInt(parts[3]) + 1;
      if (state.month > 11) {
        state.month = 0;
        state.year++;
      }
    }

    this.userDateState.set(chatId, state);
    await this.showDateSelector(chatId, messageId, state.dryRun);
  }

  /**
   * Handle date selection and launch batch processing
   */
  private async handleDateSelection(
    chatId: number,
    action: string,
    messageId?: number,
  ): Promise<void> {
    const parts = action.replace('date_', '').split('_');
    const dryRun = parts[parts.length - 1] === 'dry';
    const dateParam = parts.slice(0, -1).join('_');

    let afterDate: string;
    if (dateParam === 'yesterday') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      afterDate = this.financeService.formatDate(yesterday);
    } else if (dateParam === 'lastweek') {
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);
      afterDate = this.financeService.formatDate(lastWeek);
    } else {
      afterDate = dateParam;
    }

    await this.launchBatchAction(chatId, messageId, afterDate, dryRun);
  }

  /**
   * Launch batch processing action
   */
  private async launchBatchAction(
    chatId: number,
    messageId: number | undefined,
    afterDate: string,
    dryRun: boolean,
  ): Promise<void> {
    const mode = dryRun ? '🔍 Modo Prueba' : '🚀 Modo Real';
    const loadingText = `💰 *Finance Analyzer*\n\n${mode}\n\n⏳ Encolando procesamiento desde ${afterDate}...`;

    if (messageId) {
      await this.bot.editMessageText(loadingText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
    } else {
      await this.bot.sendMessage(chatId, loadingText, { parse_mode: 'Markdown' });
    }

    const result = await this.financeService.launchBatchProcessing(
      this.getUserId(chatId),
      afterDate,
      200,
      dryRun,
    );

    if (!result.success) {
      const text = `💰 *Finance Analyzer*\n\n❌ Error al encolar job: ${result.result}`;
      const keyboard = [[{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }]];
      await this.editOrSend(chatId, messageId, text, keyboard);
      return;
    }

    const enqueueData = result.result as BatchProcessingJobEnqueueResponse;
    const jobId = enqueueData.job_id;
    const pollEverySeconds = 3;
    const queuedText =
      `💰 *Finance Analyzer*\n\n` +
      `${mode}\n\n` +
      `🕒 *Job encolado*\n` +
      `• Job ID: \`${jobId}\`\n` +
      `• Estado inicial: ${enqueueData.status}\n\n` +
      `Voy a monitorearlo y te aviso cuando termine.\n` +
      `⏱️ Polling cada ${pollEverySeconds}s`;

    const keyboard = [[{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }]];
    await this.editOrSend(chatId, messageId, queuedText, keyboard);

    void this.pollBatchJobAndNotify(chatId, jobId, mode);
  }

  private async pollBatchJobAndNotify(
    chatId: number,
    jobId: string,
    modeLabel: string,
  ): Promise<void> {
    const maxAttempts = 120;
    const intervalMs = 3000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await this.sleep(intervalMs);

      const jobResult = await this.financeService.getProcessingJobStatus(
        this.getUserId(chatId),
        jobId,
      );

      if (!jobResult.success) {
        if (attempt % 10 !== 0) continue;
        await this.bot.sendMessage(
          chatId,
          `💰 *Finance Analyzer*\n\n⚠️ No pude consultar el estado del job \`${jobId}\`.\nIntento ${attempt}/${maxAttempts}.`,
          { parse_mode: 'Markdown' },
        );
        continue;
      }

      const job = jobResult.result as ProcessingJobStatusResponse;
      if (job.status === 'queued' || job.status === 'running') continue;

      if (job.status === 'failed') {
        await this.bot.sendMessage(
          chatId,
          `💰 *Finance Analyzer*\n\n${modeLabel}\n\n❌ *Job falló*\n• Job ID: \`${jobId}\`\n• Error: ${job.error_message || 'Sin detalle'}`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }]],
            },
          },
        );
        return;
      }

      if (job.status === 'completed') {
        const data = (job.result || {}) as BatchProcessingResponse;
        const text =
          `💰 *Finance Analyzer*\n\n` +
          `${modeLabel}\n\n` +
          `✅ *Trabajo terminado*\n\n` +
          `• Job ID: \`${jobId}\`\n` +
          `• Total emails: ${data.total_emails ?? 0}\n` +
          `• Procesados: ${data.processed ?? 0}\n` +
          `• Creados: ${data.created ?? 0}\n` +
          `• Omitidos: ${data.skipped ?? 0}\n` +
          `• Fallidos: ${data.failed ?? 0}\n` +
          `• Tiempo: ${data.processing_time_ms ?? 0}ms`;

        await this.bot.sendMessage(chatId, text, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }]],
          },
        });
        return;
      }
    }

    await this.bot.sendMessage(
      chatId,
      `💰 *Finance Analyzer*\n\n⏰ El job \`${jobId}\` sigue en progreso o no respondió a tiempo.\nPuedes intentar nuevamente desde el menú.`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }]],
        },
      },
    );
  }

  /**
   * Show Gmail authentication status
   */
  private async showGmailStatus(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const loadingText = '💰 *Finance Analyzer*\n\n⏳ Verificando estado de Gmail...';

    if (messageId) {
      await this.bot.editMessageText(loadingText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
    }

    const result = await this.financeService.getGmailAuthStatus(this.getUserId(chatId));

    let text: string;
    if (result.success) {
      const data = result.result;
      const status = data.gmail_authenticated ? '✅ Autenticado' : '❌ No autenticado';
      text =
        `💰 *Finance Analyzer*\n\n` +
        `🔐 *Estado de Gmail*\n\n` +
        `• Estado: ${status}\n` +
        `• Email: ${data.email || 'N/A'}\n` +
        `• Mensaje: ${data.message}`;
    } else {
      text = `💰 *Finance Analyzer*\n\n❌ Error: ${result.result}`;
    }

    const keyboard = [[{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }]];
    await this.editOrSend(chatId, messageId, text, keyboard);
  }

  /**
   * Show Gmail reconnect with auth URL
   */
  private async showGmailReconnect(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const loadingText = '💰 *Finance Analyzer*\n\n⏳ Obteniendo URL de autenticación...';

    if (messageId) {
      await this.bot.editMessageText(loadingText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
    }

    const result = await this.financeService.getGmailAuthUrl(this.getUserId(chatId));

    let text: string;
    let keyboard: InlineKeyboardButton[][];

    if (result.success) {
      const data = result.result;
      text =
        `💰 *Finance Analyzer*\n\n` +
        `🔗 *Reconectar Gmail*\n\n` +
        `Para volver a autenticar Gmail, haz clic en el botón de abajo:\n\n` +
        `⚠️ _Este enlace expira en pocos minutos_`;

      keyboard = [
        [{ text: '🔐 Autenticar Gmail', url: data.authorization_url }],
        [{ text: '🔄 Verificar Estado', callback_data: 'finance:gmail_status' }],
        [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
      ];
    } else {
      text = `💰 *Finance Analyzer*\n\n❌ Error: ${result.result}`;
      keyboard = [[{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }]];
    }

    await this.editOrSend(chatId, messageId, text, keyboard);
  }

  /**
   * Show full health check
   */
  private async showHealthCheck(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const loadingText = '💰 *Finance Analyzer*\n\n⏳ Ejecutando health check...';

    if (messageId) {
      await this.bot.editMessageText(loadingText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
    }

    const [healthResult, fireflyResult, deepseekResult] = await Promise.all([
      this.financeService.getHealthCheck(this.getUserId(chatId)),
      this.financeService.getFireflyStatus(this.getUserId(chatId)),
      this.financeService.getDeepSeekStatus(this.getUserId(chatId)),
    ]);

    let text = `💰 *Finance Analyzer*\n\n🏥 *Health Check*\n\n`;

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

    const keyboard = [
      [{ text: '🔄 Actualizar', callback_data: 'finance:health' }],
      [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
    ];
    await this.editOrSend(chatId, messageId, text, keyboard);
  }

  /**
   * Show processing statistics
   */
  private async showStatistics(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const loadingText = '💰 *Finance Analyzer*\n\n⏳ Obteniendo estadísticas...';

    if (messageId) {
      await this.bot.editMessageText(loadingText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
    }

    const result = await this.financeService.getStatistics(this.getUserId(chatId));

    let text = `💰 *Finance Analyzer*\n\n📊 *Estadísticas*\n\n`;

    if (result.success) {
      const stats = result.result;
      for (const [key, value] of Object.entries(stats)) {
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
        text += `• ${label}: ${value}\n`;
      }
    } else {
      text += `❌ Error: ${result.result}`;
    }

    const keyboard = [
      [{ text: '🔄 Actualizar', callback_data: 'finance:stats' }],
      [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
    ];
    await this.editOrSend(chatId, messageId, text, keyboard);
  }

  /**
   * Show audit logs
   */
  private async showAuditLogs(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const loadingText = '💰 *Finance Analyzer*\n\n⏳ Obteniendo logs de auditoría...';

    if (messageId) {
      await this.bot.editMessageText(loadingText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
    }

    const result = await this.financeService.getAuditLogs(this.getUserId(chatId), 10);

    let text = `💰 *Finance Analyzer*\n\n📜 *Últimos 10 logs*\n\n`;

    if (result.success) {
      const logs = result.result.logs || result.result;
      if (Array.isArray(logs) && logs.length > 0) {
        for (const log of logs.slice(0, 10)) {
          const status = log.status === 'created' ? '✅' : log.status === 'failed' ? '❌' : '⏭️';
          const date = log.created_at ? new Date(log.created_at).toLocaleString('es-CO') : 'N/A';
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
    await this.editOrSend(chatId, messageId, text, keyboard);
  }

  /**
   * Show scheduler status
   */
  private async showSchedulerStatus(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const loadingText = '💰 *Finance Analyzer*\n\n⏳ Obteniendo estado del scheduler...';

    if (messageId) {
      await this.bot.editMessageText(loadingText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
    }

    const result = await this.financeService.getSchedulerStatus(this.getUserId(chatId));

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
    await this.editOrSend(chatId, messageId, text, keyboard);
  }

  /**
   * Retry failed emails
   */
  private async retryFailedAction(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const loadingText = '💰 *Finance Analyzer*\n\n⏳ Reintentando emails fallidos...';

    if (messageId) {
      await this.bot.editMessageText(loadingText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
    }

    const result = await this.financeService.retryFailed(this.getUserId(chatId), 50);

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
    await this.editOrSend(chatId, messageId, text, keyboard);
  }

  /**
   * Show known senders
   */
  private async showKnownSenders(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const loadingText = '💰 *Finance Analyzer*\n\n⏳ Obteniendo senders conocidos...';

    if (messageId) {
      await this.bot.editMessageText(loadingText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
    }

    const result = await this.financeService.getKnownSenders(this.getUserId(chatId));

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
    await this.editOrSend(chatId, messageId, text, keyboard);
  }

  /**
   * Learn new senders from emails
   */
  private async learnSendersAction(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const loadingText = '💰 *Finance Analyzer*\n\n⏳ Aprendiendo nuevos senders...';

    if (messageId) {
      await this.bot.editMessageText(loadingText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
    }

    const result = await this.financeService.learnSenders(this.getUserId(chatId), 100, 30);

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
    await this.editOrSend(chatId, messageId, text, keyboard);
  }

  /**
   * Sync Firefly data
   */
  private async syncFireflyAction(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const loadingText = '💰 *Finance Analyzer*\n\n⏳ Sincronizando con Firefly III...';

    if (messageId) {
      await this.bot.editMessageText(loadingText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
    }

    const result = await this.financeService.syncAll(this.getUserId(chatId));

    let text = `💰 *Finance Analyzer*\n\n🔄 *Sincronización Firefly*\n\n`;

    if (result.success) {
      const data = result.result;
      text += `✅ *Sincronización completada*\n\n`;
      if (data.accounts !== undefined) text += `• Cuentas: ${data.accounts}\n`;
      if (data.categories !== undefined) text += `• Categorías: ${data.categories}\n`;
      if (data.message) text += `\n${data.message}`;
    } else {
      text += `❌ Error: ${result.result}`;
    }

    const keyboard = [
      [{ text: '🔄 Sincronizar de nuevo', callback_data: 'finance:sync' }],
      [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
    ];
    await this.editOrSend(chatId, messageId, text, keyboard);
  }

  /**
   * Ask user for Firefly token and send it to Finance API
   */
  private async setFireflyTokenAction(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    if (messageId) {
      await this.bot.editMessageText(
        '💰 *Finance Analyzer*\n\n🔑 Ingresa tu token de Firefly III (PAT):',
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '🔙 Volver', callback_data: 'menu:finance' }]],
          },
        },
      );
    }

    const promptMsg = await this.bot.sendMessage(
      chatId,
      '✍️ Responde a este mensaje con tu token de Firefly.\n\n⚠️ *No compartas este token con nadie.*',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          force_reply: true,
        },
      },
    );

    const token = await this.botInstance.getOnReplyMessageResponse(chatId, promptMsg.message_id);

    const normalizedToken = token?.trim();
    if (!normalizedToken) {
      await this.bot.sendMessage(
        chatId,
        '❌ Token vacío. Intenta de nuevo desde el menú de Finance.',
        {
          reply_markup: {
            inline_keyboard: [[{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }]],
          },
        },
      );
      return;
    }

    const result = await this.financeService.setFireflyToken(
      this.getUserId(chatId),
      normalizedToken,
    );

    if (result.success) {
      await this.bot.sendMessage(
        chatId,
        '✅ Token de Firefly registrado correctamente para tu usuario.',
        {
          reply_markup: {
            inline_keyboard: [[{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }]],
          },
        },
      );
      return;
    }

    await this.bot.sendMessage(
      chatId,
      `❌ Error al registrar token de Firefly: ${result.result}`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }]],
        },
      },
    );
  }

  /**
   * Helper to edit message or send new one
   */
  private async editOrSend(
    chatId: number,
    messageId: number | undefined,
    text: string,
    keyboard: InlineKeyboardButton[][],
  ): Promise<void> {
    const options = {
      parse_mode: 'Markdown' as const,
      reply_markup: { inline_keyboard: keyboard },
    };

    if (messageId) {
      await this.bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        ...options,
      });
    } else {
      await this.bot.sendMessage(chatId, text, options);
    }
  }

  // Legacy handlers for direct commands
  async batchProcessHandler(msg: TelegramBot.Message) {
    await this.initDateSelector(msg.chat.id, undefined, false);
  }
}
