'use client'

import { useCallback, useEffect, useState } from 'react'
import { formatDate } from '@/lib/format'
import { formOf } from '@/lib/payment-accounts'

interface ClientAccount {
  id: string
  clientId: string
  clientName: string
  accountType: string
  bankName: string | null
  accountNumber: string | null
  cardLast4: string | null
  cardHolder: string | null
  phoneSbp: string | null
  paypalEmail: string | null
  cryptoAddress: string | null
  cryptoType: string | null
  isActive: boolean
  createdAt: string
}

function describe(a: ClientAccount): string {
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

/**
 * Реквизиты клиентов — контроль по факту, а не разрешительный.
 *
 * Реквизиты работают сразу, как клиент их завёл: деньги идут ему же, и держать
 * чужие переводы заблокированными до ручного одобрения смысла нет. Здесь видно,
 * кто и куда принимает, и любые реквизиты можно выключить — после этого платёж
 * по ним инициировать нельзя.
 */
export default function ClientAccountsPage() {
  const [rows, setRows] = useState<ClientAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/platform/client-payment-accounts').then((x) => x.json())
      if (r.success) setRows(r.data)
      else setError(r.error || 'Не удалось загрузить реквизиты клиентов')
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const toggle = async (id: string, isActive: boolean) => {
    setBusy(id)
    setError(null)
    try {
      const r = await fetch(`/api/platform/client-payment-accounts/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      }).then((x) => x.json())
      if (!r.success) setError(r.error || 'Не удалось изменить реквизиты')
      await load()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(null)
    }
  }

  const activeCount = rows.filter((r) => r.isActive).length

  return (
    <div>
      <header className="mb-8">
        <h1 className="font-display text-2xl text-ledger-page md:text-3xl">Реквизиты клиентов</h1>
        <p className="mt-1 text-sm text-ledger-page/60">
          Куда клиенты принимают прямые переводы от подписчиков. Работают сразу после добавления;
          выключенные реквизиты принимать платежи не могут.
          {rows.length > 0 && ` Активных: ${activeCount} из ${rows.length}.`}
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-sm border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="h-64 animate-pulse rounded-sm bg-ledger-page/10" />
      ) : rows.length === 0 ? (
        <div className="rounded-sm border border-dashed border-ledger-page/20 p-12 text-center">
          <div className="mb-3 text-4xl">💰</div>
          <p className="text-ledger-page/70">Клиенты пока не заводили реквизиты</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-ledger-page/15">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-ledger-page/15 bg-ledger-cover font-ledger-mono text-xs uppercase tracking-wide text-ledger-brass">
                <th className="px-5 py-3 font-medium">Клиент</th>
                <th className="px-5 py-3 font-medium">Тип</th>
                <th className="px-5 py-3 font-medium">Реквизиты</th>
                <th className="px-5 py-3 font-medium">Состояние</th>
                <th className="px-5 py-3 font-medium">Добавлены</th>
                <th className="px-5 py-3 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ledger-ink/10 bg-ledger-page">
              {rows.map((a) => {
                const meta = formOf(a.accountType)
                return (
                  <tr
                    key={a.id}
                    className={`transition-colors hover:bg-ledger-ink/5 ${a.isActive ? '' : 'opacity-50'}`}
                  >
                    <td className="px-5 py-3 font-bold text-ledger-ink">{a.clientName}</td>
                    <td className="px-5 py-3 text-ledger-ink/70">
                      {meta ? `${meta.icon} ${meta.label}` : a.accountType}
                    </td>
                    <td className="px-5 py-3 font-ledger-mono text-ledger-ink/70">{describe(a)}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-sm px-2 py-1 font-ledger-mono text-xs font-medium ${
                          a.isActive
                            ? 'bg-emerald-500/10 text-emerald-700'
                            : 'bg-ledger-ink/10 text-ledger-ink/50'
                        }`}
                      >
                        {a.isActive ? 'принимает' : 'выключены'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-ledger-ink/60">{formatDate(a.createdAt)}</td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => toggle(a.id, !a.isActive)}
                        disabled={busy === a.id}
                        className={`rounded-sm px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${
                          a.isActive
                            ? 'border border-ledger-ink/20 text-ledger-ink hover:bg-ledger-ink/5'
                            : 'bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20'
                        }`}
                      >
                        {busy === a.id ? '…' : a.isActive ? 'Выключить' : 'Включить'}
                      </button>
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
