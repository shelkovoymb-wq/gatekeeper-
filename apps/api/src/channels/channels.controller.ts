import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ServiceTokenGuard } from '../common/service-token.guard.js';
import { ChannelsService } from './channels.service.js';

@Controller('v1/channels')
@UseGuards(ServiceTokenGuard)
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Get()
  async list(@Query('botId') botId: string) {
    return this.channels.listByBot(botId);
  }

  @Post(':id/invite-link')
  async inviteLink(@Param('id') id: string, @Body() dto: { planId?: string }) {
    const url = await this.channels.createInviteLink(id, dto.planId);
    return { url };
  }
}
