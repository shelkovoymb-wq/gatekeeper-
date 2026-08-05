import { Body, Controller, Headers, Post } from '@nestjs/common';
import { OnboardingService, type ChatMessage } from './onboarding.service.js';

interface ChatDto {
  messages: ChatMessage[];
}

/** Публичный (без авторизации) чат на главной странице — регистрирует и настраивает диалогом. */
@Controller('v1/public/onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post()
  chat(@Body() dto: ChatDto, @Headers('authorization') authHeader?: string) {
    const messages = Array.isArray(dto?.messages) ? dto.messages.slice(-20) : [];
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    return this.onboarding.chat(messages, token);
  }
}
