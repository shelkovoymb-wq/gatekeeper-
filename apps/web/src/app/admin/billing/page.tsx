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
  paid: 'bg-emerald-600/20 text-emerald-300',
  pending: 'bg-amber-600/20 text-amber-300',
  overdue: 'bg-danger/20 text-red-300',
  void: 'bg-slate-700/60 text-slate-400',
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
        <h1 className="text-2xl font-bold text-white md:text-3xl">Оплата платформы</h1>
        <p className="mt-1 text-sm text-slate-400">
          Ваш тариф на платформе, счета и задолженность
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="h-40 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60" />
      ) : (
        <>
          {plan && (
            <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 lg:col-span-2">
                <p className="text-sm text-slate-400">Текущий тариф</p>
                <div className="mt-1 flex items-baseline gap-3">
                  <span className="text-2xl font-bold text-white">{plan.name}</span>
                  <span className="rounded-lg bg-slate-800 px-2 py-0.5 text-xs text-slate-400">{plan.status}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-sm text-slate-300">
                  <span>Абонплата: <b className="text-white">{plan.priceMonth > 0 ? formatMoney(plan.priceMonth, plan.currency) + ' / мес' : 'бесплатно'}</b></span>
                  <span>Комиссия платформы: <b className="text-white">{plan.commissionPct}%</b></span>
                </div>
              </div>
              <div className={`rounded-2xl border p-6 ${dueTotal > 0 ? 'border-amber-600/40 bg-amber-600/10' : 'border-slate-800 bg-slate-900/60'}`}>
                <p className="text-sm text-slate-400">К оплате</p>
                <div className={`mt-2 text-3xl font-bold ${dueTotal > 0 ? 'text-amber-300' : 'text-emerald-400'}`}>
                  {formatMoney(dueTotal)}
                </div>
                <p className="mt-1 text-xs text-slate-500">{dueTotal > 0 ? 'Есть неоплаченные счета' : 'Задолженности нет'}</p>
              </div>
            </div>
          )}

          <h2 className="mb-3 mt-8 text-lg font-semibold text-white">Тарифы платформы</h2>
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {plans.map((p) => {
              const current = p.code === plan?.code
              return (
                <div key={p.code} className={`rounded-2xl border p-5 ${current ? 'border-primary-500/60 bg-primary-600/10' : 'border-slate-800 bg-slate-900/60'}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-white">{p.name}</h3>
                    {current && <span className="text-xs text-primary-300">текущий</span>}
                  </div>
                  <div className="mt-2 text-xl font-bold text-white">
                    {p.priceMonth > 0 ? formatMoney(p.priceMonth, p.currency) : 'Бесплатно'}
                    {p.priceMonth > 0 && <span className="text-sm font-medium text-slate-400"> / мес</span>}
                  </div>
                  <p className="mt-1 text-sm text-slate-400">Комиссия {p.commissionPct}%</p>
                  <button
                    onClick={() => changePlan(p.code)}
                    disabled={busy || current}
                    className="mt-4 w-full rounded-xl border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800 disabled:opacity-40"
                  >
                    {current ? 'Активен' : 'Перейти'}
                  </button>
                </div>
              )
            })}
          </div>

          <h2 className="mb-3 text-lg font-semibold text-white">Счета ({formatNumber(invoices.length)})</h2>
          {invoices.length === 0 ? (
            <p className="text-slate-500">Счетов пока нет.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-3 font-medium">Период</th>
                    <th className="px-5 py-3 text-right font-medium">Сумма</th>
                    <th className="px-5 py-3 font-medium">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30">
                      <td className="px-5 py-3 text-slate-300">{inv.periodStart} — {inv.periodEnd}</td>
                      <td className="px-5 py-3 text-right font-semibold text-white">{formatMoney(inv.amount)}</td>
                      <td className="px-5 py-3">
                        <span className={`rounded-lg px-2 py-1 text-xs font-medium ${statusBadge[inv.status] ?? 'bg-slate-700/60 text-slate-300'}`}>
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
