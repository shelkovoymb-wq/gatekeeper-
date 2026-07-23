import { Controller, Post, Get, Body, Param, BadRequestException } from '@nestjs/common'
import { PaymentsService } from './payments.service'
import { PaymentRequest } from './payment.types'

@Controller('payments')
export class PaymentsController {
  constructor(private paymentService: PaymentsService) {}

  @Post('initiate')
  async initiatePayment(@Body() request: PaymentRequest) {
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
}
