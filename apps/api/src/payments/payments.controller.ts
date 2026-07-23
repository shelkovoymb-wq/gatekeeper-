import { Controller, Post, Get, Body, Param, Query, BadRequestException, NotFoundException } from '@nestjs/common'
import { PaymentsService } from './payments.service'
import { PaymentRequest } from './payment.types'

@Controller('payments')
export class PaymentsController {
  constructor(private paymentService: PaymentsService) {}

  @Post('initiate')
  async initiatePayment(@Body() request: PaymentRequest) {
    if (!request.clientId || !request.amount || !request.provider) {
      throw new BadRequestException('Missing required fields: clientId, amount, provider')
    }
    return this.paymentService.initiatePayment(request)
  }

  @Post('webhook/:provider')
  async handleWebhook(@Param('provider') provider: string, @Body() payload: any) {
    return this.paymentService.handleWebhook(provider, payload)
  }

  @Get(':paymentId')
  async getPayment(@Param('paymentId') paymentId: string) {
    return this.paymentService.getPayment(paymentId)
  }

  @Get()
  async listPayments(@Query('status') status?: string, @Query('provider') provider?: string, @Query('limit') limit = '50', @Query('offset') offset = '0') {
    const filters = { status, provider }
    return this.paymentService.listClientPayments('all', parseInt(limit), parseInt(offset))
  }

  @Post(':paymentId/refund')
  async refundPayment(@Param('paymentId') paymentId: string, @Body() body: { amount?: number; reason?: string }) {
    return this.paymentService.refundPayment(paymentId, body.amount, body.reason)
  }
}
