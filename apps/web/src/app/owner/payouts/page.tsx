'use client'

import { useCallback, useEffect, useState } from 'react'
import { StatsTile } from '@/components/StatsTile'
import { formatMoney, formatNumber, formatDate } from '@/lib/format'
import {
  ACCOUNT_FORMS,
  describeAccount,
  formOf,
  verificationBadge,
  verificationLabel,
  type PaymentAccount,
} from '@/lib/payment-accounts'

interface Payout {
  id: string
  accountId: string
  invoiceIds: string[]
  amount: number
  currency: string
  status: string
  errorMessage: string | null
  createdAt: string
  completedAt: string | null
}

interface Stats {
  pending: number
  processing: number
  completed: number
  failed: number
  totalAmount: number
}

const payoutBadge: Record<string, string> = {
  completed: 'bg-emerald-500/10 text-emerald-700',
  processing: 'bg-sky-500/10 text-sky-700',
  pending: 'bg-amber-500/10 text-amber-700',
  failed: 'bg-danger/10 text-red-700',
  cancelled: 'bg-ledger-ink/10 text-ledger-ink/50',
}

export default function OwnerPayoutsPage() {
  const [accounts, setAccounts] = useState<PaymentAccount[]>([])
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [formType, setFormType] = useState('bank_account')
  const [values, setValues] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setError(null)
    try {
      const [a, p, s] = await Promise.all([
        fetch('/api/platform/payment-accounts').then((r) => r.json()),
        fetch('/api/platform/payouts').then((r) => r.json()),
        fetch('/api/platform/payouts-stats').then((r) => r.json()),
      ])
      if (a.success) setAccounts(a.data)
      else setError(a.error || 'Не удалось загрузить реквизиты')
      if (p.success) setPayouts(p.data)
      if (s.success) setStats(s.data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const activeForm = ACCOUNT_FORMS.find((f) => f.type === formType) ?? ACCOUNT_FORMS[0]

  const addAccount = async () => {
    setBusy(true)
    setError(null)
    try {
      const payload: Record<string, string> = { accountType: formType }
      for (const f of activeForm.fields) {
        const v = values[f.key]?.trim()
        if (v) payload[f.key] = v
      }
      const r = await fetch('/api/platform/payment-accounts', {
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

  const verify = async (id: string) => {
    setBusy(true)
    try {
      await fetch(`/api/platform/payment-accounts/${id}/verify`, { method: 'POST' })
      await load()
    } finally {
      setBusy(false)
    }
  }

  const deactivate = async (id: string) => {
    setBusy(true)
    try {
      await fetch(`/api/platform/payment-accounts/${id}`, { method: 'DELETE' })
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <header className="mb-8">
        <h1 className="font-display text-2xl text-ledger-page md:text-3xl">Реквизиты и выплаты</h1>
        <p className="mt-1 text-sm text-ledger-page/60">
          Куда платформа перечисляет заработанное: абонплата тарифов и комиссия с оборота
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-sm border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {stats && (
        <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <StatsTile label="В очереди" value={formatNumber(stats.pending)} icon="⏳" accent="accent" />
          <StatsTile label="Отправляются" value={formatNumber(stats.processing)} icon="🔄" accent="secondary" />
          <StatsTile label="Зачислено" value={formatNumber(stats.completed)} icon="✅" accent="success" />
          <StatsTile label="Выплачено всего" value={formatMoney(stats.totalAmount)} icon="Σ" accent="primary" />
        </div>
      )}

      <section className="mb-8 rounded-sm bg-ledger-page p-6 text-ledger-ink shadow-[4px_6px_0_0_rgba(0,0,0,0.25)]">
        <h2 className="font-display text-lg">Добавить реквизиты</h2>
        <p className="mt-1 text-sm text-ledger-ink/55">
          Номер карты целиком не хранится — только последние 4 цифры.
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

      <h2 className="mb-3 font-display text-lg text-ledger-page">Мои реквизиты</h2>
      {loading ? (
        <div className="mb-8 h-40 animate-pulse rounded-sm bg-ledger-page/10" />
      ) : accounts.length === 0 ? (
        <p className="mb-8 text-ledger-page/45">Реквизитов пока нет — добавь первые выше.</p>
      ) : (
        <div className="mb-8 overflow-x-auto rounded-sm border border-ledger-page/15">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-ledger-page/15 bg-ledger-cover font-ledger-mono text-xs uppercase tracking-wide text-ledger-brass">
                <th className="px-5 py-3 font-medium">Тип</th>
                <th className="px-5 py-3 font-medium">Реквизиты</th>
                <th className="px-5 py-3 font-medium">Проверка</th>
                <th className="px-5 py-3 font-medium">Добавлен</th>
                <th className="px-5 py-3 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ledger-ink/10 bg-ledger-page">
              {accounts.map((a) => {
                const meta = formOf(a.accountType)
                return (
                  <tr key={a.id} className={`transition-colors hover:bg-ledger-ink/5 ${a.isActive ? '' : 'opacity-45'}`}>
                    <td className="px-5 py-3 font-bold text-ledger-ink">
                      {meta ? `${meta.icon} ${meta.label}` : a.accountType}
                    </td>
                    <td className="px-5 py-3 font-ledger-mono text-ledger-ink/70">{describeAccount(a)}</td>
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
                        <span className="text-xs text-ledger-ink/40">отключён</span>
                      ) : (
                        <div className="flex gap-2">
                          {a.verificationStatus !== 'verified' && (
                            <button
                              onClick={() => verify(a.id)}
                              disabled={busy}
                              className="rounded-sm bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-50"
                            >
                              Подтвердить
                            </button>
                          )}
                          <button
                            onClick={() => deactivate(a.id)}
                            disabled={busy}
                            className="rounded-sm border border-ledger-ink/20 px-2.5 py-1 text-xs font-medium text-ledger-ink hover:bg-ledger-ink/5 disabled:opacity-50"
                          >
                            Отключить
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mb-3 font-display text-lg text-ledger-page">История выплат</h2>
      {loading ? (
        <div className="h-40 animate-pulse rounded-sm bg-ledger-page/10" />
      ) : payouts.length === 0 ? (
        <p className="text-ledger-page/45">Выплат пока не было.</p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-ledger-page/15">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-ledger-page/15 bg-ledger-cover font-ledger-mono text-xs uppercase tracking-wide text-ledger-brass">
                <th className="px-5 py-3 font-medium">Создана</th>
                <th className="px-5 py-3 text-right font-medium">Сумма</th>
                <th className="px-5 py-3 font-medium">Счетов</th>
                <th className="px-5 py-3 font-medium">Статус</th>
                <th className="px-5 py-3 font-medium">Зачислена</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ledger-ink/10 bg-ledger-page">
              {payouts.map((p) => (
                <tr key={p.id} className="transition-colors hover:bg-ledger-ink/5">
                  <td className="px-5 py-3 text-ledger-ink/60">{formatDate(p.createdAt)}</td>
                  <td className="px-5 py-3 text-right font-bold text-ledger-ink">{formatMoney(p.amount)}</td>
                  <td className="px-5 py-3 text-ledger-ink/60">{p.invoiceIds.length}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-sm px-2 py-1 font-ledger-mono text-xs font-medium ${
                        payoutBadge[p.status] ?? 'bg-ledger-ink/10 text-ledger-ink/60'
                      }`}
                    >
                      {p.status}
                    </span>
                    {p.errorMessage && (
                      <span className="ml-2 text-xs text-red-700">{p.errorMessage}</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-ledger-ink/60">
                    {p.completedAt ? formatDate(p.completedAt) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
