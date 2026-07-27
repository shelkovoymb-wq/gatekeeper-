import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { CabinetService } from '../cabinet/cabinet.service.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
export interface AssistantReply {
  reply: string;
  mode: 'llm' | 'guided';
  stateChanged: boolean;
}

const SYSTEM_PROMPT = `Ты — ассистент настройки платформы Gatekeeper (платные закрытые Telegram-каналы).
Помогаешь владельцу проекта пройти настройку по шагам и сам выполняешь действия через инструменты.
Отвечай кратко, дружелюбно, по-русски. Порядок настройки:
1) Подключить Telegram-бота (клиент присылает токен от @BotFather) — инструмент connect_bot.
2) Добавить бота админом в свой канал с правами «Приглашать» и «Банить» (это клиент делает в Telegram; канал появится автоматически).
3) Создать тариф (название, цена в рублях, период в днях) — инструмент create_plan.
4) Подключить приём платежей (ЮKassa/CloudPayments/Robokassa/Telegram Stars) — инструмент configure_payment.
Всегда сначала смотри текущее состояние через get_setup_state. Никогда не выдумывай токены и ключи — проси их у пользователя. Если данных не хватает — задай один короткий уточняющий вопрос.`;

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

const TOOLS: AnthropicTool[] = [
  {
    name: 'get_setup_state',
    description: 'Вернуть текущее состояние настройки: боты, каналы, тарифы, платежи.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'connect_bot',
    description: 'Подключить Telegram-бота по токену от @BotFather.',
    input_schema: {
      type: 'object',
      properties: { token: { type: 'string', description: 'Токен вида 123456:ABC-...' } },
      required: ['token'],
    },
  },
  {
    name: 'create_plan',
    description: 'Создать тариф подписки для клиента.',
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
      'Включить провайдер оплаты. Для stars ключи не нужны. Для остальных передай credentials (объект ключей).',
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

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly cabinet: CabinetService,
  ) {}

  async chat(clientId: string, messages: ChatMessage[]): Promise<AssistantReply> {
    if (this.env.ANTHROPIC_API_KEY) {
      try {
        return await this.llmChat(clientId, messages);
      } catch (e) {
        this.logger.warn(`LLM assistant failed, fallback to guided: ${(e as Error).message}`);
      }
    }
    return this.guided(clientId, messages);
  }

  // ─── Реальный ИИ через Anthropic Messages API + tool-use ───
  private async llmChat(clientId: string, messages: ChatMessage[]): Promise<AssistantReply> {
    const apiMessages: Array<{ role: 'user' | 'assistant'; content: unknown }> = messages.map(
      (m) => ({ role: m.role, content: m.content }),
    );
    let stateChanged = false;

    for (let step = 0; step < 6; step++) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
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
        return { reply: text || 'Готово.', mode: 'llm', stateChanged };
      }

      // Выполняем запрошенные инструменты
      const toolResults: Array<Record<string, unknown>> = [];
      for (const block of data.content) {
        if (block.type !== 'tool_use') continue;
        const name = block.name as string;
        const input = (block.input ?? {}) as Record<string, unknown>;
        let result: unknown;
        try {
          result = await this.runTool(clientId, name, input);
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
    return { reply: 'Не удалось завершить за отведённые шаги, попробуйте уточнить запрос.', mode: 'llm', stateChanged };
  }

  private async runTool(clientId: string, name: string, input: Record<string, unknown>) {
    switch (name) {
      case 'get_setup_state':
        return this.state(clientId);
      case 'connect_bot':
        return this.cabinet.connectBot(clientId, String(input.token));
      case 'create_plan':
        return this.cabinet.createPlan(clientId, {
          name: String(input.name),
          price: Number(input.price),
          periodDays: Number(input.periodDays),
          trialDays: input.trialDays != null ? Number(input.trialDays) : undefined,
        });
      case 'configure_payment':
        return this.cabinet.setPayment(
          clientId,
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

  // ─── Guided-режим (без внешнего LLM): смотрит состояние и подсказывает шаг ───
  private async guided(clientId: string, messages: ChatMessage[]): Promise<AssistantReply> {
    const last = messages.filter((m) => m.role === 'user').at(-1)?.content?.trim() ?? '';
    let stateChanged = false;

    // Пытаемся распознать токен бота прямо в сообщении.
    const tokenMatch = last.match(/\b(\d{6,}:[\w-]{30,})\b/);
    if (tokenMatch) {
      try {
        const r = await this.cabinet.connectBot(clientId, tokenMatch[1]);
        stateChanged = true;
        return {
          reply: `Бот @${r.username} подключён ✅\nТеперь добавьте его администратором в ваш канал с правами «Приглашать пользователей» и «Банить», затем напишите мне — создадим тариф.`,
          mode: 'guided',
          stateChanged,
        };
      } catch (e) {
        return {
          reply: `Не получилось подключить бота: ${(e as Error).message}\nПроверьте токен от @BotFather и пришлите ещё раз.`,
          mode: 'guided',
          stateChanged,
        };
      }
    }

    const s = await this.state(clientId);
    let step: string;
    if (s.bots.length === 0) {
      step =
        'Шаг 1. Пришлите токен вашего Telegram-бота от @BotFather (вида 123456:ABC...). Я его подключу.';
    } else if (s.channels.length === 0) {
      step =
        'Шаг 2. Добавьте вашего бота администратором в канал с правами «Приглашать» и «Банить». Канал появится здесь автоматически — потом напишите мне.';
    } else if (s.plans.length === 0) {
      step =
        'Шаг 3. Создадим тариф. На вкладке «Тарифы» задайте название, цену (₽) и период (дней). Или скажите, например: «тариф Базовый 490 на 30 дней».';
    } else if (s.payments.length === 0) {
      step =
        'Шаг 4. Подключите приём оплаты на вкладке «Платежи» (ЮKassa/CloudPayments/Robokassa) или включите Telegram Stars — для них ключи не нужны.';
    } else {
      step = 'Базовая настройка завершена 🎉 Каналы, тариф и платежи готовы. Можно принимать подписчиков.';
    }

    const greeting = last
      ? 'Подскажу по настройке.'
      : 'Привет! Я помогу настроить Gatekeeper.';
    return { reply: `${greeting}\n\n${step}`, mode: 'guided', stateChanged };
  }
}
