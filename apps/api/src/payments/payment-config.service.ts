import { Inject, Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module.js';
import { paymentConfigs, clients } from '../db/schema.js';

export interface PaymentConfigInput {
  clientId: string;
  provider: 'yookassa' | 'cloudpayments' | 'robokassa' | 'prodamus' | 'stars';
  credentials?: {
    shopId?: string;
    secretKey?: string;
    apiKey?: string;
    publicId?: string;
    password1?: string;
    password2?: string;
    merchantLogin?: string;
  };
}

export interface PaymentProviderSetupGuide {
  name: string;
  description: string;
  supportedMethods: string[];
  setupSteps: { step: number; title: string; description: string; action?: string }[];
  requiredCredentials: { key: string; label: string; example: string; help: string }[];
  webhookUrl: string;
  testModeAvailable: boolean;
  commissionRate: string;
  settlementTime: string;
  setupTimeMinutes: number;
}

@Injectable()
export class PaymentConfigService {
  private readonly logger = new Logger(PaymentConfigService.name);

  // Гайды по настройке каждого провайдера
  private readonly setupGuides: Record<string, PaymentProviderSetupGuide> = {
    prodamus: {
      name: 'Prodamus',
      description: 'Российская платёжная система для приёма платежей с карт и электронных кошельков',
      supportedMethods: ['Карта Visa/MasterCard', 'Яндекс.Касса', 'PayPal', 'Криптовалюты'],
      setupSteps: [
        {
          step: 1,
          title: 'Регистрация на Prodamus',
          description: 'Перейдите на https://prodamus.ru и создайте аккаунт',
          action: 'https://prodamus.ru/register',
        },
        {
          step: 2,
          title: 'Верификация аккаунта',
          description: 'Пройдите верификацию личности (документ, ИНН)',
        },
        {
          step: 3,
          title: 'Создание магазина',
          description: 'В личном кабинете создайте магазин для вашего проекта',
        },
        {
          step: 4,
          title: 'Получение API ключей',
          description: 'В разделе API скопируйте API Key и Secret Key',
        },
        {
          step: 5,
          title: 'Настройка вебхука',
          description: 'Установите URL вебхука в настройках магазина',
        },
      ],
      requiredCredentials: [
        {
          key: 'apiKey',
          label: 'API Key',
          example: 'sk_live_xxxxxxxxx',
          help: 'Найдите в разделе "API & Webhooks" → "API Keys"',
        },
        {
          key: 'secretKey',
          label: 'Secret Key',
          example: 'secret_xxxxxxxxx',
          help: 'Используется для подписи вебхуков и запросов',
        },
      ],
      webhookUrl: 'https://api.gatekeeper.ru/payments/webhook/prodamus',
      testModeAvailable: true,
      commissionRate: '1.5% - 2.9%',
      settlementTime: '1-2 рабочих дня',
      setupTimeMinutes: 15,
    },
    yookassa: {
      name: 'YooKassa',
      description: 'Платёжный сервис от Яндекса. Приём платежей с карт, электронных кошельков и банковских переводов',
      supportedMethods: ['Карта Visa/MasterCard', 'Яндекс.Касса', 'Банковский перевод', 'СБП'],
      setupSteps: [
        {
          step: 1,
          title: 'Создание аккаунта YooKassa',
          description: 'Перейдите на https://yookassa.ru и зарегистрируйтесь',
          action: 'https://yookassa.ru/registration',
        },
        {
          step: 2,
          title: 'Заполнение профиля',
          description: 'Укажите данные вашей компании, банковский счёт для расчётов',
        },
        {
          step: 3,
          title: 'Подключение магазина',
          description: 'Создайте новый магазин в разделе "Мои магазины"',
        },
        {
          step: 4,
          title: 'Получение реквизитов',
          description: 'Скопируйте Shop ID и Secret Key для API',
        },
        {
          step: 5,
          title: 'Настройка вебхука',
          description: 'В настройках магазина укажите URL для уведомлений',
        },
      ],
      requiredCredentials: [
        {
          key: 'shopId',
          label: 'Shop ID',
          example: '123456',
          help: 'Числовой идентификатор магазина',
        },
        {
          key: 'secretKey',
          label: 'Secret Key',
          example: 'test_xxxxxxxxxxxx',
          help: 'Секретный ключ для аутентификации API',
        },
      ],
      webhookUrl: 'https://api.gatekeeper.ru/payments/webhook/yookassa',
      testModeAvailable: true,
      commissionRate: '1.9% - 4.5%',
      settlementTime: '1-2 рабочих дня',
      setupTimeMinutes: 20,
    },
    cloudpayments: {
      name: 'CloudPayments',
      description: 'Облачная платёжная система для приёма платежей онлайн. Поддержка карт и электронных кошельков',
      supportedMethods: ['Карта Visa/MasterCard', 'Яндекс.Касса', 'WebMoney', 'Qiwi'],
      setupSteps: [
        {
          step: 1,
          title: 'Регистрация на CloudPayments',
          description: 'Создайте аккаунт на https://cloudpayments.ru',
          action: 'https://cloudpayments.ru/Authorize/Register',
        },
        {
          step: 2,
          title: 'Верификация',
          description: 'Подтвердите Email и укажите данные компании',
        },
        {
          step: 3,
          title: 'Создание POS-терминала',
          description: 'В разделе "POS-терминалы" создайте новый терминал',
        },
        {
          step: 4,
          title: 'Получение Public ID и API Secret',
          description: 'Скопируйте реквизиты для подключения',
        },
        {
          step: 5,
          title: 'Настройка оповещений',
          description: 'Укажите URL для вебхуков в настройках',
        },
      ],
      requiredCredentials: [
        {
          key: 'publicId',
          label: 'Public ID',
          example: 'pk_test_xxxxxxxxx',
          help: 'Публичный идентификатор из настроек терминала',
        },
        {
          key: 'password1',
          label: 'API Secret',
          example: 'api_secret_key',
          help: 'Секретный ключ API (Password 1)',
        },
      ],
      webhookUrl: 'https://api.gatekeeper.ru/payments/webhook/cloudpayments',
      testModeAvailable: true,
      commissionRate: '1.5% - 2.5%',
      settlementTime: '1-2 рабочих дня',
      setupTimeMinutes: 15,
    },
    robokassa: {
      name: 'Робокасса',
      description: 'Российская платёжная система с поддержкой множества способов оплаты',
      supportedMethods: ['Банковская карта', 'Интернет-банк', 'QIWI', 'Яндекс.Касса', 'WebMoney'],
      setupSteps: [
        {
          step: 1,
          title: 'Создание аккаунта',
          description: 'Зарегистрируйтесь на https://www.robokassa.ru',
          action: 'https://www.robokassa.ru/ru/Doc/Asp/Integration.aspx',
        },
        {
          step: 2,
          title: 'Верификация продавца',
          description: 'Пройдите процесс верификации',
        },
        {
          step: 3,
          title: 'Получение учётных данных',
          description: 'Найдите Merchant Login и пароли в личном кабинете',
        },
        {
          step: 4,
          title: 'Настройка URL уведомлений',
          description: 'Укажите две разных URL (Result и Check)',
        },
        {
          step: 5,
          title: 'Тестирование',
          description: 'Проведите тестовый платёж',
        },
      ],
      requiredCredentials: [
        {
          key: 'merchantLogin',
          label: 'Merchant Login',
          example: 'demo',
          help: 'Ваш логин в системе Робокассы',
        },
        {
          key: 'password1',
          label: 'Password 1',
          example: 'password1xxx',
          help: 'Пароль для подписи платежей',
        },
        {
          key: 'password2',
          label: 'Password 2',
          example: 'password2xxx',
          help: 'Пароль для подписи уведомлений (ВАЖНО!)',
        },
      ],
      webhookUrl: 'https://api.gatekeeper.ru/payments/webhook/robokassa',
      testModeAvailable: true,
      commissionRate: '1.4% - 2.5%',
      settlementTime: '1-2 рабочих дня',
      setupTimeMinutes: 20,
    },
    stars: {
      name: 'Telegram Stars',
      description: 'Встроенная платёжная система Telegram. Платежи прямо в мессенджере',
      supportedMethods: ['Telegram Stars'],
      setupSteps: [
        {
          step: 1,
          title: 'Требования',
          description: 'Ваш бот должен быть валидным ботом Telegram',
        },
        {
          step: 2,
          title: 'Активация платежей',
          description: 'Достаточно одного клика - система автоматически включена',
        },
        {
          step: 3,
          title: 'Конфигурация',
          description: 'Укажите цены в Stars для ваших планов',
        },
        {
          step: 4,
          title: 'Уведомления',
          description: 'Платформа получает уведомления от Telegram API автоматически',
        },
      ],
      requiredCredentials: [
        {
          key: 'botToken',
          label: 'Bot Token',
          example: '123456789:ABCDEFGHIJKLMNOPQRSTUVWxyz',
          help: 'Токен вашего Telegram бота (уже сохранён)',
        },
      ],
      webhookUrl: 'Встроен в Telegram Bot API',
      testModeAvailable: false,
      commissionRate: '30% (Telegram берёт комиссию)',
      settlementTime: 'Мгновенно',
      setupTimeMinutes: 2,
    },
  };

  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Получить все доступные способы оплаты с подробной информацией
   */
  async getAllPaymentMethods() {
    return Object.entries(this.setupGuides).map(([key, guide]) => ({
      id: key,
      ...guide,
    }));
  }

  /**
   * Получить гайд по конкретному способу оплаты
   */
  async getSetupGuide(provider: string): Promise<PaymentProviderSetupGuide> {
    const guide = this.setupGuides[provider as keyof typeof this.setupGuides];
    if (!guide) {
      throw new NotFoundException(`Setup guide not found for provider: ${provider}`);
    }
    return guide;
  }

  /**
   * Сохранить конфигурацию платёжного провайдера
   */
  async saveConfiguration(input: PaymentConfigInput) {
    const guide = this.setupGuides[input.provider as keyof typeof this.setupGuides];
    if (!guide) {
      throw new BadRequestException(`Unknown payment provider: ${input.provider}`);
    }

    // Валидируем, что все необходимые учётные данные предоставлены
    const missingCredentials = guide.requiredCredentials.filter(
      (req) => !input.credentials?.[req.key as keyof typeof input.credentials],
    );

    if (missingCredentials.length > 0) {
      throw new BadRequestException(
        `Missing required credentials: ${missingCredentials.map((c) => c.key).join(', ')}`,
      );
    }

    // Проверяем, что клиент существует
    const [client] = await this.db
      .select()
      .from(clients)
      .where(eq(clients.id, input.clientId))
      .limit(1);

    if (!client) {
      throw new NotFoundException(`Client not found: ${input.clientId}`);
    }

    // Деактивируем существующую конфигурацию этого провайдера
    await this.db
      .update(paymentConfigs)
      .set({ isActive: false })
      .where(
        and(
          eq(paymentConfigs.clientId, input.clientId),
          eq(paymentConfigs.provider, input.provider),
        ),
      );

    // Сохраняем новую конфигурацию
    // TODO: Зашифровать credentials перед сохранением
    const credentialsJson = JSON.stringify(input.credentials);

    const [config] = await this.db
      .insert(paymentConfigs)
      .values({
        clientId: input.clientId,
        provider: input.provider,
        credentialsEnc: credentialsJson, // TODO: encrypt
        isActive: true,
      })
      .returning();

    this.logger.log(
      `Payment configuration saved: ${input.clientId} → ${input.provider}`,
    );

    return {
      id: config.id,
      provider: config.provider,
      isActive: config.isActive,
      message: `✓ ${guide.name} успешно настроена`,
    };
  }

  /**
   * Получить текущую конфигурацию клиента
   */
  async getClientConfigs(clientId: string) {
    const configs = await this.db
      .select()
      .from(paymentConfigs)
      .where(eq(paymentConfigs.clientId, clientId));

    return configs.map((config) => ({
      id: config.id,
      provider: config.provider,
      isActive: config.isActive,
      guide: this.setupGuides[config.provider as keyof typeof this.setupGuides],
    }));
  }

  /**
   * Отключить провайдер
   */
  async disableProvider(clientId: string, provider: string) {
    await this.db
      .update(paymentConfigs)
      .set({ isActive: false })
      .where(
        and(
          eq(paymentConfigs.clientId, clientId),
          eq(paymentConfigs.provider, provider),
        ),
      );

    this.logger.log(`Payment provider disabled: ${clientId} → ${provider}`);
    return { message: `${provider} отключена` };
  }

  /**
   * Получить рекомендацию о лучшем провайдере для клиента
   */
  async getRecommendation(clientId: string) {
    const configs = await this.getClientConfigs(clientId);
    const activeProviders = configs.filter((c) => c.isActive);

    if (activeProviders.length >= 3) {
      return {
        recommendation: 'У вас уже настроено достаточно способов оплаты',
        providers: activeProviders,
      };
    }

    // Рекомендуем наиболее популярные и быстрые в настройке
    const recommended = ['prodamus', 'yookassa', 'stars'].filter(
      (p) => !activeProviders.some((c) => c.provider === p),
    );

    return {
      recommendation: `Рекомендуем добавить: ${recommended.join(', ')}`,
      availableToAdd: recommended.map((p) => ({
        id: p,
        ...this.setupGuides[p as keyof typeof this.setupGuides],
      })),
      activeProviders,
    };
  }
}
