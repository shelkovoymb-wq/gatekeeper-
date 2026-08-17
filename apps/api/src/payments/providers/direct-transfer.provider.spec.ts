import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { DirectTransferProvider } from './direct-transfer.provider.js';
import { PaymentStatus } from '../payment.types.js';

const SECRET = 'секрет-прямых-переводов';

function signed(payload: Record<string, unknown>, secret = SECRET) {
  const rawBody = Buffer.from(JSON.stringify(payload));
  return {
    body: payload,
    rawBody,
    headers: {
      'x-gatekeeper-signature': createHmac('sha256', secret).update(rawBody).digest('hex'),
    },
  };
}

const payload = {
  payment_id: 'dir_00000000-0000-4000-8000-000000000000',
  status: 'success',
  amount: 1500,
  currency: 'RUB',
};

/**
 * `/payments/webhook/` — единственный путь API, проброшенный в интернет, а
 * успешный вебхук открывает подписчику доступ. Поэтому здесь проверяется
 * ровно одно: без верной подписи подтверждение не проходит.
 */
describe('DirectTransferProvider — подтверждение платежа', () => {
  let provider: DirectTransferProvider;

  beforeEach(() => {
    provider = new DirectTransferProvider({} as never);
    process.env.DIRECT_WEBHOOK_SECRET = SECRET;
  });

  afterEach(() => {
    delete process.env.DIRECT_WEBHOOK_SECRET;
    vi.unstubAllEnvs();
  });

  it('принимает подписанное подтверждение', async () => {
    const webhook = await provider.verify(signed(payload));

    expect(webhook.provider).toBe('direct');
    expect(webhook.providerPaymentId).toBe(payload.payment_id);
    expect(webhook.status).toBe(PaymentStatus.SUCCEEDED);
    expect(webhook.amount).toBe(150000);
  });

  it('отвергает подтверждение без подписи', async () => {
    await expect(
      provider.verify({ body: payload, rawBody: Buffer.from(JSON.stringify(payload)), headers: {} }),
    ).rejects.toThrow(/signature/i);
  });

  it('отвергает подпись, посчитанную на чужом секрете', async () => {
    await expect(provider.verify(signed(payload, 'не-тот-секрет'))).rejects.toThrow(/mismatch/i);
  });

  it('отвергает подпись, не совпадающую с телом (подмена суммы и статуса)', async () => {
    const original = signed({ ...payload, status: 'pending', amount: 1 });
    const tampered = { ...original, body: payload, rawBody: Buffer.from(JSON.stringify(payload)) };

    await expect(provider.verify(tampered)).rejects.toThrow(/mismatch/i);
  });

  it('без настроенного секрета не принимает ничего', async () => {
    delete process.env.DIRECT_WEBHOOK_SECRET;

    await expect(provider.verify(signed(payload))).rejects.toThrow(/DIRECT_WEBHOOK_SECRET/);
  });

  it('не принимает подтверждение без rawBody', async () => {
    await expect(
      provider.verify({ body: payload, headers: { 'x-gatekeeper-signature': 'deadbeef' } }),
    ).rejects.toThrow(/raw body|signature/i);
  });

  it.each([
    ['success', PaymentStatus.SUCCEEDED],
    ['completed', PaymentStatus.SUCCEEDED],
    ['confirmed', PaymentStatus.SUCCEEDED],
    ['failed', PaymentStatus.FAILED],
    ['cancelled', PaymentStatus.CANCELLED],
    ['pending', PaymentStatus.PENDING],
  ])('переводит статус %s', async (raw, expected) => {
    const webhook = await provider.verify(signed({ ...payload, status: raw }));
    expect(webhook.status).toBe(expected);
  });

  it('неизвестный статус не считает успехом', async () => {
    const webhook = await provider.verify(signed({ ...payload, status: 'что-то-новое' }));
    expect(webhook.status).toBe(PaymentStatus.PENDING);
  });

  it('требует payment_id или order_id', async () => {
    const { payment_id: _omit, ...withoutId } = payload;

    await expect(provider.verify(signed(withoutId))).rejects.toThrow(/payment_id or order_id/);
  });
});
