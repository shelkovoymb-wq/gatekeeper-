import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Req,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { ServiceTokenGuard } from '../common/service-token.guard.js';
import { PaymentsService } from './payments.service.js';
import type { PaymentRequest } from './payment.types.js';

/** Nest с { rawBody: true } кладёт сырой Buffer тела прямо на request. */
interface RawBodyReq {
  rawBody?: Buffer;
  headers: Record<string, string | string[] | undefined>;
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentService: PaymentsService) {}

  @Post('initiate')
  @UseGuards(ServiceTokenGuard)
  async initiatePayment(@Body() request: PaymentRequest) {
    if (!request.clientId || !request.amount || !request.provider) {
      throw new BadRequestException('Missing required fields: clientId, amount, provider');
    }
    return this.paymentService.initiatePayment(request);
  }

  // Публичный эндпоинт для вебхуков платёжных провайдеров (без Bearer) —
  // подлинность проверяется внутри каждого провайдера (подпись/сверка с API),
  // см. payment.types.ts WebhookVerifyContext.
  @Post('webhook/:provider')
  async handleWebhook(
    @Param('provider') provider: string,
    @Body() payload: unknown,
    @Req() req: RawBodyReq,
  ) {
    return this.paymentService.handleWebhook(provider, {
      body: payload,
      rawBody: req.rawBody,
      headers: req.headers,
    });
  }

  @Get(':paymentId')
  @UseGuards(ServiceTokenGuard)
  async getPayment(@Param('paymentId') paymentId: string) {
    return this.paymentService.getPayment(paymentId);
  }

  @Get()
  @UseGuards(ServiceTokenGuard)
  async listPayments(
    @Query('clientId') clientId?: string,
    @Query('limit') limit = '50',
    @Query('offset') offset = '0',
  ) {
    return this.paymentService.listClientPayments(
      clientId ?? 'all',
      parseInt(limit, 10),
      parseInt(offset, 10),
    );
  }

  @Post(':paymentId/refund')
  @UseGuards(ServiceTokenGuard)
  async refundPayment(
    @Param('paymentId') paymentId: string,
    @Body() body: { amount?: number; reason?: string },
  ) {
    return this.paymentService.refundPayment(paymentId, body.amount, body.reason);
  }
}
