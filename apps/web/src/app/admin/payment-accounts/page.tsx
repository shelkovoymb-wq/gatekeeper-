'use client'

import { useCallback, useEffect, useState } from 'react'
import { formatDate } from '@/lib/format'

interface PaymentAccount {
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

/** Поля под каждый тип реквизитов — набор тот же, что у владельца платформы. */
const ACCOUNT_FORMS: {
  type: string
  label: string
  icon: string
  fields: { key: string; label: string }[]
}[] = [
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
      { key: 'cardLast4', label: 'Последние 4 цифры' },
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
      { key: 'cryptoType', label: 'Сеть (btc / eth / usdt)' },
    ],
  },
]

const verificationBadge: Record<string, string> = {
  verified: 'bg-emerald-500/10 text-emerald-700',
  pending: 'bg-amber-500/10 text-amber-700',
  unverified: 'bg-ledger-ink/10 text-ledger-ink/60',
  rejected: 'bg-danger/10 text-red-700',
}

const verificationLabel: Record<string, string> = {
  verified: 'подтверждены',
  pending: 'на проверке',
  unverified: 'не проверены',
  rejected: 'отклонены',
}

function describeAccount(a: PaymentAccount): string {
  switch (a.accountType) {
    case 'bank_account':
      return [a.bankName, a.accountNumber].filter(Boolean).join(' · ') || '—'
    case 'card':
      return (
        [a.cardLast4 ? `•••• ${a.cardLast4}` : null, a.cardHolder].filter(Boolean).join(' · ') || '—'
      )
    case 'sbp':
      return a.phoneSbp || '—'
    case 'paypal':
      return a.paypalEmail || '—'
    case 'crypto':
      return [a.cryptoAddress, a.cryptoType?.toUpperCase()].filter(Boolean).join(' · ') || '—'
    default:
      return '—'
  }
}

export default function ClientPaymentAccountsPage() {
  const [accounts, setAccounts] = useState<PaymentAccount[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [formType, setFormType] = useState('bank_account')
  const [values, setValues] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setError(null)
    try {
      const r = await fetch('/api/payment-accounts').then((x) => x.json())
      if (r.success) setAccounts(r.data)
      else setError(r.error || 'Не удалось загрузить реквизиты')
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const activeForm = ACCOUNT_FORMS.find((f) => f.type === formType)!

  const addAccount = async () => {
    setBusy(true)
    setError(null)
    try {
      const payload: Record<string, string> = { accountType: formType }
      for (const f of activeForm.fields) {
        const v = values[f.key]?.trim()
        if (v) payload[f.key] = v
      }
      const r = await fetch('/api/payment-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then((x) => x.json())
      if (!r.success) setError(r.error || 'Не удалось добавить реквизиты')
      else setValues({})
      await load()
    } finally {
      setBusy(false)
    }
  }

  const deactivate = async (id: string) => {
    setBusy(true)
    try {
      await fetch(`/api/payment-accounts/${id}`, { method: 'DELETE' })
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <header className="mb-8">
        <h1 className="font-display text-2xl text-ledger-page md:text-3xl">Мои реквизиты</h1>
        <p className="mt-1 text-sm text-ledger-page/60">
          Куда подписчики отправляют прямые переводы за доступ к каналам
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-sm border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <section className="mb-8 rounded-sm bg-ledger-page p-6 text-ledger-ink shadow-[4px_6px_0_0_rgba(0,0,0,0.25)]">
        <h2 className="font-display text-lg">Добавить реквизиты</h2>
        <p className="mt-1 text-sm text-ledger-ink/55">
          Номер карты целиком не принимаем — только последние 4 цифры. Новые реквизиты уходят на
          проверку платформой; принимать переводы на них можно после подтверждения.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {ACCOUNT_FORMS.map((f) => (
            <button
              key={f.type}
              onClick={() => {
                setFormType(f.type)
                setValues({})
              }}
              className={`rounded-sm px-3 py-1.5 text-sm font-medium transition ${
                formType === f.type
                  ? 'bg-ledger-stamp text-ledger-page'
                  : 'border border-ledger-ink/15 text-ledger-ink hover:bg-ledger-ink/5'
              }`}
            >
              {f.icon} {f.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {activeForm.fields.map((f) => (
            <input
              key={f.key}
              placeholder={f.label}
              value={values[f.key] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              className="w-full rounded-sm border border-ledger-ink/15 bg-white/50 px-3 py-2 text-sm text-ledger-ink placeholder-ledger-ink/35 outline-none focus:border-ledger-stamp/60"
            />
          ))}
        </div>

        <button
          onClick={addAccount}
          disabled={busy}
          className="mt-4 rounded-sm bg-ledger-stamp px-5 py-2.5 text-sm font-bold text-ledger-page transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? 'Сохранение…' : 'Добавить'}
        </button>
      </section>

      <h2 className="mb-3 font-display text-lg text-ledger-page">Заведённые реквизиты</h2>
      {loading ? (
        <div className="h-40 animate-pulse rounded-sm bg-ledger-page/10" />
      ) : accounts.length === 0 ? (
        <p className="text-ledger-page/45">Реквизитов пока нет — добавь первые выше.</p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-ledger-page/15">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-ledger-page/15 bg-ledger-cover font-ledger-mono text-xs uppercase tracking-wide text-ledger-brass">
                <th className="px-5 py-3 font-medium">Тип</th>
                <th className="px-5 py-3 font-medium">Реквизиты</th>
                <th className="px-5 py-3 font-medium">Проверка</th>
                <th className="px-5 py-3 font-medium">Добавлены</th>
                <th className="px-5 py-3 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ledger-ink/10 bg-ledger-page">
              {accounts.map((a) => {
                const meta = ACCOUNT_FORMS.find((f) => f.type === a.accountType)
                return (
                  <tr
                    key={a.id}
                    className={`transition-colors hover:bg-ledger-ink/5 ${a.isActive ? '' : 'opacity-45'}`}
                  >
                    <td className="px-5 py-3 font-bold text-ledger-ink">
                      {meta ? `${meta.icon} ${meta.label}` : a.accountType}
                    </td>
                    <td className="px-5 py-3 font-ledger-mono text-ledger-ink/70">
                      {describeAccount(a)}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-sm px-2 py-1 font-ledger-mono text-xs font-medium ${
                          verificationBadge[a.verificationStatus] ?? 'bg-ledger-ink/10 text-ledger-ink/60'
                        }`}
                      >
                        {verificationLabel[a.verificationStatus] ?? a.verificationStatus}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-ledger-ink/60">{formatDate(a.createdAt)}</td>
                    <td className="px-5 py-3">
                      {!a.isActive ? (
                        <span className="text-xs text-ledger-ink/40">отключены</span>
                      ) : (
                        <button
                          onClick={() => deactivate(a.id)}
                          disabled={busy}
                          className="rounded-sm border border-ledger-ink/20 px-2.5 py-1 text-xs font-medium text-ledger-ink hover:bg-ledger-ink/5 disabled:opacity-50"
                        >
                          Отключить
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
