// Реквизиты для приёма денег. Экраны владельца (/owner/payouts) и клиента
// (/admin/payment-accounts) показывают один и тот же набор типов и полей,
// поэтому описание живёт здесь: пока оно было скопировано в обе страницы,
// они начали расходиться уже в первом же коммите (разные подписи статусов).

export interface PaymentAccount {
  id: string
  accountType: string
  bankName: string | null
  accountNumber: string | null
  bic: string | null
  inn: string | null
  phoneSbp: string | null
  paypalEmail: string | null
  cryptoAddress: string | null
  cryptoType: string | null
  cardLast4: string | null
  cardHolder: string | null
  isActive: boolean
  verificationStatus: string
  createdAt: string
}

export interface AccountField {
  key: keyof PaymentAccount & string
  label: string
  /** Как поле выглядит в таблице, если отличается от сырого значения. */
  format?: (value: string) => string
}

export interface AccountForm {
  type: string
  label: string
  icon: string
  fields: AccountField[]
}

export const ACCOUNT_FORMS: AccountForm[] = [
  {
    type: 'bank_account',
    label: 'Банковский счёт',
    icon: '🏦',
    fields: [
      { key: 'bankName', label: 'Банк' },
      { key: 'accountNumber', label: 'Номер счёта' },
      { key: 'bic', label: 'БИК' },
      { key: 'inn', label: 'ИНН' },
    ],
  },
  {
    type: 'card',
    label: 'Карта',
    icon: '💳',
    fields: [
      { key: 'cardLast4', label: 'Последние 4 цифры', format: (v) => `•••• ${v}` },
      { key: 'cardHolder', label: 'Держатель' },
    ],
  },
  { type: 'sbp', label: 'СБП', icon: '⚡', fields: [{ key: 'phoneSbp', label: 'Телефон (+7…)' }] },
  { type: 'paypal', label: 'PayPal', icon: '🌐', fields: [{ key: 'paypalEmail', label: 'Email' }] },
  {
    type: 'crypto',
    label: 'Криптовалюта',
    icon: '₿',
    fields: [
      { key: 'cryptoAddress', label: 'Адрес кошелька' },
      { key: 'cryptoType', label: 'Сеть (btc / eth / usdt)', format: (v) => v.toUpperCase() },
    ],
  },
]

export const verificationBadge: Record<string, string> = {
  verified: 'bg-emerald-500/10 text-emerald-700',
  pending: 'bg-amber-500/10 text-amber-700',
  unverified: 'bg-ledger-ink/10 text-ledger-ink/60',
  rejected: 'bg-danger/10 text-red-700',
}

export const verificationLabel: Record<string, string> = {
  verified: 'подтверждены',
  pending: 'на проверке',
  unverified: 'не проверены',
  rejected: 'отклонены',
}

export function formOf(accountType: string): AccountForm | undefined {
  return ACCOUNT_FORMS.find((f) => f.type === accountType)
}

/**
 * Человекочитаемая сводка. Поля берутся из того же описания, что и форма ввода,
 * поэтому спрошенное у клиента поле не может потеряться в таблице — раньше так
 * пропадали БИК и ИНН: форма их спрашивала, а сводка перечисляла поля заново
 * и про них не знала.
 */
export function describeAccount(a: PaymentAccount): string {
  const form = formOf(a.accountType)
  if (!form) return '—'
  const parts = form.fields
    .map((f) => {
      const value = a[f.key]
      if (typeof value !== 'string' || value === '') return null
      return f.format ? f.format(value) : value
    })
    .filter((v): v is string => v !== null)
  return parts.join(' · ') || '—'
}
