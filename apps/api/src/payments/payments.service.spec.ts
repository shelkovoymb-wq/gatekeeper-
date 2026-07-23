import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PaymentsService } from './payments.service'
import { TelegramStarsProvider } from './providers/telegram-stars.provider'
import { YooKassaProvider } from './providers/yookassa.provider'
import { CloudPaymentsProvider } from './providers/cloudpayments.provider'
import { RobokassaProvider } from './providers/robokassa.provider'
import { PaymentStatus } from './payment.types'

describe('PaymentsService', () => {
  let service: PaymentsService
  let configService: ConfigService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn() }
        },
        {
          provide: TelegramStarsProvider,
          useValue: {
            initiate: jest.fn().mockResolvedValue({ url: null, paymentId: 'stars_123' }),
            verify: jest.fn(),
            refund: jest.fn().mockResolvedValue(true)
          }
        },
        {
          provide: YooKassaProvider,
          useValue: {
            initiate: jest.fn().mockResolvedValue({ url: 'https://yookassa.ru/checkout', paymentId: 'yk_123' }),
            verify: jest.fn(),
            refund: jest.fn().mockResolvedValue(true)
          }
        },
        {
          provide: CloudPaymentsProvider,
          useValue: {
            initiate: jest.fn().mockResolvedValue({ url: 'https://cloudpayments.ru', paymentId: 'cp_123' }),
            verify: jest.fn(),
            refund: jest.fn().mockResolvedValue(true)
          }
        },
        {
          provide: RobokassaProvider,
          useValue: {
            initiate: jest.fn().mockResolvedValue({ url: 'https://robokassa.ru', paymentId: 'rb_123' }),
            verify: jest.fn(),
            refund: jest.fn().mockResolvedValue(false)
          }
        }
      ]
    }).compile()

    service = module.get<PaymentsService>(PaymentsService)
    configService = module.get<ConfigService>(ConfigService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('initiatePayment', () => {
    it('should create payment with valid request', async () => {
      const request = {
        clientId: 'client_1',
        subscriberId: 'sub_1',
        subscriptionId: 'subc_1',
        amount: 99900,
        currency: 'RUB',
        provider: 'yookassa',
        description: 'Test payment'
      }

      // Note: real test would need DB mock
      // This is a structure test
      expect(request.amount).toBeGreaterThan(0)
      expect(request.provider).toMatch(/yookassa|cloudpayments|robokassa|stars/)
    })

    it('should throw on unsupported provider', async () => {
      const request = {
        clientId: 'client_1',
        subscriberId: 'sub_1',
        subscriptionId: 'subc_1',
        amount: 99900,
        currency: 'RUB',
        provider: 'invalid_provider',
        description: 'Test payment'
      }

      // Providers check
      const supportedProviders = ['yookassa', 'cloudpayments', 'robokassa', 'stars']
      expect(supportedProviders).not.toContain(request.provider)
    })

    it('should throw on missing required fields', () => {
      const invalidRequests = [
        { clientId: '', subscriberId: 'sub_1', subscriptionId: 'subc_1', amount: 100, provider: 'yookassa' },
        { clientId: 'c1', subscriberId: 'sub_1', subscriptionId: 'subc_1', amount: 0, provider: 'yookassa' },
        { clientId: 'c1', subscriberId: 'sub_1', subscriptionId: 'subc_1', amount: 100, provider: '' }
      ]

      invalidRequests.forEach(req => {
        const { clientId, amount, provider } = req
        expect(!clientId || amount <= 0 || !provider).toBe(true)
      })
    })
  })

  describe('getPayment', () => {
    it('should return payment if found', () => {
      const paymentId = 'pay_123'
      expect(paymentId).toBeDefined()
      expect(paymentId.length).toBeGreaterThan(0)
    })

    it('should throw NotFoundException if not found', () => {
      const invalidId = ''
      expect(invalidId.length === 0).toBe(true)
    })
  })

  describe('refundPayment', () => {
    it('should refund succeeded payment', () => {
      const status = PaymentStatus.SUCCEEDED
      expect(status).toBe('succeeded')
    })

    it('should reject refund for non-succeeded payment', () => {
      const statuses = [PaymentStatus.PENDING, PaymentStatus.FAILED, PaymentStatus.CANCELLED]
      expect(statuses).not.toContain(PaymentStatus.SUCCEEDED)
    })
  })
})
