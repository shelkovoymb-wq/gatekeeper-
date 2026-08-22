// Платёжные системы, которые клиент подключает ключами. Вторая половина
// «способов получения денег» — первая в payment-accounts.ts (свои реквизиты).

export interface PayCfg {
  provider: string
  configured: boolean
  isActive: boolean
  needsKeys: boolean
}

export interface ProviderMeta {
  label: string
  icon: string
  fields: { key: string; label: string }[]
}

export const providerMeta: Record<string, ProviderMeta> = {
  yookassa: {
    label: 'ЮKassa',
    icon: '🟣',
    fields: [
      { key: 'shopId', label: 'shopId' },
      { key: 'secretKey', label: 'Секретный ключ' },
    ],
  },
  cloudpayments: {
    label: 'CloudPayments',
    icon: '🔵',
    fields: [
      { key: 'publicId', label: 'Public ID' },
      { key: 'apiSecret', label: 'API Secret' },
    ],
  },
  robokassa: {
    label: 'Robokassa',
    icon: '🟢',
    fields: [
      { key: 'merchantLogin', label: 'Логин магазина' },
      { key: 'password1', label: 'Пароль #1' },
      { key: 'password2', label: 'Пароль #2' },
    ],
  },
  prodamus: {
    label: 'Prodamus',
    icon: '🟠',
    fields: [
      { key: 'apiKey', label: 'API-ключ' },
      { key: 'secretKey', label: 'Секретный ключ' },
    ],
  },
  stars: { label: 'Telegram Stars', icon: '⭐', fields: [] },
}
