import { Injectable, Logger } from '@nestjs/common';
import TelegramBot, { InlineKeyboardButton } from 'node-telegram-bot-api';
import { BotService } from '../../shared/instances/bot.service';
import { UserMenuModeService } from '../../shared/instances/user-menu-mode.service';
import {
  FinanceService,
  BatchProcessingResponse,
  BatchProcessingJobEnqueueResponse,
  ProcessingJobStatusResponse,
} from '../finance.service';
import { FeatureFlagsService } from '../../shared/prisma/feature-flags.service';
import {
  FinanceOnboardingService,
  FinanceWizardStep,
  FINANCE_WIZARD_STEPS,
} from '../../shared/prisma/finance-onboarding.service';
import { BotAssetService } from '../../shared/prisma/bot-asset.service';
import { FEATURE_FLAGS } from '../../shared/constants/feature-flag-keys';

@Injectable()
export class FinanceHandler {
  private readonly logger = new Logger(FinanceHandler.name);
  private readonly bot: TelegramBot;
  private readonly errorMessage = 'Ha ocurrido un error inesperado';

  /** Instancia Firefly del usuario y UI Finance (onboarding). */
  private readonly onboardingUrls = {
    fireflyHome: 'https://finance-fly.toothless.codes/',
    fireflyProfile: 'https://finance-fly.toothless.codes/profile',
    financeWeb: 'https://finance.toothless.codes/',
    financeSetup: 'https://finance.toothless.codes/settings/setup',
  } as const;

  // Store user state for date selection
  private userDateState: Map<
    number,
    { year: number; month: number; dryRun: boolean }
  > = new Map();

  /** Tras configurar token desde el asistente, volver al flujo del tutorial */
  private readonly wizardAfterToken: Set<number> = new Set();

  constructor(
    private readonly financeService: FinanceService,
    private readonly botInstance: BotService,
    private readonly userMenuMode: UserMenuModeService,
    private readonly featureFlags: FeatureFlagsService,
    private readonly onboarding: FinanceOnboardingService,
    private readonly botAssets: BotAssetService,
  ) {
    this.bot = this.botInstance.getBot();
  }

  private async isAdvanced(chatId: number): Promise<boolean> {
    return this.userMenuMode.isAdvancedUser(chatId);
  }

  /** Título de sección según perfil */
  private financeTitle(advanced: boolean): string {
    return advanced ? '💰 *Finance Analyzer*' : '💰 *Finanzas*';
  }

  private getUserId(chatId: number): string {
    return chatId.toString();
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async sectionOn(key: (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS]): Promise<boolean> {
    return this.featureFlags.isEnabled(key);
  }

  /**
   * Menú usuario común: tutorial primero, operaciones aparte.
   */
  private async buildSimpleMenuOptions(): Promise<InlineKeyboardButton[][]> {
    const rows: InlineKeyboardButton[][] = [];
    if (await this.sectionOn(FEATURE_FLAGS.FINANCE_SECTION_TUTORIAL)) {
      rows.push([
        { text: '🎓 Configurar finanzas (tutorial)', callback_data: 'finance:wizard' },
      ]);
    }
    if (await this.sectionOn(FEATURE_FLAGS.FINANCE_SECTION_REVIEW)) {
      rows.push([{ text: '📋 Revisar configuración', callback_data: 'finance:review_setup' }]);
    }
    rows.push([
      { text: '⚙️ Operaciones (correo, Gmail, token…)', callback_data: 'finance:ops_menu' },
    ]);
    if (await this.sectionOn(FEATURE_FLAGS.FINANCE_SECTION_APK)) {
      rows.push([{ text: '📥 Obtener APK', callback_data: 'finance:get_apk' }]);
    }
    rows.push([{ text: '⬅️ Volver al menú', callback_data: 'menu:main' }]);
    return rows;
  }

  /**
   * Menú avanzado: tutorial + operaciones técnicas filtradas por flags.
   */
  private async buildAdvancedMenuOptions(): Promise<InlineKeyboardButton[][]> {
    const rows: InlineKeyboardButton[][] = [];
    if (await this.sectionOn(FEATURE_FLAGS.FINANCE_SECTION_TUTORIAL)) {
      rows.push([
        { text: '🎓 Tutorial / asistente', callback_data: 'finance:wizard' },
      ]);
    }
    if (await this.sectionOn(FEATURE_FLAGS.FINANCE_SECTION_REVIEW)) {
      rows.push([{ text: '📋 Revisar configuración', callback_data: 'finance:review_setup' }]);
    }

    const batchRow: InlineKeyboardButton[] = [];
    if (await this.sectionOn(FEATURE_FLAGS.FINANCE_SECTION_BATCH)) {
      batchRow.push({ text: '🚀 Procesar Transacciones', callback_data: 'finance:batch' });
    }
    if (await this.sectionOn(FEATURE_FLAGS.FINANCE_SECTION_DRYRUN)) {
      batchRow.push({ text: '🔍 Modo Prueba', callback_data: 'finance:dryrun' });
    }
    if (batchRow.length) rows.push(batchRow);

    const statsRow: InlineKeyboardButton[] = [];
    if (await this.sectionOn(FEATURE_FLAGS.FINANCE_SECTION_STATS)) {
      statsRow.push({ text: '📊 Estadísticas', callback_data: 'finance:stats' });
    }
    if (await this.sectionOn(FEATURE_FLAGS.FINANCE_SECTION_AUDIT)) {
      statsRow.push({ text: '📜 Auditoría', callback_data: 'finance:audit' });
    }
    if (statsRow.length) rows.push(statsRow);

    const gmailRow: InlineKeyboardButton[] = [];
    if (await this.sectionOn(FEATURE_FLAGS.FINANCE_SECTION_GMAIL)) {
      gmailRow.push(
        { text: '🔐 Estado Gmail', callback_data: 'finance:gmail_status' },
        { text: '🔗 Reconectar Gmail', callback_data: 'finance:gmail_reconnect' },
      );
    }
    if (gmailRow.length) rows.push(gmailRow);

    if (await this.sectionOn(FEATURE_FLAGS.FINANCE_SECTION_FIREFLY_TOKEN)) {
      rows.push([{ text: '🔑 Configurar Firefly Token', callback_data: 'finance:firefly_token' }]);
    }
    if (await this.sectionOn(FEATURE_FLAGS.FINANCE_SECTION_USER_ID)) {
      rows.push([{ text: '🆔 Ver User ID (API)', callback_data: 'finance:show_user_id' }]);
    }
    if (await this.sectionOn(FEATURE_FLAGS.FINANCE_SECTION_HEALTH)) {
      rows.push([{ text: '🏥 Health Check', callback_data: 'finance:health' }]);
    }

    const schedRow: InlineKeyboardButton[] = [];
    if (await this.sectionOn(FEATURE_FLAGS.FINANCE_SECTION_SCHEDULER)) {
      schedRow.push({ text: '⏰ Scheduler', callback_data: 'finance:scheduler' });
    }
    if (await this.sectionOn(FEATURE_FLAGS.FINANCE_SECTION_RETRY)) {
      schedRow.push({ text: '🔄 Reintentar Fallidos', callback_data: 'finance:retry' });
    }
    if (schedRow.length) rows.push(schedRow);

    const sendersRow: InlineKeyboardButton[] = [];
    if (await this.sectionOn(FEATURE_FLAGS.FINANCE_SECTION_SENDERS)) {
      sendersRow.push({ text: '📧 Ver Senders', callback_data: 'finance:senders' });
    }
    if (await this.sectionOn(FEATURE_FLAGS.FINANCE_SECTION_LEARN)) {
      sendersRow.push({ text: '🧠 Aprender Senders', callback_data: 'finance:learn' });
    }
    if (sendersRow.length) rows.push(sendersRow);

    if (await this.sectionOn(FEATURE_FLAGS.FINANCE_SECTION_SYNC)) {
      rows.push([{ text: '🔄 Sincronizar Firefly', callback_data: 'finance:sync' }]);
    }

    if (await this.sectionOn(FEATURE_FLAGS.FINANCE_SECTION_APK)) {
      rows.push([{ text: '📥 Obtener APK', callback_data: 'finance:get_apk' }]);
    }

    rows.push([{ text: '⬅️ Volver al menú', callback_data: 'menu:main' }]);
    return rows;
  }

  /** Submenú de operaciones para menú simple (mismas acciones que antes, filtradas). */
  private async buildSimpleOperationsMenu(): Promise<InlineKeyboardButton[][]> {
    const rows: InlineKeyboardButton[][] = [];
    if (await this.sectionOn(FEATURE_FLAGS.FINANCE_SECTION_BATCH)) {
      rows.push([
        { text: '📥 Procesar movimientos desde el correo', callback_data: 'finance:batch' },
      ]);
    }
    const gmailRow: InlineKeyboardButton[] = [];
    if (await this.sectionOn(FEATURE_FLAGS.FINANCE_SECTION_GMAIL)) {
      gmailRow.push(
        { text: '✉️ ¿Gmail conectado?', callback_data: 'finance:gmail_status' },
        { text: '🔗 Conectar o renovar Gmail', callback_data: 'finance:gmail_reconnect' },
      );
    }
    if (gmailRow.length) rows.push(gmailRow);
    if (await this.sectionOn(FEATURE_FLAGS.FINANCE_SECTION_FIREFLY_TOKEN)) {
      rows.push([{ text: '🔑 Token de Firefly', callback_data: 'finance:firefly_token' }]);
    }
    if (await this.sectionOn(FEATURE_FLAGS.FINANCE_SECTION_SYNC)) {
      rows.push([{ text: '🔄 Sincronizar con Firefly', callback_data: 'finance:sync' }]);
    }
    if (await this.sectionOn(FEATURE_FLAGS.FINANCE_SECTION_HEALTH)) {
      rows.push([{ text: '✅ Estado del servicio', callback_data: 'finance:health' }]);
    }
    if (await this.sectionOn(FEATURE_FLAGS.FINANCE_SECTION_USER_ID)) {
      rows.push([{ text: '🆔 Mi código de usuario', callback_data: 'finance:show_user_id' }]);
    }
    if (await this.sectionOn(FEATURE_FLAGS.FINANCE_SECTION_APK)) {
      rows.push([{ text: '📥 Obtener APK', callback_data: 'finance:get_apk' }]);
    }
    rows.push([{ text: '🔙 Volver a Finanzas', callback_data: 'finance:menu' }]);
    return rows;
  }

  async getMenuOptions(
    chatId: number,
    advanced?: boolean,
  ): Promise<InlineKeyboardButton[][]> {
    const adv = advanced ?? (await this.isAdvanced(chatId));
    return adv ? this.buildAdvancedMenuOptions() : this.buildSimpleMenuOptions();
  }

  /**
   * Show finance menu
   */
  async showMenu(chatId: number, messageId?: number): Promise<void> {
    if (!(await this.featureFlags.isEnabled(FEATURE_FLAGS.MODULE_FINANCE))) {
      const t = 'El módulo de finanzas no está disponible en este momento.';
      if (messageId) {
        await this.bot.editMessageText(t, { chat_id: chatId, message_id: messageId });
      } else {
        await this.bot.sendMessage(chatId, t);
      }
      return;
    }

    const adv = await this.isAdvanced(chatId);
    const intro = adv
      ? 'Selecciona una opción (tutorial, revisión o herramientas técnicas):'
      : '🎓 *Primera vez?* Abre *Configurar finanzas (tutorial)*.\n\n' +
        'Para procesar correos y acciones del día a día, entra en *Operaciones*.';
    const text = `${this.financeTitle(adv)}\n\n${intro}`;

    const options = {
      parse_mode: 'Markdown' as const,
      reply_markup: {
        inline_keyboard: await this.getMenuOptions(chatId, adv),
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

  /** Entrada pública: comando /configurar_finanzas */
  async openFinanceWizard(chatId: number, messageId?: number): Promise<void> {
    if (!(await this.featureFlags.isEnabled(FEATURE_FLAGS.MODULE_FINANCE))) {
      await this.botInstance.sendMessageToUser(
        chatId,
        'El módulo de finanzas no está disponible.',
      );
      return;
    }
    if (!(await this.sectionOn(FEATURE_FLAGS.FINANCE_SECTION_TUTORIAL))) {
      await this.botInstance.sendMessageToUser(
        chatId,
        'El tutorial no está disponible. Usa el menú *Finanzas*.',
        { parse_mode: 'Markdown' },
      );
      return;
    }
    const uid = this.getUserId(chatId);
    const prog = await this.onboarding.getOrCreate(uid);
    const step = (prog.currentStep as FinanceWizardStep) || 'start';
    await this.renderWizardStep(chatId, messageId, step);
  }

  private wizardNavKeyboard(
    step: FinanceWizardStep,
    opts?: { showNext?: boolean; showBack?: boolean },
  ): InlineKeyboardButton[][] {
    const rows: InlineKeyboardButton[][] = [];
    const showNext = opts?.showNext !== false;
    const showBack = opts?.showBack !== false;
    const nav: InlineKeyboardButton[] = [];
    if (showBack) {
      nav.push({ text: '⬅️ Paso anterior', callback_data: 'finance:wiz_back' });
    }
    if (showNext) {
      nav.push({ text: 'Siguiente paso ➡️', callback_data: 'finance:wiz_next' });
    }
    if (nav.length) rows.push(nav);
    rows.push([{ text: '🔙 Volver al menú Finanzas', callback_data: 'menu:finance' }]);
    return rows;
  }

  private async showSimpleOperationsMenu(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const adv = await this.isAdvanced(chatId);
    const text =
      `${this.financeTitle(adv)}\n\n` +
      '⚙️ *Operaciones*\n\n' +
      'Aquí están las acciones habituales (procesar correos, Gmail, token, etc.). ' +
      'Para configurar por primera vez, usa el *tutorial*.';
    const keyboard = await this.buildSimpleOperationsMenu();
    await this.editOrSend(chatId, messageId, text, keyboard);
  }

  private async showConfigReview(chatId: number, messageId?: number): Promise<void> {
    const adv = await this.isAdvanced(chatId);
    const uid = this.getUserId(chatId);
    const [gmailR, fireflyR, prog] = await Promise.all([
      this.financeService.getGmailAuthStatus(uid),
      this.financeService.getFireflyStatus(uid),
      this.onboarding.getOrCreate(uid),
    ]);

    const gmailOk =
      gmailR.success && !!(gmailR.result as { gmail_authenticated?: boolean })?.gmail_authenticated;
    const fireflyOk =
      fireflyR.success && !!(fireflyR.result as { connected?: boolean })?.connected;

    const lines = [
      `${this.financeTitle(adv)}\n\n📋 *Revisar configuración*\n`,
      `• Gmail conectado: ${gmailOk ? '✅ Sí' : '❌ No'}`,
      `• Token Firefly reconocido por la API: ${fireflyOk ? '✅ Sí' : '❌ No'}`,
      `• Interfaz web configurada (según tu confirmación): ${prog.webUiDone ? '✅ Indicaste que sí' : '⏳ Pendiente'}`,
      `• App APK (según tu confirmación): ${prog.apkManualDone ? '✅ Indicaste que sí' : '⏳ Opcional / pendiente'}`,
      '',
      '_Estados de Gmail y Firefly se comprueban en vivo; el resto es lo que marcaste en el tutorial._',
    ];

    const keyboard = [
      [{ text: '🔄 Verificar de nuevo', callback_data: 'finance:review_setup' }],
      [{ text: '🎓 Volver al tutorial', callback_data: 'finance:wizard' }],
      [{ text: '🔙 Volver al menú Finanzas', callback_data: 'menu:finance' }],
    ];
    await this.editOrSend(chatId, messageId, lines.join('\n'), keyboard);
  }

  private async handleWizardAction(
    chatId: number,
    action: string,
    messageId?: number,
  ): Promise<void> {
    const uid = this.getUserId(chatId);
    const prog = await this.onboarding.getOrCreate(uid);
    let step = (prog.currentStep as FinanceWizardStep) || 'start';
    const idx = FINANCE_WIZARD_STEPS.indexOf(step);

    switch (action) {
      case 'wiz_next': {
        const next = this.onboarding.stepAt(idx + 1);
        await this.onboarding.setCurrentStep(uid, next);
        await this.renderWizardStep(chatId, messageId, next);
        break;
      }
      case 'wiz_back': {
        const prev = this.onboarding.stepAt(idx - 1);
        await this.onboarding.setCurrentStep(uid, prev);
        await this.renderWizardStep(chatId, messageId, prev);
        break;
      }
      case 'wiz_token':
        this.wizardAfterToken.add(chatId);
        await this.setFireflyTokenAction(chatId, messageId);
        break;
      case 'wiz_verify_firefly': {
        const r = await this.financeService.getFireflyStatus(uid);
        const ok = r.success && !!(r.result as { connected?: boolean })?.connected;
        if (ok) {
          await this.onboarding.markFireflyTokenDone(uid);
          await this.renderWizardStep(chatId, messageId, 'gmail');
        } else {
          const text =
            `${this.financeTitle(await this.isAdvanced(chatId))}\n\n` +
            '❌ La API aún no reconoce un token válido. Usa *Pegar token en el bot* o revisa Firefly.';
          await this.editOrSend(chatId, messageId, text, [
            [
              { text: '🔑 Pegar token', callback_data: 'finance:wiz_token' },
              { text: '🔄 Verificar otra vez', callback_data: 'finance:wiz_verify_firefly' },
            ],
            ...this.wizardNavKeyboard('firefly_token', { showNext: false }),
          ]);
        }
        break;
      }
      case 'wiz_verify_gmail': {
        const r = await this.financeService.getGmailAuthStatus(uid);
        const ok =
          r.success && !!(r.result as { gmail_authenticated?: boolean })?.gmail_authenticated;
        if (ok) {
          await this.onboarding.markGmailDone(uid);
          await this.renderWizardStep(chatId, messageId, 'web_ui');
        } else {
          const adv = await this.isAdvanced(chatId);
          const text =
            `${this.financeTitle(adv)}\n\n` +
            '❌ Gmail aún no aparece conectado. Abre el enlace OAuth, inicia sesión y vuelve a verificar.';
          const urlR = await this.financeService.getGmailAuthUrl(uid);
          const kb: InlineKeyboardButton[][] = [];
          if (urlR.success && (urlR.result as { authorization_url?: string })?.authorization_url) {
            kb.push([
              {
                text: '🔐 Abrir Google',
                url: (urlR.result as { authorization_url: string }).authorization_url,
              },
            ]);
          }
          kb.push([{ text: '🔄 Verificar de nuevo', callback_data: 'finance:wiz_verify_gmail' }]);
          kb.push(...this.wizardNavKeyboard('gmail', { showNext: false }));
          await this.editOrSend(chatId, messageId, text, kb);
        }
        break;
      }
      case 'wiz_web_done':
        await this.onboarding.markWebUiDone(uid);
        if (await this.sectionOn(FEATURE_FLAGS.FINANCE_SECTION_APK)) {
          await this.renderWizardStep(chatId, messageId, 'apk');
        } else {
          await this.onboarding.skipApkToComplete(uid);
          await this.renderWizardStep(chatId, messageId, 'complete');
        }
        break;
      case 'wiz_dl_apk': {
        await this.deliverFinanceApk(chatId, {
          messageId,
          missingApkKeyboard: this.wizardNavKeyboard('apk'),
        });
        break;
      }
      case 'wiz_apk_skip':
        await this.onboarding.skipApkToComplete(uid);
        await this.renderWizardStep(chatId, messageId, 'complete');
        break;
      case 'wiz_apk_done':
        await this.onboarding.markApkManualDone(uid);
        await this.onboarding.markComplete(uid);
        await this.renderWizardStep(chatId, messageId, 'complete');
        break;
      default:
        await this.renderWizardStep(chatId, messageId, step);
    }
  }

  /**
   * Envía la APK registrada por el admin, o avisa si no hay archivo.
   */
  private async deliverFinanceApk(
    chatId: number,
    opts?: { messageId?: number; missingApkKeyboard?: InlineKeyboardButton[][] },
  ): Promise<void> {
    if (!(await this.sectionOn(FEATURE_FLAGS.FINANCE_SECTION_APK))) {
      await this.botInstance.sendMessageToUser(
        chatId,
        'La descarga de APK no está disponible.',
        {
          reply_markup: {
            inline_keyboard: [[{ text: '🔙 Volver al menú Finanzas', callback_data: 'menu:finance' }]],
          },
        },
      );
      return;
    }

    const uid = this.getUserId(chatId);
    const asset = await this.botAssets.getFinanceApk();
    if (!asset) {
      const adv = await this.isAdvanced(chatId);
      const text =
        `${this.financeTitle(adv)}\n\n` +
        '⚠️ El administrador aún no ha subido una APK al bot. Vuelve a intentar más tarde.' +
        (opts?.missingApkKeyboard ? '\n\n_Puedes omitir este paso del tutorial._' : '');
      if (opts?.messageId !== undefined && opts.missingApkKeyboard) {
        await this.editOrSend(chatId, opts.messageId, text, opts.missingApkKeyboard);
      } else {
        await this.botInstance.sendMessageToUser(chatId, text, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '🔙 Volver al menú Finanzas', callback_data: 'menu:finance' }]],
          },
        });
      }
      return;
    }

    await this.botInstance.sendDocumentByFileId(chatId, asset.fileId, {
      caption:
        '📱 *APK de Finanzas*\n\n' +
        'Instálala y, si la app lo pide, pega tu *Telegram user ID*:\n' +
        `\`${uid}\``,
      parse_mode: 'Markdown',
    });
  }

  private async renderWizardStep(
    chatId: number,
    messageId: number | undefined,
    step: FinanceWizardStep,
  ): Promise<void> {
    await this.onboarding.setCurrentStep(this.getUserId(chatId), step);
    const adv = await this.isAdvanced(chatId);
    const uid = this.getUserId(chatId);

    let text = '';
    let keyboard: InlineKeyboardButton[][] = [];

    switch (step) {
      case 'start':
        text =
          `${this.financeTitle(adv)}\n\n🎓 *Configurar finanzas*\n\n` +
          'Te guío en pocos pasos: cuenta en *Firefly* (' +
          this.onboardingUrls.fireflyHome +
          '), token en el bot, *Gmail*, la *web* de Finanzas (' +
          this.onboardingUrls.financeWeb +
          ') y, si quieres, la *app APK*.\n\n' +
          'Puedes parar y seguir más tarde: guardamos tu último paso.';
        keyboard = this.wizardNavKeyboard('start', { showBack: false });
        break;
      case 'firefly_signup':
        text =
          `${this.financeTitle(adv)}\n\n` +
          '📝 *Paso 1 — Cuenta en Firefly*\n\n' +
          '1. Entra a *tu instancia* y crea cuenta o inicia sesión:\n' +
          this.onboardingUrls.fireflyHome +
          '\n' +
          '2. Luego abre *Perfil* para gestionar tu usuario y, más adelante, el *token personal* (PAT):\n' +
          this.onboardingUrls.fireflyProfile +
          '\n\n' +
          '_En el siguiente paso pegarás el PAT en el bot. Si aún no lo creas, puedes hacerlo en Perfil → OAuth / tokens (según tu pantalla de Firefly)._';
        keyboard = [
          [{ text: '🏠 Abrir Firefly (inicio)', url: this.onboardingUrls.fireflyHome }],
          [{ text: '👤 Perfil (cuenta y token)', url: this.onboardingUrls.fireflyProfile }],
          ...this.wizardNavKeyboard('firefly_signup'),
        ];
        break;
      case 'firefly_token':
        text =
          `${this.financeTitle(adv)}\n\n` +
          '🔑 *Paso 2 — Token en el bot*\n\n' +
          'Genera o copia tu *token personal (PAT)* desde Firefly:\n' +
          this.onboardingUrls.fireflyProfile +
          '\n\n' +
          'Pulsa *Pegar token* y responde al mensaje que te envío. ' +
          'El mensaje con tu token se borrará al procesarlo cuando Telegram lo permita.\n\n' +
          'Si ya lo configuraste antes, usa *Verificar con la API*.';
        keyboard = [
          [{ text: '🔑 Abrir Firefly → perfil / token', url: this.onboardingUrls.fireflyProfile }],
          [
            { text: '✍️ Pegar token', callback_data: 'finance:wiz_token' },
            { text: '✅ Verificar con la API', callback_data: 'finance:wiz_verify_firefly' },
          ],
          ...this.wizardNavKeyboard('firefly_token', { showNext: false }),
        ];
        break;
      case 'gmail': {
        text =
          `${this.financeTitle(adv)}\n\n` +
          '✉️ *Paso 3 — Gmail*\n\n' +
          'Conecta tu cuenta de Google para que podamos leer los correos de movimientos.\n\n' +
          'Abre el enlace, acepta permisos y vuelve aquí para *Verificar conexión*.';
        const urlR = await this.financeService.getGmailAuthUrl(uid);
        const kb: InlineKeyboardButton[][] = [];
        if (urlR.success && (urlR.result as { authorization_url?: string })?.authorization_url) {
          kb.push([
            {
              text: '🔐 Abrir enlace OAuth',
              url: (urlR.result as { authorization_url: string }).authorization_url,
            },
          ]);
        }
        kb.push([{ text: '✅ Verificar conexión', callback_data: 'finance:wiz_verify_gmail' }]);
        kb.push(...this.wizardNavKeyboard('gmail', { showNext: false }));
        keyboard = kb;
        break;
      }
      case 'web_ui':
        text =
          `${this.financeTitle(adv)}\n\n` +
          '🌐 *Paso 4 — Interfaz web (Finance)*\n\n' +
          '*Instalar como PWA (recomendado)*\n' +
          'Así tendrás la app como un icono en el móvil, sin tienda.\n\n' +
          '*Android (Chrome)*\n' +
          '1. Abre la web en Chrome: ' +
          this.onboardingUrls.financeWeb +
          '\n' +
          '2. Menú ⋮ → *Instalar aplicación* o *Añadir a la pantalla de inicio* (el nombre puede variar).\n' +
          '3. Confirma; quedará un acceso directo como una app.\n\n' +
          '*iPhone o iPad (Safari)*\n' +
          '1. Abre el enlace en *Safari* (si hace falta, “Abrir en Safari” desde el menú del navegador).\n' +
          '2. Pulsa *Compartir* .\n' +
          '3. *Añadir a la pantalla de Inicio* → *Añadir*.\n\n' +
          '*Pegar el mismo PAT en la web*\n' +
          'En configuración, campo *personal access token*, usa el mismo token que en el bot:\n' +
          this.onboardingUrls.financeSetup +
          '\n\n' +
          'Cuando lo hayas hecho, pulsa *Ya lo configuré*.';
        keyboard = [
          [{ text: '🌐 Abrir Finance (web)', url: this.onboardingUrls.financeWeb }],
          [{ text: '⚙️ Configuración (pegar token)', url: this.onboardingUrls.financeSetup }],
          [{ text: '✅ Ya lo configuré', callback_data: 'finance:wiz_web_done' }],
          ...this.wizardNavKeyboard('web_ui'),
        ];
        break;
      case 'apk': {
        const hasApk = !!(await this.botAssets.getFinanceApk());
        text =
          `${this.financeTitle(adv)}\n\n` +
          '📱 *Paso 5 — App APK (opcional)*\n\n' +
          (hasApk
            ? 'Puedes descargar la APK desde aquí. En la app, si te lo pide, usa tu Telegram user ID:\n' +
              `\`${uid}\`\n`
            : 'Tu administrador aún no subió una APK al bot. Puedes omitir este paso.\n');
        const row: InlineKeyboardButton[] = [];
        if (hasApk && (await this.sectionOn(FEATURE_FLAGS.FINANCE_SECTION_APK))) {
          row.push({ text: '📥 Descargar APK', callback_data: 'finance:wiz_dl_apk' });
        }
        row.push({ text: '✅ Ya configuré la app', callback_data: 'finance:wiz_apk_done' });
        row.push({ text: '⏭️ Omitir APK', callback_data: 'finance:wiz_apk_skip' });
        keyboard = [row, ...this.wizardNavKeyboard('apk')];
        break;
      }
      case 'complete':
        text =
          `${this.financeTitle(adv)}\n\n` +
          '🎉 *Onboarding completado*\n\n' +
          'Ya puedes usar *Operaciones* para procesar correos y revisar el estado. ' +
          'Si cambias de móvil o token, vuelve al menú de Finanzas.';
        keyboard = [
          [{ text: '📋 Revisar configuración', callback_data: 'finance:review_setup' }],
        ];
        if (await this.sectionOn(FEATURE_FLAGS.FINANCE_SECTION_APK)) {
          keyboard.push([{ text: '📥 Obtener APK', callback_data: 'finance:get_apk' }]);
        }
        keyboard.push([{ text: '💰 Ir al menú Finanzas', callback_data: 'menu:finance' }]);
        break;
      default:
        text = `${this.financeTitle(adv)}\n\nTutorial — paso desconocido, volvemos al inicio.`;
        keyboard = this.wizardNavKeyboard('start', { showBack: false });
    }

    await this.editOrSend(chatId, messageId, text, keyboard);
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

    if (
      action === 'wizard' ||
      action === 'review_setup' ||
      action === 'ops_menu' ||
      action.startsWith('wiz_')
    ) {
      if (!(await this.featureFlags.isEnabled(FEATURE_FLAGS.MODULE_FINANCE))) {
        return true;
      }
      if (action === 'review_setup') {
        if (!(await this.sectionOn(FEATURE_FLAGS.FINANCE_SECTION_REVIEW))) {
          await this.editOrSend(
            chatId,
            messageId,
            'Esta sección no está disponible.',
            [[{ text: '🔙 Volver', callback_data: 'menu:finance' }]],
          );
          return true;
        }
        await this.showConfigReview(chatId, messageId);
        return true;
      }
      if (action === 'ops_menu') {
        await this.showSimpleOperationsMenu(chatId, messageId);
        return true;
      }
      if (action === 'wizard') {
        await this.openFinanceWizard(chatId, messageId);
        return true;
      }
      await this.handleWizardAction(chatId, action, messageId);
      return true;
    }

    const advancedOnly = new Set([
      'dryrun',
      'stats',
      'audit',
      'scheduler',
      'retry',
      'senders',
      'learn',
    ]);
    const adv = await this.isAdvanced(chatId);
    if (!adv && advancedOnly.has(action)) {
      const text =
        `${this.financeTitle(adv)}\n\n` +
        'Esta opción solo está en *menú avanzado*. Pulsa *Cambiar modo de menú* en el inicio y elige *Menú avanzado*.';
      await this.editOrSend(chatId, messageId, text, [
        [{ text: '🔙 Volver', callback_data: 'menu:finance' }],
      ]);
      return true;
    }

    switch (action) {
      case 'menu':
        await this.showMenu(chatId, messageId);
        return true;
      case 'get_apk':
        await this.deliverFinanceApk(chatId, { messageId });
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
    const adv = await this.isAdvanced(chatId);
    const state = this.userDateState.get(chatId);
    const year = state?.year || new Date().getFullYear();
    const month = state?.month || new Date().getMonth();

    const mode = dryRun ? '🔍 Modo Prueba' : '🚀 Modo Real';
    const dateHint = adv
      ? '📅 Desde qué fecha quieres procesar correos:'
      : '📅 Desde qué fecha quieres incluir movimientos de tus correos:';
    const text = adv
      ? `${this.financeTitle(adv)}\n\n${mode}\n\n${dateHint}`
      : `${this.financeTitle(adv)}\n\n${dateHint}`;

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
    let dryRun = parts[parts.length - 1] === 'dry';
    if (!(await this.isAdvanced(chatId))) {
      dryRun = false;
    }
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
    const adv = await this.isAdvanced(chatId);
    const mode = dryRun ? '🔍 Modo Prueba' : '🚀 Modo Real';
    const loadingText = adv
      ? `${this.financeTitle(adv)}\n\n${mode}\n\n⏳ Encolando procesamiento desde ${afterDate}...`
      : `${this.financeTitle(adv)}\n\n⏳ Preparando el proceso desde *${afterDate}*...`;

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
      const text = adv
        ? `${this.financeTitle(adv)}\n\n❌ Error al encolar job: ${result.result}`
        : `${this.financeTitle(adv)}\n\n❌ No se pudo iniciar el proceso. Intenta de nuevo o más tarde.\n\n_Detalle: ${result.result}_`;
      const keyboard = [[{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }]];
      await this.editOrSend(chatId, messageId, text, keyboard);
      return;
    }

    const enqueueData = result.result as BatchProcessingJobEnqueueResponse;
    const jobId = enqueueData.job_id;
    const pollEverySeconds = 3;
    const queuedText = adv
      ? `${this.financeTitle(adv)}\n\n` +
        `${mode}\n\n` +
        `🕒 *Job encolado*\n` +
        `• Job ID: \`${jobId}\`\n` +
        `• Estado inicial: ${enqueueData.status}\n\n` +
        `Voy a monitorearlo y te aviso cuando termine.\n` +
        `⏱️ Polling cada ${pollEverySeconds}s`
      : `${this.financeTitle(adv)}\n\n` +
        `✅ Tu proceso ya está en cola. Te avisaré aquí cuando termine.\n\n` +
        `_Si tarda mucho, no cierres Telegram._`;

    const keyboard = [[{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }]];
    await this.editOrSend(chatId, messageId, queuedText, keyboard);

    void this.pollBatchJobAndNotify(chatId, jobId, mode);
  }

  private async pollBatchJobAndNotify(
    chatId: number,
    jobId: string,
    modeLabel: string,
  ): Promise<void> {
    const adv = await this.isAdvanced(chatId);
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
        const pollErr = adv
          ? `${this.financeTitle(adv)}\n\n⚠️ No pude consultar el estado del job \`${jobId}\`.\nIntento ${attempt}/${maxAttempts}.`
          : `${this.financeTitle(adv)}\n\n⚠️ No pude comprobar el avance del proceso. Sigo intentando… (${attempt}/${maxAttempts})`;
        await this.bot.sendMessage(chatId, pollErr, { parse_mode: 'Markdown' });
        continue;
      }

      const job = jobResult.result as ProcessingJobStatusResponse;
      if (job.status === 'queued' || job.status === 'running') continue;

      if (job.status === 'failed') {
        const failText = adv
          ? `${this.financeTitle(adv)}\n\n${modeLabel}\n\n❌ *Job falló*\n• Job ID: \`${jobId}\`\n• Error: ${job.error_message || 'Sin detalle'}`
          : `${this.financeTitle(adv)}\n\n❌ *No se pudo completar el proceso*\n\n${job.error_message || 'Error desconocido. Intenta de nuevo o revisa Gmail y Firefly.'}`;
        await this.bot.sendMessage(chatId, failText, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }]],
          },
        });
        return;
      }

      if (job.status === 'completed') {
        const data = (job.result || {}) as BatchProcessingResponse;
        const text = adv
          ? `${this.financeTitle(adv)}\n\n` +
            `${modeLabel}\n\n` +
            `✅ *Trabajo terminado*\n\n` +
            `• Job ID: \`${jobId}\`\n` +
            `• Total emails: ${data.total_emails ?? 0}\n` +
            `• Procesados: ${data.processed ?? 0}\n` +
            `• Creados: ${data.created ?? 0}\n` +
            `• Omitidos: ${data.skipped ?? 0}\n` +
            `• Fallidos: ${data.failed ?? 0}\n` +
            `• Tiempo: ${data.processing_time_ms ?? 0}ms`
          : `${this.financeTitle(adv)}\n\n` +
            `✅ *Listo*\n\n` +
            `• Correos revisados: ${data.total_emails ?? 0}\n` +
            `• Movimientos registrados (nuevos): ${data.created ?? 0}\n` +
            `• Sin cambios / ya estaban: ${data.skipped ?? 0}\n` +
            `• Con error: ${data.failed ?? 0}\n\n` +
            `_Tiempo aproximado: ${data.processing_time_ms ?? 0} ms_`;

        await this.bot.sendMessage(chatId, text, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }]],
          },
        });
        return;
      }
    }

    const timeoutText = adv
      ? `${this.financeTitle(adv)}\n\n⏰ El job \`${jobId}\` sigue en progreso o no respondió a tiempo.\nPuedes intentar nuevamente desde el menú.`
      : `${this.financeTitle(adv)}\n\n⏰ El proceso sigue tardando o no hubo respuesta a tiempo. Prueba otra vez desde *Finanzas* más tarde.`;
    await this.bot.sendMessage(chatId, timeoutText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }]],
      },
    });
  }

  /**
   * Show user id sent to Finance API (header X-User-Id)
   */
  private async showApiUserId(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const adv = await this.isAdvanced(chatId);
    const userId = this.getUserId(chatId);
    const text = adv
      ? `${this.financeTitle(adv)}\n\n` +
        `🆔 *User ID para la API*\n\n` +
        `Este valor se envía en el header *X-User-Id* en todas las peticiones al Finance API:\n\n` +
        `\`${userId}\`\n\n` +
        `_Equivale a tu Telegram chat id (string)._`
      : `${this.financeTitle(adv)}\n\n` +
        `🆔 *Tu código de usuario*\n\n` +
        `Si el soporte te lo pide, envía este número:\n\n` +
        `\`${userId}\`\n\n` +
        `_Es tu identificador en Telegram (solo para este bot)._`;

    const keyboard = [[{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }]];
    await this.editOrSend(chatId, messageId, text, keyboard);
  }

  /**
   * Show Gmail authentication status
   */
  private async showGmailStatus(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const adv = await this.isAdvanced(chatId);
    const loadingText = `${this.financeTitle(adv)}\n\n⏳ Comprobando Gmail...`;

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
      if (adv) {
        const status = data.gmail_authenticated ? '✅ Autenticado' : '❌ No autenticado';
        text =
          `${this.financeTitle(adv)}\n\n` +
          `🔐 *Estado de Gmail*\n\n` +
          `• Estado: ${status}\n` +
          `• Email: ${data.email || 'N/A'}\n` +
          `• Mensaje: ${data.message}`;
      } else {
        const ok = data.gmail_authenticated;
        text =
          `${this.financeTitle(adv)}\n\n` +
          `✉️ *Gmail*\n\n` +
          (ok
            ? `✅ *Conectado*\nCuenta: ${data.email || '—'}\n\n${data.message || ''}`
            : `❌ *Aún no conectado*\nUsa *Conectar o renovar Gmail* para iniciar sesión.\n\n${data.message || ''}`);
      }
    } else {
      text = adv
        ? `${this.financeTitle(adv)}\n\n❌ Error: ${result.result}`
        : `${this.financeTitle(adv)}\n\n❌ No se pudo comprobar Gmail. Intenta más tarde.\n\n_Detalle: ${result.result}_`;
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
    const adv = await this.isAdvanced(chatId);
    const loadingText = `${this.financeTitle(adv)}\n\n⏳ Preparando enlace seguro...`;

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
      text = adv
        ? `${this.financeTitle(adv)}\n\n` +
          `🔗 *Reconectar Gmail*\n\n` +
          `Para volver a autenticar Gmail, haz clic en el botón de abajo:\n\n` +
          `⚠️ _Este enlace expira en pocos minutos_`
        : `${this.financeTitle(adv)}\n\n` +
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
        [{ text: '🔄 Comprobar de nuevo', callback_data: 'finance:gmail_status' }],
        [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
      ];
    } else {
      text = adv
        ? `${this.financeTitle(adv)}\n\n❌ Error: ${result.result}`
        : `${this.financeTitle(adv)}\n\n❌ No se pudo abrir el enlace. Intenta de nuevo.\n\n_Detalle: ${result.result}_`;
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
    const adv = await this.isAdvanced(chatId);
    const loadingText = `${this.financeTitle(adv)}\n\n⏳ Revisando que todo funcione...`;

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

    let text: string;

    if (adv) {
      text = `${this.financeTitle(adv)}\n\n🏥 *Health Check*\n\n`;

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
      const apiOk = healthResult.success && healthResult.result?.status === 'healthy';
      const fireflyOk = fireflyResult.success && fireflyResult.result?.connected;
      text =
        `${this.financeTitle(adv)}\n\n` +
        `✅ *Estado del servicio*\n\n` +
        `• Servicio principal: ${apiOk ? '✅ Todo bien' : '⚠️ Hay un problema'}\n` +
        `• Conexión con Firefly: ${fireflyOk ? '✅ Lista' : '⚠️ Revisa o sincroniza'}\n\n` +
        `_Si algo falla, revisa Gmail y el token de Firefly._`;
    }

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
    const adv = await this.isAdvanced(chatId);
    const loadingText = `${this.financeTitle(adv)}\n\n⏳ Sincronizando con Firefly...`;

    if (messageId) {
      await this.bot.editMessageText(loadingText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
    }

    const result = await this.financeService.syncAll(this.getUserId(chatId));

    let text: string;

    if (result.success) {
      const data = result.result;
      if (adv) {
        text = `${this.financeTitle(adv)}\n\n🔄 *Sincronización Firefly*\n\n`;
        text += `✅ *Sincronización completada*\n\n`;
        if (data.accounts !== undefined) text += `• Cuentas: ${data.accounts}\n`;
        if (data.categories !== undefined) text += `• Categorías: ${data.categories}\n`;
        if (data.message) text += `\n${data.message}`;
      } else {
        text =
          `${this.financeTitle(adv)}\n\n` +
          `✅ *Datos actualizados en Firefly*\n\n` +
          (data.accounts !== undefined ? `• Cuentas sincronizadas: ${data.accounts}\n` : '') +
          (data.categories !== undefined ? `• Categorías: ${data.categories}\n` : '') +
          (data.message ? `\n${data.message}` : '');
      }
    } else {
      text = adv
        ? `${this.financeTitle(adv)}\n\n🔄 *Sincronización Firefly*\n\n❌ Error: ${result.result}`
        : `${this.financeTitle(adv)}\n\n❌ No se pudo sincronizar con Firefly.\n\n_Detalle: ${result.result}_`;
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
    const adv = await this.isAdvanced(chatId);
    if (messageId) {
      await this.bot.editMessageText(
        adv
          ? `${this.financeTitle(adv)}\n\n🔑 Ingresa tu token de Firefly III (PAT):\n\n_${this.onboardingUrls.fireflyProfile}_`
          : `${this.financeTitle(adv)}\n\n🔑 *Token de acceso de Firefly*\n\nCópialo desde tu perfil:\n${this.onboardingUrls.fireflyProfile}`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔑 Abrir Firefly → perfil / token', url: this.onboardingUrls.fireflyProfile }],
              [{ text: '🔙 Volver', callback_data: 'menu:finance' }],
            ],
          },
        },
      );
    }

    const promptMsg = await this.bot.sendMessage(
      chatId,
      adv
        ? `✍️ Responde a este mensaje con tu PAT.\n\nOrigen: ${this.onboardingUrls.fireflyProfile}\n\n⚠️ *No compartas este token con nadie.*`
        : `✍️ Responde a *este mensaje* pegando el token.\n\nLo sacas de: ${this.onboardingUrls.fireflyProfile}\n\n⚠️ *No lo compartas con nadie.*`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          force_reply: true,
        },
      },
    );

    const fromWizard = this.wizardAfterToken.has(chatId);
    const { text: token, replyMessageId } = await this.botInstance.getOnReplyMessageResponse(
      chatId,
      promptMsg.message_id,
    );

    if (replyMessageId) {
      await this.botInstance.deleteMessageSafe(chatId, replyMessageId);
    }

    const normalizedToken = token?.trim();
    if (!normalizedToken) {
      if (fromWizard) this.wizardAfterToken.delete(chatId);
      await this.bot.sendMessage(
        chatId,
        '❌ No escribiste nada. Vuelve a *Finanzas* e inténtalo de nuevo.',
        {
          parse_mode: 'Markdown',
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
      if (fromWizard) {
        this.wizardAfterToken.delete(chatId);
        await this.onboarding.markFireflyTokenDone(this.getUserId(chatId));
        await this.renderWizardStep(chatId, undefined, 'gmail');
        return;
      }
      await this.onboarding.touchFireflyTokenOk(this.getUserId(chatId));
      await this.bot.sendMessage(
        chatId,
        adv
          ? '✅ Token de Firefly registrado correctamente para tu usuario.'
          : '✅ *Listo.* Tu token de Firefly quedó guardado para este bot.',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }]],
          },
        },
      );
      return;
    }

    if (fromWizard) this.wizardAfterToken.delete(chatId);
    await this.bot.sendMessage(
      chatId,
      adv
        ? `❌ Error al registrar token de Firefly: ${result.result}`
        : `❌ No se pudo guardar el token.\n\n_Detalle: ${result.result}_`,
      {
        parse_mode: 'Markdown',
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
