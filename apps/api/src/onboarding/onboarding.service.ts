import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { AuthService } from '../auth/auth.service.js';
import { CabinetService } from '../cabinet/cabinet.service.js';
import type { JwtPayload } from '../auth/auth.types.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
export interface OnboardingReply {
  reply: string;
  mode: 'llm' | 'guided';
  stateChanged: boolean;
  /** Присутствует только в ответе, где произошла регистрация — фронт сохраняет как сессию. */
  token?: string;
}

const SYSTEM_PROMPT = `Ты — ассистент платформы Gatekeeper на главной странице сайта. Общаешься с новым посетителем,
который ещё не зарегистрирован. Gatekeeper — платформа для платных закрытых Telegram-каналов: клиент подключает
своего бота, бот продаёт подписки, впускает оплативших в закрытый канал и автоматически выкидывает тех, кто не продлил.

Порядок диалога:
1) Если посетитель ещё не зарегистрирован — коротко (2-3 предложения) объясни, как работает платформа, и предложи начать.
2) Когда человек готов — собери email, пароль (от 8 символов) и название проекта/канала, вызови инструмент register.
3) Сразу после успешной регистрации — веди дальше по тем же шагам, что и в кабинете: подключить Telegram-бота
   (токен от @BotFather, инструмент connect_bot), создать тариф (create_plan), включить оплату (configure_payment).
   Перед этим всегда смотри get_setup_state.
Никогда не выдумывай данные — спрашивай короткими уточнениями. Отвечай по-русски, дружелюбно, без канцелярита.`;

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

const TOOLS: AnthropicTool[] = [
  {
    name: 'register',
    description: 'Зарегистрировать нового клиента платформы (создаёт аккаунт и проект).',
    input_schema: {
      type: 'object',
      properties: {
        email: { type: 'string' },
        password: { type: 'string', description: 'От 8 символов' },
        companyName: { type: 'string', description: 'Название проекта/канала' },
      },
      required: ['email', 'password', 'companyName'],
    },
  },
  {
    name: 'get_setup_state',
    description: 'Вернуть текущее состояние настройки: боты, каналы, тарифы, платежи. Доступно только после регистрации.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'connect_bot',
    description: 'Подключить Telegram-бота по токену от @BotFather. Доступно только после регистрации.',
    input_schema: {
      type: 'object',
      properties: { token: { type: 'string', description: 'Токен вида 123456:ABC-...' } },
      required: ['token'],
    },
  },
  {
    name: 'create_plan',
    description: 'Создать тариф подписки для клиента. Доступно только после регистрации.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        price: { type: 'number', description: 'Цена в рублях' },
        periodDays: { type: 'number', description: '7, 30, 90, 365; 0 = навсегда' },
        trialDays: { type: 'number' },
      },
      required: ['name', 'price', 'periodDays'],
    },
  },
  {
    name: 'configure_payment',
    description:
      'Включить провайдер оплаты. Для stars ключи не нужны. Доступно только после регистрации.',
    input_schema: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: ['yookassa', 'cloudpayments', 'robokassa', 'stars'] },
        credentials: { type: 'object' },
      },
      required: ['provider'],
    },
  },
];

/** Мутируемый контекст текущего запроса — регистрация меняет его "на лету". */
interface RunCtx {
  clientId: string | null;
  token?: string;
}

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
    private readonly cabinet: CabinetService,
  ) {}

  async chat(messages: ChatMessage[], existingToken?: string): Promise<OnboardingReply> {
    const ctx: RunCtx = { clientId: await this.resolveClientId(existingToken) };

    if (this.env.ANTHROPIC_API_KEY) {
      try {
        return await this.llmChat(ctx, messages);
      } catch (e) {
        this.logger.warn(`LLM onboarding failed, fallback to guided: ${(e as Error).message}`);
      }
    }
    return this.guided(ctx);
  }

  private async resolveClientId(token?: string): Promise<string | null> {
    if (!token) return null;
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      return payload.cid ?? null;
    } catch {
      return null;
    }
  }

  private async llmChat(ctx: RunCtx, messages: ChatMessage[]): Promise<OnboardingReply> {
    const apiMessages: Array<{ role: 'user' | 'assistant'; content: unknown }> = messages.map(
      (m) => ({ role: m.role, content: m.content }),
    );
    let stateChanged = false;

    for (let step = 0; step < 6; step++) {
      const res = await fetch(`${this.env.ANTHROPIC_BASE_URL}/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.env.ANTHROPIC_API_KEY as string,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.env.ANTHROPIC_MODEL,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          tools: TOOLS,
          messages: apiMessages,
        }),
      });
      if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = (await res.json()) as {
        stop_reason: string;
        content: Array<Record<string, unknown>>;
      };
      apiMessages.push({ role: 'assistant', content: data.content });

      if (data.stop_reason !== 'tool_use') {
        const text = data.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text as string)
          .join('\n')
          .trim();
        return { reply: text || 'Готово.', mode: 'llm', stateChanged, token: ctx.token };
      }

      const toolResults: Array<Record<string, unknown>> = [];
      for (const block of data.content) {
        if (block.type !== 'tool_use') continue;
        const name = block.name as string;
        const input = (block.input ?? {}) as Record<string, unknown>;
        let result: unknown;
        try {
          result = await this.runTool(ctx, name, input);
          if (name !== 'get_setup_state') stateChanged = true;
        } catch (e) {
          result = { error: (e as Error).message };
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }
      apiMessages.push({ role: 'user', content: toolResults });
    }
    return {
      reply: 'Не удалось завершить за отведённые шаги, попробуйте уточнить запрос.',
      mode: 'llm',
      stateChanged,
      token: ctx.token,
    };
  }

  private async runTool(ctx: RunCtx, name: string, input: Record<string, unknown>) {
    if (name === 'register') {
      if (ctx.clientId) return { error: 'вы уже зарегистрированы' };
      const result = await this.auth.register({
        email: String(input.email ?? ''),
        password: String(input.password ?? ''),
        companyName: String(input.companyName ?? ''),
      });
      ctx.clientId = result.user.clientId;
      ctx.token = result.token;
      return { success: true };
    }

    if (!ctx.clientId) {
      return { error: 'сначала нужно зарегистрироваться (инструмент register)' };
    }

    switch (name) {
      case 'get_setup_state':
        return this.state(ctx.clientId);
      case 'connect_bot':
        return this.cabinet.connectBot(ctx.clientId, String(input.token));
      case 'create_plan':
        return this.cabinet.createPlan(ctx.clientId, {
          name: String(input.name),
          price: Number(input.price),
          periodDays: Number(input.periodDays),
          trialDays: input.trialDays != null ? Number(input.trialDays) : undefined,
        });
      case 'configure_payment':
        return this.cabinet.setPayment(
          ctx.clientId,
          String(input.provider),
          (input.credentials as Record<string, unknown>) ?? null,
          true,
        );
      default:
        return { error: `unknown tool ${name}` };
    }
  }

  private async state(clientId: string) {
    const [bots, channels, plans, payments] = await Promise.all([
      this.cabinet.listBots(clientId),
      this.cabinet.listChannels(clientId),
      this.cabinet.listPlans(clientId),
      this.cabinet.listPayments(clientId),
    ]);
    return {
      bots: bots.map((b) => ({ username: b.username, status: b.status })),
      channels: channels.map((c) => ({ name: c.name, botStatus: c.botStatus })),
      plans: plans.map((p) => ({ name: p.name, price: p.price, periodDays: p.periodDays })),
      payments: payments.filter((p) => p.configured).map((p) => p.provider),
    };
  }

  /** Без ключа Anthropic — просто направляем на обычную форму регистрации. */
  private guided(ctx: RunCtx): OnboardingReply {
    const reply = ctx.clientId
      ? 'Вы уже зарегистрированы — продолжите настройку в личном кабинете.'
      : 'Привет! Gatekeeper помогает продавать платный доступ в закрытые Telegram-каналы: ' +
        'бот принимает оплату, впускает подписчика и автоматически убирает тех, кто не продлил. ' +
        'Чтобы начать — зарегистрируйтесь на странице /register, дальше я помогу настроить всё в кабинете.';
    return { reply, mode: 'guided', stateChanged: false };
  }
}
