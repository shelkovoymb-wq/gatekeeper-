'use client'

import { useEffect, useState } from 'react'
import { usePayments } from '@/lib/hooks/usePayments'
import type { PaymentStatus, PaymentProvider } from '@/types/payment'
import { formatMoney, formatDate } from '@/lib/format'

const statusLabels: Record<PaymentStatus, { label: string; cls: string }> = {
  succeeded: { label: 'Проведён', cls: 'bg-emerald-500/10 text-emerald-700' },
  pending: { label: 'В ожидании', cls: 'bg-amber-500/10 text-amber-700' },
  failed: { label: 'Ошибка', cls: 'bg-red-500/10 text-red-700' },
  cancelled: { label: 'Отменён', cls: 'bg-ledger-ink/10 text-ledger-ink/50' },
  refunded: { label: 'Возврат', cls: 'bg-ledger-stamp/10 text-ledger-stamp' },
}

const providerLabels: Record<PaymentProvider, string> = {
  yookassa: 'ЮKassa',
  cloudpayments: 'CloudPayments',
  robokassa: 'Robokassa',
  prodamus: 'Prodamus',
  stars: 'Telegram Stars',
  direct: 'Прямой перевод',
  free: 'Бесплатно',
}

const statusFilters: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'succeeded', label: 'Проведённые' },
  { value: 'pending', label: 'В ожидании' },
  { value: 'refunded', label: 'Возвраты' },
  { value: 'failed', label: 'Ошибки' },
]

export default function PaymentsPage() {
  const { payments, loading, error, fetchPayments } = usePayments()
  const [status, setStatus] = useState('all')
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    fetchPayments({ status, dateRange: 'all' })
  }, [status, fetchPayments])

  // Прямой перевод банк платформе не подтверждает, поэтому «деньги пришли»
  // отмечает сам получатель — иначе платёж навсегда останется в ожидании и не
  // попадёт ни в оборот, ни в комиссию.
  const confirm = async (id: string) => {
    setBusy(id)
    setNote(null)
    try {
      const r = await fetch(`/api/payments/${id}/confirm`, { method: 'POST' }).then((x) => x.json())
      if (!r.success) setNote(r.error || 'Не удалось подтвердить платёж')
      else setNote('Платёж отмечен как полученный')
      await fetchPayments({ status, dateRange: 'all' })
    } catch (e) {
      setNote(String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <header className="mb-8">
        <h1 className="font-display text-2xl text-ledger-page md:text-3xl">Платежи</h1>
        <p className="mt-1 text-sm text-ledger-page/60">
          История транзакций по всем способам приёма. Прямые переводы отмечайте кнопкой
          «Деньги получены» — так они попадут в оборот.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        {statusFilters.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatus(f.value)}
            className={`rounded-sm px-4 py-1.5 text-sm font-medium transition-colors ${
              status === f.value
                ? 'bg-ledger-stamp text-ledger-page font-bold hover:brightness-110'
                : 'border border-ledger-page/20 text-ledger-page hover:bg-ledger-page/5'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {note && (
        <div className="mb-6 rounded-sm border border-ledger-page/20 bg-ledger-page/5 px-4 py-3 text-sm text-ledger-page/80">
          {note}
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-sm border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="h-64 animate-pulse rounded-sm bg-ledger-page/10" />
      ) : payments.length === 0 ? (
        <div className="rounded-sm border border-dashed border-ledger-page/20 p-12 text-center">
          <div className="mb-3 text-4xl">💳</div>
          <p className="text-ledger-page/70">Платежей пока нет</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-ledger-page/15">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-ledger-page/15 bg-ledger-cover font-ledger-mono text-xs uppercase tracking-wide text-ledger-brass">
                <th className="px-6 py-4 font-medium">Дата</th>
                <th className="px-6 py-4 font-medium">Сумма</th>
                <th className="px-6 py-4 font-medium">Провайдер</th>
                <th className="px-6 py-4 font-medium">Статус</th>
                <th className="px-6 py-4 font-medium">ID платежа</th>
                <th className="px-6 py-4 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ledger-ink/10 bg-ledger-page">
              {payments.map((p) => {
                const st = statusLabels[p.status] ?? {
                  label: p.status,
                  cls: 'bg-ledger-ink/10 text-ledger-ink/50',
                }
                return (
                  <tr key={p.id} className="transition-colors hover:bg-ledger-ink/5">
                    <td className="px-6 py-4 text-sm text-ledger-ink/55">
                      {formatDate(p.createdAt)}
                    </td>
                    <td className="px-6 py-4 font-bold text-ledger-ink">
                      {formatMoney(p.amount, p.currency)}
                    </td>
                    <td className="px-6 py-4 text-sm text-ledger-ink/60">
                      {providerLabels[p.provider] ?? p.provider}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-sm px-2.5 py-1 font-ledger-mono text-xs font-medium ${st.cls}`}
                      >
                        {st.label}
                      </span>
                      {p.confirmedBy === 'client' && (
                        <span
                          className="ml-2 rounded-sm bg-ledger-ink/10 px-2 py-1 font-ledger-mono text-xs text-ledger-ink/55"
                          title="Платёж закрыт отметкой получателя, а не ответом платёжной системы"
                        >
                          со слов
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-ledger-mono text-xs text-ledger-ink/45">
                      {p.id.slice(0, 8)}…
                    </td>
                    <td className="px-6 py-4">
                      {p.provider === 'direct' && p.status === 'pending' ? (
                        <button
                          onClick={() => confirm(p.id)}
                          disabled={busy === p.id}
                          className="rounded-sm bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-50"
                        >
                          {busy === p.id ? '…' : 'Деньги получены'}
                        </button>
                      ) : (
                        <span className="text-xs text-ledger-ink/30">—</span>
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
