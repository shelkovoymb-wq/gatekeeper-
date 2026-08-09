import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ServiceTokenGuard } from '../common/service-token.guard.js';
import { PaymentConfigService, type PaymentConfigInput } from './payment-config.service.js';

@Controller('payment-config')
export class PaymentConfigController {
  constructor(private readonly configService: PaymentConfigService) {}

  /**
   * Получить список всех доступных способов оплаты
   */
  @Get('methods')
  async getAllMethods() {
    const methods = await this.configService.getAllPaymentMethods();
    return {
      total: methods.length,
      methods: methods.map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description,
        setupTimeMinutes: m.setupTimeMinutes,
        commissionRate: m.commissionRate,
        settlementTime: m.settlementTime,
        supportedMethods: m.supportedMethods,
      })),
    };
  }

  /**
   * Получить полный гайд по конфигурации для конкретного провайдера
   */
  @Get('methods/:provider/guide')
  async getSetupGuide(@Param('provider') provider: string) {
    return await this.configService.getSetupGuide(provider);
  }

  /**
   * Интерактивный помощник для выбора способа оплаты
   */
  @Post('assistant/choose')
  @UseGuards(ServiceTokenGuard)
  async assistantChoosePaymentMethod(
    @Body()
    input: {
      clientId: string;
      businessType?: string; // subscription | one-time | both
      targetAudience?: string; // russia-only | international
      technicalLevel?: string; // beginner | intermediate | advanced
      priorities?: string[]; // low-commission | fast-setup | most-methods | instant
    },
  ) {
    const allMethods = await this.configService.getAllPaymentMethods();

    // Фильтруем методы по критериям
    let filtered = allMethods;

    if (input.targetAudience === 'international') {
      filtered = filtered.filter((m) => m.id !== 'robokassa');
    }

    if (input.technicalLevel === 'beginner') {
      // Рекомендуем более простые в настройке
      filtered = filtered.sort((a, b) => a.setupTimeMinutes - b.setupTimeMinutes);
    }

    if (input.priorities?.includes('low-commission')) {
      filtered = filtered.sort((a, b) => {
        const aRate = parseFloat(a.commissionRate);
        const bRate = parseFloat(b.commissionRate);
        return aRate - bRate;
      });
    }

    if (input.priorities?.includes('fast-setup')) {
      filtered = filtered.sort((a, b) => a.setupTimeMinutes - b.setupTimeMinutes);
    }

    const recommendation = filtered[0];

    return {
      recommendation: {
        id: recommendation.id,
        name: recommendation.name,
        description: recommendation.description,
        setupTimeMinutes: recommendation.setupTimeMinutes,
        commissionRate: recommendation.commissionRate,
        whyRecommended: this.getRecommendationReason(recommendation, input),
      },
      alternativeOptions: filtered.slice(1, 4).map((m) => ({
        id: m.id,
        name: m.name,
        setupTimeMinutes: m.setupTimeMinutes,
      })),
      nextStep: `Перейдите на /payment-config/methods/${recommendation.id}/guide для инструкций`,
    };
  }

  /**
   * Сохранить конфигурацию платёжного провайдера
   */
  @Post('save')
  @UseGuards(ServiceTokenGuard)
  async saveConfiguration(@Body() input: PaymentConfigInput) {
    return await this.configService.saveConfiguration(input);
  }

  /**
   * Получить текущие конфигурации клиента
   */
  @Get('client/:clientId')
  @UseGuards(ServiceTokenGuard)
  async getClientConfigs(@Param('clientId') clientId: string) {
    const configs = await this.configService.getClientConfigs(clientId);
    const activeCount = configs.filter((c) => c.isActive).length;

    return {
      clientId,
      totalConfigured: configs.length,
      activeProviders: activeCount,
      configs: configs.map((c) => ({
        id: c.id,
        provider: c.provider,
        isActive: c.isActive,
        setupTimeMinutes: c.guide?.setupTimeMinutes,
        name: c.guide?.name,
      })),
    };
  }

  /**
   * Отключить способ оплаты
   */
  @Delete('client/:clientId/provider/:provider')
  @UseGuards(ServiceTokenGuard)
  async disableProvider(
    @Param('clientId') clientId: string,
    @Param('provider') provider: string,
  ) {
    return await this.configService.disableProvider(clientId, provider);
  }

  /**
   * Получить персональную рекомендацию для клиента
   */
  @Get('client/:clientId/recommendation')
  @UseGuards(ServiceTokenGuard)
  async getRecommendation(@Param('clientId') clientId: string) {
    return await this.configService.getRecommendation(clientId);
  }

  /**
   * Интерактивный пошаговый гайд по настройке провайдера
   */
  @Post('assistant/setup-wizard')
  @UseGuards(ServiceTokenGuard)
  async setupWizard(
    @Body()
    input: {
      clientId: string;
      provider: string;
      step?: number; // На каком шаге помощь?
    },
  ) {
    const guide = await this.configService.getSetupGuide(input.provider);
    const currentStep = Math.max(0, Math.min(input.step ?? 0, guide.setupSteps.length - 1));
    const step = guide.setupSteps[currentStep];

    return {
      provider: input.provider,
      totalSteps: guide.setupSteps.length,
      currentStep: currentStep + 1,
      step: {
        ...step,
        estimated_time_minutes: 2,
        difficulty: currentStep < 2 ? 'easy' : 'medium',
      },
      requiredCredentials: guide.requiredCredentials,
      webhookUrl: guide.webhookUrl,
      nextAction:
        currentStep + 1 < guide.setupSteps.length
          ? `Переходите к шагу ${currentStep + 2}`
          : 'Все шаги завершены! Теперь добавьте учётные данные.',
      helpLinks: {
        official_docs: this.getOfficialDocsLink(input.provider),
        support_chat: 'https://t.me/gatekeeper_support',
        video_guide: this.getVideoGuideLink(input.provider),
      },
    };
  }

  /**
   * Проверить корректность конфигурации перед сохранением
   */
  @Post('validate')
  @UseGuards(ServiceTokenGuard)
  async validateConfiguration(@Body() input: Partial<PaymentConfigInput>) {
    if (!input.provider) {
      return { valid: false, errors: ['provider is required'] };
    }

    const guide = await this.configService.getSetupGuide(input.provider);
    const errors: string[] = [];

    guide.requiredCredentials.forEach((req) => {
      if (!input.credentials?.[req.key as keyof typeof input.credentials]) {
        errors.push(`${req.label} is required`);
      }
    });

    return {
      valid: errors.length === 0,
      errors,
      provider: guide.name,
      message: errors.length === 0 ? '✓ Конфигурация готова к сохранению' : 'Заполните все поля',
    };
  }

  /**
   * Интерактивный чат-асистент
   */
  @Post('assistant/chat')
  @UseGuards(ServiceTokenGuard)
  async assistantChat(
    @Body()
    input: {
      clientId: string;
      message: string;
    },
  ) {
    // Парсим сообщение пользователя и даём умный ответ
    const message = input.message.toLowerCase();

    if (message.includes('какой') || message.includes('какой способ')) {
      const recommendation = await this.configService.getRecommendation(input.clientId);
      return {
        type: 'recommendation',
        response: recommendation.recommendation,
        data: recommendation,
      };
    }

    if (message.includes('как настроить') || message.includes('как добавить')) {
      // Ищем провайдера в сообщении
      const providers = ['prodamus', 'yookassa', 'cloudpayments', 'robokassa', 'stars'];
      const mentionedProvider = providers.find((p) => message.includes(p));

      if (mentionedProvider) {
        const guide = await this.configService.getSetupGuide(mentionedProvider);
        return {
          type: 'setup_guide',
          provider: mentionedProvider,
          response: `Для настройки ${guide.name} потребуется примерно ${guide.setupTimeMinutes} минут`,
          steps: guide.setupSteps.slice(0, 2), // Первые 2 шага
          fullGuideLink: `/payment-config/methods/${mentionedProvider}/guide`,
        };
      }

      return {
        type: 'help',
        response: 'Какой способ оплаты вас интересует? (prodamus, yookassa, cloudpayments, robokassa, stars)',
      };
    }

    if (message.includes('стоим') || message.includes('комисс')) {
      const methods = await this.configService.getAllPaymentMethods();
      return {
        type: 'pricing',
        response: 'Вот комиссии разных провайдеров:',
        pricing: methods.map((m) => ({
          name: m.name,
          commission: m.commissionRate,
          settlement: m.settlementTime,
        })),
      };
    }

    // Default response
    return {
      type: 'help',
      response: `Я помогу вам с настройкой платёжных систем! Вы можете спросить:
- "Какой способ оплаты выбрать?"
- "Как настроить Prodamus?"
- "Какие комиссии?"
- "Сколько времени настраивается?"`,
      suggestions: [
        'Выбрать рекомендуемый способ оплаты',
        'Посмотреть пошаговый гайд',
        'Сравнить комиссии',
        'Проверить готовность конфигурации',
      ],
    };
  }

  // Helper methods
  private getRecommendationReason(
    provider: any,
    input: any,
  ): string {
    const reasons: string[] = [];

    if (input.technicalLevel === 'beginner') {
      reasons.push(`быстрая настройка (${provider.setupTimeMinutes} минут)`);
    }

    const rate = parseFloat(provider.commissionRate);
    if (rate < 2) {
      reasons.push('низкая комиссия');
    }

    if (input.priorities?.includes('most-methods')) {
      reasons.push(`поддерживает ${provider.supportedMethods.length} способов оплаты`);
    }

    return reasons.join(', ') || 'лучший выбор для вас';
  }

  private getOfficialDocsLink(provider: string): string {
    const links: Record<string, string> = {
      prodamus: 'https://prodamus.ru/api/',
      yookassa: 'https://yookassa.ru/developers',
      cloudpayments: 'https://cloudpayments.ru/Docs/API',
      robokassa: 'https://www.robokassa.ru/ru/Doc/Asp/Integration.aspx',
      stars: 'https://core.telegram.org/bots/payments',
    };
    return links[provider] || '#';
  }

  private getVideoGuideLink(provider: string): string {
    // Ссылки на видеогайды (могут быть добавлены позже)
    return `https://youtube.com/results?search_query=gatekeeper+${provider}+setup`;
  }
}
