import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ServiceTokenGuard } from '../common/service-token.guard.js';
import { PlansService, type CreatePlanInput } from './plans.service.js';

@Controller('v1/plans')
@UseGuards(ServiceTokenGuard)
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Post()
  async create(@Body() dto: CreatePlanInput) {
    return this.plans.create(dto);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.plans.get(id);
  }

  @Post(':id/channels')
  async link(@Param('id') id: string, @Body() dto: { channelIds: string[] }) {
    await this.plans.linkChannels(id, dto.channelIds);
    return { ok: true };
  }
}
