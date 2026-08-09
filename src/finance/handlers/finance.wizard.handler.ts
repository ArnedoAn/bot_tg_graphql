import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import TelegramBot, { InlineKeyboardButton } from 'node-telegram-bot-api';
import { BotService } from '../../shared/instances/bot.service';
import { UserMenuModeService } from '../../shared/instances/user-menu-mode.service';
import { UserService } from '../../shared/prisma/user.service';
import { FinanceService } from '../finance.service';
import { FeatureFlagsService } from '../../shared/prisma/feature-flags.service';
import {
  FinanceOnboardingService,
  FinanceWizardStep,
  FINANCE_WIZARD_STEPS,
} from '../../shared/prisma/finance-onboarding.service';
import { BotAssetService } from '../../shared/prisma/bot-asset.service';
import { FEATURE_FLAGS } from '../../shared/constants/feature-flag-keys';
import {
  onboardingUrls,
  financeTitle as financeTitleHelper,
  getUserId as getUserIdHelper,
  sectionOn as sectionOnHelper,
  isGoogleTestingMode as isGoogleTestingModeHelper,
  buildProgressBar as buildProgressBarHelper,
  wizardNavKeyboard as wizardNavKeyboardHelper,
  isValidEmail as isValidEmailHelper,
  editOrSend as editOrSendHelper,
  buildSimpleOperationsMenu as buildSimpleOperationsMenuHelper,
} from './finance.helpers';

@Injectable()
export class FinanceWizardHandler {
  private readonly bot: TelegramBot;
  private readonly errorMessage = 'Ha ocurrido un error inesperado';

  /** Tras configurar token desde el asistente, volver al flujo del tutorial */
  private readonly wizardAfterToken: Set<number> = new Set();

  constructor(
    private readonly financeService: FinanceService,
    private readonly botInstance: BotService,
    private readonly userMenuMode: UserMenuModeService,
    private readonly featureFlags: FeatureFlagsService,
    private readonly onboarding: FinanceOnboardingService,
    private readonly botAssets: BotAssetService,
    private readonly userService: UserService,
    private readonly configService: ConfigService,
  ) {
    this.bot = this.botInstance.getBot();
  }

  private async isAdvanced(chatId: number): Promise<boolean> {
    return this.userMenuMode.isAdvancedUser(chatId);
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
    if (!(await sectionOnHelper(this.featureFlags, FEATURE_FLAGS.FINANCE_SECTION_TUTORIAL))) {
      await this.botInstance.sendMessageToUser(
        chatId,
        'El tutorial no está disponible. Usa el menú *Finanzas*.',
        { parse_mode: 'Markdown' },
      );
      return;
    }
    const uid = getUserIdHelper(chatId);
    const prog = await this.onboarding.getOrCreate(uid);
    const step = (prog.currentStep as FinanceWizardStep) || 'start';
    await this.renderWizardStep(chatId, messageId, step);
  }

  async showSimpleOperationsMenu(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const adv = await this.isAdvanced(chatId);
    const text =
      `${financeTitleHelper(adv)}\n\n` +
      '⚙️ *Operaciones*\n\n' +
      'Aquí están las acciones habituales (procesar correos, Gmail, token, etc.). ' +
      'Para configurar por primera vez, usa el *tutorial*.';
    const keyboard = await buildSimpleOperationsMenuHelper(this.featureFlags);
    await editOrSendHelper(this.bot, chatId, messageId, text, keyboard);
  }

  async showConfigReview(chatId: number, messageId?: number): Promise<void> {
    const adv = await this.isAdvanced(chatId);
    const uid = getUserIdHelper(chatId);
    const [gmailR, fireflyR, prog] = await Promise.all([
      this.financeService.getGmailAuthStatus(uid),
      this.financeService.getFireflyStatus(uid),
      this.onboarding.getOrCreate(uid),
    ]);

    const gmailOk =
      gmailR.success &&
      !!(gmailR.result as { gmail_authenticated?: boolean })?.gmail_authenticated;
    const fireflyOk =
      fireflyR.success &&
      !!(fireflyR.result as { connected?: boolean })?.connected;

    const lines = [
      `${financeTitleHelper(adv)}\n\n📋 *Revisar configuración*\n`,
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
    await editOrSendHelper(
      this.bot,
      chatId,
      messageId,
      lines.join('\n'),
      keyboard,
    );
  }

  async handleWizardAction(
    chatId: number,
    action: string,
    messageId?: number,
  ): Promise<void> {
    const uid = getUserIdHelper(chatId);
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
        const ok =
          r.success && !!(r.result as { connected?: boolean })?.connected;
        if (ok) {
          await this.onboarding.markFireflyTokenDone(uid);
          await this.renderWizardStep(chatId, messageId, 'gmail');
        } else {
          const text =
            `${financeTitleHelper(await this.isAdvanced(chatId))}\n\n` +
            '❌ La API aún no reconoce un token válido. Usa *Pegar token en el bot* o revisa Firefly.';
          await editOrSendHelper(this.bot, chatId, messageId, text, [
            [
              { text: '🔑 Pegar token', callback_data: 'finance:wiz_token' },
              {
                text: '🔄 Verificar otra vez',
                callback_data: 'finance:wiz_verify_firefly',
              },
            ],
            ...wizardNavKeyboardHelper('firefly_token', { showNext: false }),
          ]);
        }
        break;
      }
      case 'wiz_verify_gmail': {
        const r = await this.financeService.getGmailAuthStatus(uid);
        const ok =
          r.success &&
          !!(r.result as { gmail_authenticated?: boolean })?.gmail_authenticated;
        if (ok) {
          await this.onboarding.markGmailDone(uid);
          await this.renderWizardStep(chatId, messageId, 'web_ui');
        } else {
          const adv = await this.isAdvanced(chatId);
          const text =
            `${financeTitleHelper(adv)}\n\n` +
            '❌ Gmail aún no aparece conectado. Abre el enlace OAuth, inicia sesión y vuelve a verificar.';
          const urlR = await this.financeService.getGmailAuthUrl(uid);
          const kb: InlineKeyboardButton[][] = [];
          if (
            urlR.success &&
            (urlR.result as { authorization_url?: string })?.authorization_url
          ) {
            kb.push([
              {
                text: '🔐 Abrir Google',
                url: (urlR.result as { authorization_url: string })
                  .authorization_url,
              },
            ]);
          }
          kb.push([
            {
              text: '🔄 Verificar de nuevo',
              callback_data: 'finance:wiz_verify_gmail',
            },
          ]);
          kb.push(
            ...wizardNavKeyboardHelper('gmail', { showNext: false }),
          );
          await editOrSendHelper(this.bot, chatId, messageId, text, kb);
        }
        break;
      }
      case 'wiz_web_done':
        await this.onboarding.markWebUiDone(uid);
        if (
          await sectionOnHelper(
            this.featureFlags,
            FEATURE_FLAGS.FINANCE_SECTION_APK,
          )
        ) {
          await this.renderWizardStep(chatId, messageId, 'apk');
        } else {
          await this.onboarding.skipApkToComplete(uid);
          await this.renderWizardStep(chatId, messageId, 'complete');
        }
        break;
      case 'wiz_dl_apk': {
        await this.deliverFinanceApk(chatId, {
          messageId,
          missingApkKeyboard: wizardNavKeyboardHelper('apk'),
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
      case 'wiz_send_google_email':
        await this.requestGoogleTestEmailAction(chatId, messageId);
        break;
      case 'wiz_check_whitelist':
        await this.renderWizardStep(chatId, messageId, 'gmail');
        break;
      case 'wiz_jump:gmail':
        await this.onboarding.setCurrentStep(uid, 'gmail');
        await this.renderWizardStep(chatId, messageId, 'gmail');
        break;
      case 'wiz_jump:firefly_token':
        await this.onboarding.setCurrentStep(uid, 'firefly_token');
        await this.renderWizardStep(chatId, messageId, 'firefly_token');
        break;
      default:
        await this.renderWizardStep(chatId, messageId, step);
    }
  }

  /**
   * Modo pruebas Google: el usuario envía su correo; se notifica al admin con lista de pendientes.
   */
  private async requestGoogleTestEmailAction(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const adv = await this.isAdvanced(chatId);
    const uid = getUserIdHelper(chatId);
    if (messageId) {
      await this.bot.editMessageText(
        `${financeTitleHelper(adv)}\n\n📧 Escribe tu correo de *Google* en el siguiente mensaje (responde al mensaje que te envío).`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Volver', callback_data: 'menu:finance' }],
            ],
          },
        },
      );
    }

    const promptMsg = await this.bot.sendMessage(
      chatId,
      '✍️ *Responde a este mensaje* con tu correo de Google (el que usarás con Gmail).',
      {
        parse_mode: 'Markdown',
        reply_markup: { force_reply: true },
      },
    );

    const { text: emailRaw, replyMessageId } =
      await this.botInstance.getOnReplyMessageResponse(
        chatId,
        promptMsg.message_id,
      );

    if (replyMessageId) {
      await this.botInstance.deleteMessageSafe(chatId, replyMessageId);
    }

    const email = emailRaw?.trim() ?? '';
    if (!isValidEmailHelper(email)) {
      await this.botInstance.sendMessageToUser(
        chatId,
        '❌ Correo no válido. Vuelve al tutorial y pulsa *Enviar mi correo de Google* otra vez.',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🎓 Volver al tutorial',
                  callback_data: 'finance:wizard',
                },
              ],
            ],
          },
        },
      );
      return;
    }

    await this.userService.upsertWhitelistRequest(uid, email);

    const userRow = await this.userService.getUserById(uid);
    const display =
      [userRow?.firstName, userRow?.username ? `@${userRow.username}` : null]
        .filter(Boolean)
        .join(' ') || `\`${uid}\``;

    const adminId = this.configService.get<string>('ADMIN_ID', '');
    const adminChat = Number(adminId);
    if (adminId.length > 0 && Number.isFinite(adminChat)) {
      const pending = await this.userService.getPendingWhitelistEmails();
      let list = pending
        .map((p) => `• \`${p.email}\` → usuario \`${p.userId}\``)
        .join('\n');
      if (list.length > 3500) {
        list = `${list.slice(0, 3500)}\n…`;
      }

      await this.botInstance.sendMessageToUser(
        adminChat,
        '📧 *Solicitud Gmail (modo pruebas)*\n\n' +
          `Usuario: ${display}\n` +
          `ID Telegram: \`${uid}\`\n` +
          `Correo: \`${email}\`\n\n` +
          'Agrega el correo en *Google Cloud Console* (usuarios de prueba) y pulsa *Aprobar*.\n\n' +
          '*Lista de pendientes:*\n' +
          (list || '_solo esta solicitud_'),
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '✅ Aprobar este correo',
                  callback_data: `admin:approve_gmail:${uid}`,
                },
              ],
              [
                {
                  text: '📋 Ver todos los pendientes',
                  callback_data: 'admin:pending_gmail',
                },
              ],
            ],
          },
        },
      );
    }

    await this.renderWizardStep(chatId, undefined, 'gmail');
  }

  /**
   * Envía la APK registrada por el admin, o avisa si no hay archivo.
   */
  async deliverFinanceApk(
    chatId: number,
    opts?: { messageId?: number; missingApkKeyboard?: InlineKeyboardButton[][] },
  ): Promise<void> {
    if (
      !(await sectionOnHelper(
        this.featureFlags,
        FEATURE_FLAGS.FINANCE_SECTION_APK,
      ))
    ) {
      await this.botInstance.sendMessageToUser(
        chatId,
        'La descarga de APK no está disponible.',
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🔙 Volver al menú Finanzas',
                  callback_data: 'menu:finance',
                },
              ],
            ],
          },
        },
      );
      return;
    }

    const uid = getUserIdHelper(chatId);
    const asset = await this.botAssets.getFinanceApk();
    if (!asset) {
      const adv = await this.isAdvanced(chatId);
      const text =
        `${financeTitleHelper(adv)}\n\n` +
        '⚠️ El administrador aún no ha subido una APK al bot. Vuelve a intentar más tarde.' +
        (opts?.missingApkKeyboard
          ? '\n\n_Puedes omitir este paso del tutorial._'
          : '');
      if (opts?.messageId !== undefined && opts.missingApkKeyboard) {
        await editOrSendHelper(
          this.bot,
          chatId,
          opts.messageId,
          text,
          opts.missingApkKeyboard,
        );
      } else {
        await this.botInstance.sendMessageToUser(chatId, text, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🔙 Volver al menú Finanzas',
                  callback_data: 'menu:finance',
                },
              ],
            ],
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
    await this.onboarding.setCurrentStep(getUserIdHelper(chatId), step);
    const adv = await this.isAdvanced(chatId);
    const uid = getUserIdHelper(chatId);
    const prog = await this.onboarding.getOrCreate(uid);

    let text = '';
    let keyboard: InlineKeyboardButton[][] = [];

    switch (step) {
      case 'start':
        text =
          `${financeTitleHelper(adv)}\n\n🎓 *Configurar finanzas*\n\n` +
          'Te guío en pocos pasos: cuenta en *Firefly* (' +
          onboardingUrls.fireflyHome +
          '), token en el bot, *Gmail*, la *web* de Finanzas (' +
          onboardingUrls.financeWeb +
          ') y, si quieres, la *app APK*.\n\n' +
          'Puedes parar y seguir más tarde: guardamos tu último paso.';
        keyboard = wizardNavKeyboardHelper('start', { showBack: false });
        break;
      case 'firefly_signup':
        text =
          `${financeTitleHelper(adv)}\n\n` +
          '📝 *Paso 1 — Cuenta en Firefly*\n\n' +
          '1. Entra a *tu instancia* y crea cuenta o inicia sesión:\n' +
          onboardingUrls.fireflyHome +
          '\n' +
          '2. Luego abre *Perfil* para gestionar tu usuario y, más adelante, el *token personal* (PAT):\n' +
          onboardingUrls.fireflyProfile +
          '\n\n' +
          '_En el siguiente paso pegarás el PAT en el bot. Si aún no lo creas, puedes hacerlo en Perfil → OAuth / tokens (según tu pantalla de Firefly)._';
        keyboard = [
          [{ text: '🏠 Abrir Firefly (inicio)', url: onboardingUrls.fireflyHome }],
          [
            {
              text: '👤 Perfil (cuenta y token)',
              url: onboardingUrls.fireflyProfile,
            },
          ],
          ...wizardNavKeyboardHelper('firefly_signup'),
        ];
        break;
      case 'firefly_token':
        text =
          `${financeTitleHelper(adv)}\n\n` +
          '🔑 *Paso 2 — Token en el bot*\n\n' +
          'Genera o copia tu *token personal (PAT)* desde Firefly:\n' +
          onboardingUrls.fireflyProfile +
          '\n\n' +
          'Pulsa *Pegar token* y responde al mensaje que te envío. ' +
          'El mensaje con tu token se borrará al procesarlo cuando Telegram lo permita.\n\n' +
          'Si ya lo configuraste antes, usa *Verificar con la API*.';
        keyboard = [
          [
            {
              text: '🔑 Abrir Firefly → perfil / token',
              url: onboardingUrls.fireflyProfile,
            },
          ],
          [
            {
              text: '✍️ Pegar token',
              callback_data: 'finance:wiz_token',
            },
            {
              text: '✅ Verificar con la API',
              callback_data: 'finance:wiz_verify_firefly',
            },
          ],
          ...wizardNavKeyboardHelper('firefly_token', { showNext: false }),
        ];
        break;
      case 'gmail': {
        const testing = isGoogleTestingModeHelper(this.configService);
        const wl = await this.userService.getWhitelistByUserId(uid);

        if (testing) {
          if (!wl) {
            text =
              `${financeTitleHelper(adv)}\n\n` +
              '✉️ *Paso 3 — Gmail (modo pruebas)*\n\n' +
              'El proyecto de Google está en *pantalla de consentimiento de prueba*: solo cuentas que el administrador agregue en la consola pueden usar OAuth.\n\n' +
              '1. Pulsa *Enviar mi correo de Google* y escribe tu correo.\n' +
              '2. El administrador lo añadirá en Google Cloud Console.\n' +
              '3. Cuando te avise (o veas el botón *Verificar estado* activo), continuarás con el enlace OAuth aquí.\n\n' +
              '_Hasta entonces no uses "Abrir OAuth": fallará si tu correo no está en la lista._';
            keyboard = [
              [
                {
                  text: '📧 Enviar mi correo de Google',
                  callback_data: 'finance:wiz_send_google_email',
                },
              ],
              ...wizardNavKeyboardHelper('gmail', { showNext: false }),
            ];
            break;
          }
          if (!wl.approved) {
            text =
              `${financeTitleHelper(adv)}\n\n` +
              '✉️ *Gmail — esperando administrador*\n\n' +
              `Tu correo registrado: \`${wl.email}\`\n\n` +
              'El administrador debe agregarlo como *usuario de prueba* en Google Cloud Console. ' +
              'Cuando lo haya hecho, pulsa *Verificar estado* y, si ya está aprobado, verás el enlace OAuth.';
            keyboard = [
              [
                {
                  text: '🔄 Verificar estado',
                  callback_data: 'finance:wiz_check_whitelist',
                },
              ],
              ...wizardNavKeyboardHelper('gmail', { showNext: false }),
            ];
            break;
          }
        }

        text =
          `${financeTitleHelper(adv)}\n\n` +
          '✉️ *Paso 3 — Gmail*\n\n' +
          'Conecta tu cuenta de Google para que podamos leer los correos de movimientos.\n\n' +
          'Abre el enlace, acepta permisos y vuelve aquí para *Verificar conexión*.';
        const urlR = await this.financeService.getGmailAuthUrl(uid);
        const kb: InlineKeyboardButton[][] = [];
        if (
          urlR.success &&
          (urlR.result as { authorization_url?: string })?.authorization_url
        ) {
          kb.push([
            {
              text: '🔐 Abrir enlace OAuth',
              url: (urlR.result as { authorization_url: string })
                .authorization_url,
            },
          ]);
        }
        kb.push([
          {
            text: '✅ Verificar conexión',
            callback_data: 'finance:wiz_verify_gmail',
          },
        ]);
        kb.push(
          ...wizardNavKeyboardHelper('gmail', { showNext: false }),
        );
        keyboard = kb;
        break;
      }
      case 'web_ui':
        text =
          `${financeTitleHelper(adv)}\n\n` +
          '🌐 *Paso 4 — Interfaz web (Finance)*\n\n' +
          '*Instalar como PWA (recomendado)*\n' +
          'Así tendrás la app como un icono en el móvil, sin tienda.\n\n' +
          '*Android (Chrome)*\n' +
          '1. Abre la web en Chrome: ' +
          onboardingUrls.financeWeb +
          '\n' +
          '2. Menú ⋮ → *Instalar aplicación* o *Añadir a la pantalla de inicio* (el nombre puede variar).\n' +
          '3. Confirma; quedará un acceso directo como una app.\n\n' +
          '*iPhone o iPad (Safari)*\n' +
          '1. Abre el enlace en *Safari* (si hace falta, "Abrir en Safari" desde el menú del navegador).\n' +
          '2. Pulsa *Compartir* .\n' +
          '3. *Añadir a la pantalla de Inicio* → *Añadir*.\n\n' +
          '*Pegar el mismo PAT en la web*\n' +
          'En configuración, campo *personal access token*, usa el mismo token que en el bot:\n' +
          onboardingUrls.financeSetup +
          '\n\n' +
          'Cuando lo hayas hecho, pulsa *Ya lo configuré*.';
        keyboard = [
          [{ text: '🌐 Abrir Finance (web)', url: onboardingUrls.financeWeb }],
          [
            {
              text: '⚙️ Configuración (pegar token)',
              url: onboardingUrls.financeSetup,
            },
          ],
          [
            {
              text: '✅ Ya lo configuré',
              callback_data: 'finance:wiz_web_done',
            },
          ],
          ...wizardNavKeyboardHelper('web_ui'),
        ];
        break;
      case 'apk': {
        const hasApk = !!(await this.botAssets.getFinanceApk());
        text =
          `${financeTitleHelper(adv)}\n\n` +
          '📱 *Paso 5 — App APK (opcional)*\n\n' +
          (hasApk
            ? 'Puedes descargar la APK desde aquí. En la app, si te lo pide, usa tu Telegram user ID:\n' +
              `\`${uid}\`\n`
            : 'Tu administrador aún no subió una APK al bot. Puedes omitir este paso.\n');
        const row: InlineKeyboardButton[] = [];
        if (
          hasApk &&
          (await sectionOnHelper(
            this.featureFlags,
            FEATURE_FLAGS.FINANCE_SECTION_APK,
          ))
        ) {
          row.push({
            text: '📥 Descargar APK',
            callback_data: 'finance:wiz_dl_apk',
          });
        }
        row.push({
          text: '✅ Ya configuré la app',
          callback_data: 'finance:wiz_apk_done',
        });
        row.push({
          text: '⏭️ Omitir APK',
          callback_data: 'finance:wiz_apk_skip',
        });
        keyboard = [row, ...wizardNavKeyboardHelper('apk')];
        break;
      }
      case 'complete':
        text =
          `${financeTitleHelper(adv)}\n\n` +
          '🎉 *Onboarding completado*\n\n' +
          'Ya puedes usar *Operaciones* para procesar correos y revisar el estado. ' +
          'Si cambias de móvil o token, vuelve al menú de Finanzas.';
        keyboard = [
          [
            {
              text: '📋 Revisar configuración',
              callback_data: 'finance:review_setup',
            },
          ],
        ];
        if (
          await sectionOnHelper(
            this.featureFlags,
            FEATURE_FLAGS.FINANCE_SECTION_APK,
          )
        ) {
          keyboard.push([
            { text: '📥 Obtener APK', callback_data: 'finance:get_apk' },
          ]);
        }
        keyboard.push([
          { text: '💰 Ir al menú Finanzas', callback_data: 'menu:finance' },
        ]);
        break;
      default:
        text = `${financeTitleHelper(adv)}\n\nTutorial — paso desconocido, volvemos al inicio.`;
        keyboard = wizardNavKeyboardHelper('start', { showBack: false });
    }

    const progressBar = buildProgressBarHelper(step, prog);
    await editOrSendHelper(
      this.bot,
      chatId,
      messageId,
      progressBar + text,
      keyboard,
    );
  }

  /**
   * Ask user for Firefly token and send it to Finance API
   */
  async setFireflyTokenAction(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const adv = await this.isAdvanced(chatId);
    if (messageId) {
      await this.bot.editMessageText(
        adv
          ? `${financeTitleHelper(adv)}\n\n🔑 Ingresa tu token de Firefly III (PAT):\n\n_${onboardingUrls.fireflyProfile}_`
          : `${financeTitleHelper(adv)}\n\n🔑 *Token de acceso de Firefly*\n\nCópialo desde tu perfil:\n${onboardingUrls.fireflyProfile}`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🔑 Abrir Firefly → perfil / token',
                  url: onboardingUrls.fireflyProfile,
                },
              ],
              [{ text: '🔙 Volver', callback_data: 'menu:finance' }],
            ],
          },
        },
      );
    }

    const promptMsg = await this.bot.sendMessage(
      chatId,
      adv
        ? `✍️ Responde a este mensaje con tu PAT.\n\nOrigen: ${onboardingUrls.fireflyProfile}\n\n⚠️ *No compartas este token con nadie.*`
        : `✍️ Responde a *este mensaje* pegando el token.\n\nLo sacas de: ${onboardingUrls.fireflyProfile}\n\n⚠️ *No lo compartas con nadie.*`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          force_reply: true,
        },
      },
    );

    const fromWizard = this.wizardAfterToken.has(chatId);
    const { text: token, replyMessageId } =
      await this.botInstance.getOnReplyMessageResponse(
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
            inline_keyboard: [
              [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
            ],
          },
        },
      );
      return;
    }

    const result = await this.financeService.setFireflyToken(
      getUserIdHelper(chatId),
      normalizedToken,
    );

    if (result.success) {
      if (fromWizard) {
        this.wizardAfterToken.delete(chatId);
        await this.onboarding.markFireflyTokenDone(getUserIdHelper(chatId));
        await this.renderWizardStep(chatId, undefined, 'gmail');
        return;
      }
      await this.onboarding.touchFireflyTokenOk(getUserIdHelper(chatId));
      await this.bot.sendMessage(
        chatId,
        adv
          ? '✅ Token de Firefly registrado correctamente para tu usuario.'
          : '✅ *Listo.* Tu token de Firefly quedó guardado para este bot.',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
            ],
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
          inline_keyboard: [
            [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
          ],
        },
      },
    );
  }

  async handleCallback(
    chatId: number,
    action: string,
    messageId?: number,
  ): Promise<boolean> {
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
        if (
          !(await sectionOnHelper(
            this.featureFlags,
            FEATURE_FLAGS.FINANCE_SECTION_REVIEW,
          ))
        ) {
          await editOrSendHelper(
            this.bot,
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
    return false;
  }
}
