import { Body, Controller, Headers, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OnboardingService, type ChatMessage } from './onboarding.service.js';

interface ChatDto {
  messages: ChatMessage[];
}

/** Публичный (без авторизации) чат на главной странице — регистрирует и настраивает диалогом. */
@Controller('v1/public/onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  // 20 сообщений/мин с одного IP — каждое дёргает платный LLM-шлюз,
  // без лимита это открытый счётчик расходов и вектор спам-регистраций.
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post()
  chat(@Body() dto: ChatDto, @Headers('authorization') authHeader?: string) {
    const messages = Array.isArray(dto?.messages) ? dto.messages.slice(-20) : [];
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    return this.onboarding.chat(messages, token);
  }
}
