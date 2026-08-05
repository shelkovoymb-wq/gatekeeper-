'use client'

import { useCallback, useEffect, useState } from 'react'
import { formatMoney, formatNumber } from '@/lib/format'

interface Plan {
  code: string
  name: string
  priceMonth: number
  commissionPct: number
  currency: string
  status: string
  paidUntil: string | null
}
interface Invoice {
  id: string
  periodStart: string
  periodEnd: string
  amount: number
  status: string
  details: Record<string, unknown>
}
interface AvailablePlan {
  code: string
  name: string
  priceMonth: number
  commissionPct: number
  currency: string
}

const statusBadge: Record<string, string> = {
  paid: 'bg-emerald-600/20 text-emerald-700',
  pending: 'bg-amber-600/20 text-amber-700',
  overdue: 'bg-danger/20 text-red-700',
  void: 'bg-ledger-ink/10 text-ledger-ink/50',
}

export default function ClientBillingPage() {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [dueTotal, setDueTotal] = useState(0)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [plans, setPlans] = useState<AvailablePlan[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [b, p] = await Promise.all([
        fetch('/api/billing').then((r) => r.json()),
        fetch('/api/billing/plans').then((r) => r.json()),
      ])
      if (b.success) {
        setPlan(b.data.plan)
        setDueTotal(b.data.dueTotal)
        setInvoices(b.data.invoices)
      } else setError(b.error || 'Ошибка загрузки')
      if (p.success) setPlans(p.data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const changePlan = async (code: string) => {
    if (code === plan?.code) return
    setBusy(true)
    setError(null)
    try {
      const r = await fetch('/api/billing/plan', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      }).then((x) => x.json())
      if (!r.success) setError(r.error || 'Не удалось сменить тариф')
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <header className="mb-8">
        <h1 className="font-display text-2xl text-ledger-page md:text-3xl">Оплата платформы</h1>
        <p className="mt-1 text-sm text-ledger-page/60">
          Ваш тариф на платформе, счета и задолженность
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-sm border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="h-40 animate-pulse rounded-sm bg-ledger-page/10" />
      ) : (
        <>
          {plan && (
            <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
              <div className="rounded-sm bg-ledger-page p-6 text-ledger-ink shadow-[4px_6px_0_0_rgba(0,0,0,0.25)] lg:col-span-2">
                <p className="text-sm text-ledger-ink/55">Текущий тариф</p>
                <div className="mt-1 flex items-baseline gap-3">
                  <span className="text-2xl font-bold text-ledger-ink">{plan.name}</span>
                  <span className="rounded-sm bg-ledger-ink/10 px-2 py-0.5 text-xs text-ledger-ink/50">{plan.status}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-sm text-ledger-ink/60">
                  <span>Абонплата: <b className="text-ledger-ink">{plan.priceMonth > 0 ? formatMoney(plan.priceMonth, plan.currency) + ' / мес' : 'бесплатно'}</b></span>
                  <span>Комиссия платформы: <b className="text-ledger-ink">{plan.commissionPct}%</b></span>
                </div>
              </div>
              <div className={`rounded-sm p-6 text-ledger-ink shadow-[4px_6px_0_0_rgba(0,0,0,0.25)] ${dueTotal > 0 ? 'border border-amber-600/40 bg-ledger-page' : 'bg-ledger-page'}`}>
                <p className="text-sm text-ledger-ink/55">К оплате</p>
                <div className={`mt-2 text-3xl font-bold ${dueTotal > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {formatMoney(dueTotal)}
                </div>
                <p className="mt-1 text-xs text-ledger-ink/45">{dueTotal > 0 ? 'Есть неоплаченные счета' : 'Задолженности нет'}</p>
              </div>
            </div>
          )}

          <h2 className="mb-3 mt-8 text-lg font-bold text-ledger-page">Тарифы платформы</h2>
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {plans.map((p) => {
              const current = p.code === plan?.code
              return (
                <div key={p.code} className={`rounded-sm p-5 text-ledger-ink shadow-[4px_6px_0_0_rgba(0,0,0,0.25)] ${current ? 'border border-ledger-stamp/60 bg-ledger-page' : 'bg-ledger-page'}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-ledger-ink">{p.name}</h3>
                    {current && <span className="text-xs text-ledger-stamp">текущий</span>}
                  </div>
                  <div className="mt-2 text-xl font-bold text-ledger-ink">
                    {p.priceMonth > 0 ? formatMoney(p.priceMonth, p.currency) : 'Бесплатно'}
                    {p.priceMonth > 0 && <span className="text-sm font-medium text-ledger-ink/55"> / мес</span>}
                  </div>
                  <p className="mt-1 text-sm text-ledger-ink/55">Комиссия {p.commissionPct}%</p>
                  <button
                    onClick={() => changePlan(p.code)}
                    disabled={busy || current}
                    className="mt-4 w-full rounded-sm border border-ledger-ink/20 px-3 py-2 text-sm font-medium text-ledger-ink transition hover:bg-ledger-ink/5 disabled:opacity-40"
                  >
                    {current ? 'Активен' : 'Перейти'}
                  </button>
                </div>
              )
            })}
          </div>

          <h2 className="mb-3 text-lg font-bold text-ledger-page">Счета ({formatNumber(invoices.length)})</h2>
          {invoices.length === 0 ? (
            <p className="text-ledger-page/45">Счетов пока нет.</p>
          ) : (
            <div className="overflow-x-auto rounded-sm border border-ledger-page/15">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-ledger-page/15 bg-ledger-cover text-left font-ledger-mono text-xs uppercase tracking-wide text-ledger-brass">
                    <th className="px-5 py-3 font-medium">Период</th>
                    <th className="px-5 py-3 text-right font-medium">Сумма</th>
                    <th className="px-5 py-3 font-medium">Статус</th>
                  </tr>
                </thead>
                <tbody className="bg-ledger-page">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-ledger-ink/10 last:border-0 hover:bg-ledger-ink/5">
                      <td className="px-5 py-3 text-ledger-ink/60">{inv.periodStart} — {inv.periodEnd}</td>
                      <td className="px-5 py-3 text-right font-bold text-ledger-ink">{formatMoney(inv.amount)}</td>
                      <td className="px-5 py-3">
                        <span className={`rounded-sm px-2 py-1 font-ledger-mono text-xs font-medium ${statusBadge[inv.status] ?? 'bg-ledger-ink/10 text-ledger-ink/60'}`}>
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
