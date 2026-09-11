'use client'

import { useCallback, useEffect, useState } from 'react'

interface DirectMember {
  id: string
  status: 'pending' | 'declared' | 'dismissed'
  periodMonth: string
  detectedAt: string
  leftAt: string | null
  declaredAmount: number | null
  currency: string
  note: string | null
  dismissReason: string | null
  billedAt: string | null
  billedBase: number | null
  planId: string | null
  channelId: string
  channelTitle: string
  tgUserId: number
  username: string | null
  firstName: string | null
  fallbackPrice: number
}

interface Plan {
  id: string
  name: string
  price: number
}

const statusLabel: Record<DirectMember['status'], { text: string; tone: string }> = {
  pending: { text: 'Не оформлен', tone: 'bg-amber-500/15 text-amber-700' },
  declared: { text: 'Оформлен', tone: 'bg-emerald-500/15 text-emerald-700' },
  dismissed: { text: 'Не продажа', tone: 'bg-ledger-ink/10 text-ledger-ink/60' },
}

/**
 * Участники, которых владелец канала завёл сам, минуя платформу.
 *
 * Платформа таким входам не мешает — деньги клиента, доступ его. Но комиссию
 * берёт ту же, что и с платежей, прошедших через неё, поэтому каждый такой
 * вход надо оформить: указать тариф и сколько получено. Неоформленные уходят
 * в счёт по цене тарифа канала.
 */
export default function DirectMembersPage() {
  const [rows, setRows] = useState<DirectMember[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [editing, setEditing] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [planId, setPlanId] = useState('')

  const load = useCallback(async () => {
    try {
      const [d, p] = await Promise.all([
        fetch('/api/direct-members').then((r) => r.json()),
        fetch('/api/tariffs').then((r) => r.json()),
      ])
      setRows(Array.isArray(d?.data) ? d.data : [])
      setPlans(Array.isArray(p?.data) ? p.data : [])
      setError(null)
    } catch {
      setError('Не удалось загрузить список')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const send = async (id: string, action: 'declare' | 'dismiss', body: unknown) => {
    setBusy(true)
    setError(null)
    try {
      const r = await fetch(`/api/direct-members/${id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok || !d.success) throw new Error(d.error || 'Ошибка')
      setEditing(null)
      setAmount('')
      setPlanId('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  const dismiss = (id: string) => {
    const reason = prompt('Почему это не продажа? (например: мой редактор)')
    if (!reason?.trim()) return
    send(id, 'dismiss', { reason })
  }

  const startEdit = (m: DirectMember) => {
    setEditing(m.id)
    setPlanId(m.planId ?? '')
    setAmount(m.declaredAmount != null ? String(m.declaredAmount) : '')
  }

  if (loading) return <div className="h-40 animate-pulse rounded-sm bg-ledger-page/10" />

  const pending = rows.filter((r) => r.status === 'pending').length
  const willBill = rows
    .filter((r) => r.status !== 'dismissed' && !r.billedAt)
    .reduce(
      (sum, r) => sum + (r.status === 'declared' && r.declaredAmount != null ? r.declaredAmount : r.fallbackPrice),
      0,
    )

  return (
    <div>
      <header className="mb-8">
        <h1 className="font-display text-2xl text-ledger-page md:text-3xl">Добавлены вручную</h1>
        <p className="mt-1 text-sm text-ledger-page/60">
          Участники, которых вы завели в канал сами. Деньги ваши — комиссия платформы такая же,
          как с платежей через неё
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-sm border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile label="Всего за период" value={String(rows.length)} />
        <Tile label="Ждут оформления" value={String(pending)} accent={pending > 0} />
        <Tile label="База начисления" value={`${willBill.toLocaleString('ru-RU')} ₽`} />
      </div>

      {pending > 0 && (
        <p className="mb-6 rounded-sm border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Неоформленные пойдут в счёт по цене тарифа канала. Укажите, сколько вы получили на самом
          деле, — счёт посчитается по вашей сумме.
        </p>
      )}

      {rows.length === 0 ? (
        <div className="rounded-sm border border-dashed border-ledger-page/20 p-12 text-center">
          <div className="mb-3 text-4xl">👤</div>
          <p className="text-ledger-page/70">Таких участников нет</p>
          <p className="mt-1 text-sm text-ledger-page/45">
            Здесь появятся все, кто попал в канал без подписки через платформу
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((m) => (
            <article
              key={m.id}
              className="rounded-sm bg-ledger-page p-5 text-ledger-ink shadow-[4px_6px_0_0_rgba(0,0,0,0.25)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold">
                    {m.firstName || 'Без имени'}{' '}
                    {m.username && <span className="text-ledger-ink/50">@{m.username}</span>}
                  </p>
                  <p className="font-ledger-mono text-xs text-ledger-ink/50">
                    id {m.tgUserId} · {m.channelTitle} · замечен{' '}
                    {new Date(m.detectedAt).toLocaleString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {m.leftAt && ' · вышел'}
                  </p>
                </div>
                <span
                  className={`rounded-sm px-2 py-0.5 text-xs font-bold ${statusLabel[m.status].tone}`}
                >
                  {statusLabel[m.status].text}
                </span>
              </div>

              <p className="mt-2 text-sm text-ledger-ink/70">
                {m.status === 'declared' && m.declaredAmount != null
                  ? `Получено напрямую: ${m.declaredAmount.toLocaleString('ru-RU')} ₽ (с ваших слов)`
                  : m.status === 'dismissed'
                    ? `Не продажа: ${m.dismissReason}`
                    : `В счёт пойдёт по цене тарифа: ${m.fallbackPrice.toLocaleString('ru-RU')} ₽`}
              </p>

              {m.billedAt && (
                <p className="mt-1 text-xs text-ledger-ink/45">
                  Уже в счёте от {new Date(m.billedAt).toLocaleDateString('ru-RU')}
                  {m.billedBase != null && ` · база ${m.billedBase.toLocaleString('ru-RU')} ₽`}
                </p>
              )}

              {editing === m.id ? (
                <div className="mt-4 space-y-3 border-t border-ledger-ink/10 pt-4">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-ledger-ink/60">
                      Тариф (необязательно)
                    </span>
                    <select
                      value={planId}
                      onChange={(e) => setPlanId(e.target.value)}
                      className="w-full rounded-sm border border-ledger-ink/15 bg-white/50 px-4 py-2.5 text-sm outline-none focus:border-ledger-stamp/60"
                    >
                      <option value="">— не указан —</option>
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {p.price} ₽
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-ledger-ink/60">
                      Сколько получили, ₽
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder={String(m.fallbackPrice)}
                      className="w-full rounded-sm border border-ledger-ink/15 bg-white/50 px-4 py-2.5 text-sm outline-none focus:border-ledger-stamp/60"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      disabled={busy}
                      onClick={() =>
                        send(m.id, 'declare', {
                          planId: planId || null,
                          amount: amount === '' ? null : Number(amount),
                        })
                      }
                      className="rounded-sm bg-ledger-stamp px-4 py-2 text-sm font-bold text-ledger-page hover:brightness-110 disabled:opacity-50"
                    >
                      Сохранить
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="px-2 py-2 text-sm text-ledger-ink/50 hover:text-ledger-ink"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                !m.billedAt && (
                  <div className="mt-3 flex flex-wrap gap-3 text-xs">
                    <button
                      onClick={() => startEdit(m)}
                      className="text-ledger-stamp hover:brightness-110"
                    >
                      {m.status === 'declared' ? 'Изменить сумму' : 'Оформить'}
                    </button>
                    {m.status !== 'dismissed' && (
                      <button
                        disabled={busy}
                        onClick={() => dismiss(m.id)}
                        className="text-ledger-ink/50 hover:text-ledger-ink"
                      >
                        Это не продажа
                      </button>
                    )}
                  </div>
                )
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-sm bg-ledger-page p-4 text-ledger-ink shadow-[4px_6px_0_0_rgba(0,0,0,0.25)] ${
        accent ? 'border-l-4 border-amber-500' : ''
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-ledger-ink/50">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  )
}
