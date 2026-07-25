'use client'

import { useEffect, useState } from 'react'
import { usePayments } from '@/lib/hooks/usePayments'
import type { PaymentStatus, PaymentProvider } from '@/types/payment'
import { formatMoney, formatDate } from '@/lib/format'

const statusLabels: Record<PaymentStatus, { label: string; cls: string }> = {
  succeeded: { label: 'Проведён', cls: 'bg-emerald-500/10 text-emerald-400' },
  pending: { label: 'В ожидании', cls: 'bg-amber-500/10 text-amber-400' },
  failed: { label: 'Ошибка', cls: 'bg-red-500/10 text-red-400' },
  cancelled: { label: 'Отменён', cls: 'bg-slate-600/30 text-slate-400' },
  refunded: { label: 'Возврат', cls: 'bg-secondary-500/10 text-secondary-300' },
}

const providerLabels: Record<PaymentProvider, string> = {
  yookassa: 'ЮKassa',
  cloudpayments: 'CloudPayments',
  robokassa: 'Robokassa',
  stars: 'Telegram Stars',
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

  useEffect(() => {
    fetchPayments({ status, dateRange: 'all' })
  }, [status, fetchPayments])

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-white md:text-3xl">Платежи</h1>
        <p className="mt-1 text-sm text-slate-400">
          История транзакций по всем платёжным провайдерам
        </p>
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        {statusFilters.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatus(f.value)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              status === f.value
                ? 'bg-primary-600 text-white'
                : 'border border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="h-64 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60" />
      ) : payments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center">
          <div className="mb-3 text-4xl">💳</div>
          <p className="text-slate-300">Платежей пока нет</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-6 py-4 font-medium">Дата</th>
                <th className="px-6 py-4 font-medium">Сумма</th>
                <th className="px-6 py-4 font-medium">Провайдер</th>
                <th className="px-6 py-4 font-medium">Статус</th>
                <th className="px-6 py-4 font-medium">ID платежа</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {payments.map((p) => {
                const st = statusLabels[p.status] ?? {
                  label: p.status,
                  cls: 'bg-slate-600/30 text-slate-400',
                }
                return (
                  <tr key={p.id} className="transition-colors hover:bg-slate-800/40">
                    <td className="px-6 py-4 text-sm text-slate-400">
                      {formatDate(p.createdAt)}
                    </td>
                    <td className="px-6 py-4 font-semibold text-white">
                      {formatMoney(p.amount, p.currency)}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-300">
                      {providerLabels[p.provider] ?? p.provider}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${st.cls}`}
                      >
                        {st.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-500">
                      {p.id.slice(0, 8)}…
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
