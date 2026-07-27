import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Auth, JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthContext } from '../auth/auth.types.js';
import { AssistantService, type ChatMessage } from './assistant.service.js';

interface ChatDto {
  messages: ChatMessage[];
}

@Controller('v1/cabinet/assistant')
@UseGuards(JwtAuthGuard)
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Post()
  chat(@Auth() auth: AuthContext, @Body() dto: ChatDto) {
    if (!auth.clientId) throw new BadRequestException('нет привязанного проекта');
    const messages = Array.isArray(dto?.messages) ? dto.messages.slice(-20) : [];
    return this.assistant.chat(auth.clientId, messages);
  }
}
