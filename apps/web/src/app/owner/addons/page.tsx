'use client'

import { useCallback, useEffect, useState } from 'react'

interface Addon {
  code: string
  name: string
  description: string | null
  priceMonth: number
  currency: string
  periodDays: number
}

interface Subscription {
  clientId: string
  clientName: string
  addonCode: string
  status: string
  expiresAt: string | null
  updatedAt: string
}

interface GatewayEvent {
  id: number
  eventKey: string
  clientId: string | null
  addonCode: string | null
  eventType: string
  amount: string | null
  currency: string | null
  createdAt: string
}

const statusTone: Record<string, string> = {
  free: 'bg-blue-500/15 text-blue-700',
  trial: 'bg-blue-500/15 text-blue-700',
  active: 'bg-emerald-500/15 text-emerald-700',
  past_due: 'bg-amber-500/15 text-amber-700',
  expired: 'bg-ledger-ink/10 text-ledger-ink/60',
}

const statusLabel: Record<string, string> = {
  free: 'выдана бесплатно',
  trial: 'пробный период',
  active: 'оплачена',
  past_due: 'списание не прошло',
  expired: 'не оплачена',
}

/**
 * Платные опции глазами владельца.
 *
 * Здесь же лежит журнал событий шлюза — им разбирается жалоба «я оплатил,
 * а доступа нет»: событие пишется всегда, включая неверную подпись и
 * ненайденного клиента.
 */
export default function OwnerAddonsPage() {
  const [addons, setAddons] = useState<Addon[]>([])
  const [subs, setSubs] = useState<Subscription[]>([])
  const [events, setEvents] = useState<GatewayEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [code, setCode] = useState('posting')
  const [price, setPrice] = useState('')
  const [paymentUrl, setPaymentUrl] = useState('')
  const [grantClient, setGrantClient] = useState('')

  const load = useCallback(async () => {
    try {
      const [a, s, e] = await Promise.all([
        fetch('/api/platform/addons').then((r) => r.json()),
        fetch('/api/platform/addons/subscriptions').then((r) => r.json()),
        fetch('/api/platform/addons/events').then((r) => r.json()),
      ])
      const list: Addon[] = Array.isArray(a?.data) ? a.data : []
      setAddons(list)
      setSubs(Array.isArray(s?.data) ? s.data : [])
      setEvents(Array.isArray(e?.data) ? e.data : [])
      if (list[0]) {
        setCode(list[0].code)
        setPrice(String(list[0].priceMonth))
      }
      setError(null)
    } catch {
      setError('Не удалось загрузить опции')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const send = async (path: string, method: 'PUT' | 'POST', body: unknown) => {
    setBusy(true)
    setError(null)
    try {
      const r = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok || !d.success) throw new Error(d.error || 'Ошибка')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="h-40 animate-pulse rounded-sm bg-ledger-page/10" />

  return (
    <div>
      <header className="mb-8">
        <h1 className="font-display text-2xl text-ledger-page md:text-3xl">Платные опции</h1>
        <p className="mt-1 text-sm text-ledger-page/60">
          Цена, ссылка на оплату, кому подключено и что приходило от шлюза
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-sm border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-sm bg-ledger-page p-6 text-ledger-ink shadow-[4px_6px_0_0_rgba(0,0,0,0.25)]">
          <h2 className="mb-4 text-lg font-bold">Настройка</h2>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ledger-ink/60">Опция</span>
            <select
              value={code}
              onChange={(e) => {
                setCode(e.target.value)
                const a = addons.find((x) => x.code === e.target.value)
                setPrice(a ? String(a.priceMonth) : '')
              }}
              className="w-full rounded-sm border border-ledger-ink/15 bg-white/50 px-4 py-2.5 text-sm outline-none focus:border-ledger-stamp/60"
            >
              {addons.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium text-ledger-ink/60">Цена, ₽</span>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full rounded-sm border border-ledger-ink/15 bg-white/50 px-4 py-2.5 text-sm outline-none focus:border-ledger-stamp/60"
            />
          </label>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium text-ledger-ink/60">
              Ссылка на форму оплаты
            </span>
            <input
              value={paymentUrl}
              onChange={(e) => setPaymentUrl(e.target.value)}
              placeholder="https://kassa.example.ru/form"
              className="w-full rounded-sm border border-ledger-ink/15 bg-white/50 px-4 py-2.5 text-sm outline-none focus:border-ledger-stamp/60"
            />
            <span className="mt-1 block text-xs text-ledger-ink/45">
              Клиенту она отдаётся с добавленным order_num — по нему платёж и опознаётся.
            </span>
          </label>

          <button
            disabled={busy}
            onClick={() =>
              send(`/api/platform/addons/${code}`, 'PUT', {
                priceMonth: Number(price),
                ...(paymentUrl ? { paymentUrl } : {}),
              })
            }
            className="mt-5 w-full rounded-sm bg-ledger-stamp px-4 py-2.5 text-sm font-bold text-ledger-page hover:brightness-110 disabled:opacity-50"
          >
            Сохранить
          </button>

          <div className="mt-6 border-t border-ledger-ink/10 pt-4">
            <span className="mb-1.5 block text-sm font-medium text-ledger-ink/60">
              Выдать бесплатно
            </span>
            <input
              value={grantClient}
              onChange={(e) => setGrantClient(e.target.value)}
              placeholder="ID клиента"
              className="w-full rounded-sm border border-ledger-ink/15 bg-white/50 px-4 py-2.5 text-sm outline-none focus:border-ledger-stamp/60"
            />
            <button
              disabled={busy || !grantClient}
              onClick={() =>
                send(`/api/platform/addons/${code}/grant`, 'POST', { clientId: grantClient.trim() })
              }
              className="mt-2 w-full rounded-sm border border-ledger-ink/20 px-4 py-2 text-sm font-bold hover:border-ledger-stamp/60 disabled:opacity-50"
            >
              Подключить без оплаты
            </button>
          </div>
        </div>

        <div className="lg:col-span-2">
          <h2 className="mb-3 font-display text-lg text-ledger-page">Кому подключено</h2>
          {subs.length === 0 ? (
            <p className="rounded-sm border border-dashed border-ledger-page/20 p-8 text-center text-sm text-ledger-page/50">
              Пока никто не подключал
            </p>
          ) : (
            <div className="space-y-2">
              {subs.map((s) => (
                <div
                  key={`${s.clientId}-${s.addonCode}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-ledger-page px-4 py-3 text-ledger-ink shadow-[4px_6px_0_0_rgba(0,0,0,0.25)]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold">{s.clientName}</p>
                    <p className="font-ledger-mono text-xs text-ledger-ink/50">
                      {s.addonCode}
                      {s.expiresAt && ` · до ${new Date(s.expiresAt).toLocaleDateString('ru-RU')}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-sm px-2 py-0.5 text-xs font-bold ${statusTone[s.status] ?? statusTone.expired}`}
                    >
                      {statusLabel[s.status] ?? s.status}
                    </span>
                    {s.status !== 'expired' && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          send(`/api/platform/addons/${s.addonCode}/revoke`, 'POST', {
                            clientId: s.clientId,
                          })
                        }
                        className="text-xs text-ledger-ink/45 hover:text-ledger-stampDark"
                      >
                        Отключить
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <h2 className="mb-3 mt-8 font-display text-lg text-ledger-page">Журнал шлюза</h2>
          {events.length === 0 ? (
            <p className="rounded-sm border border-dashed border-ledger-page/20 p-8 text-center text-sm text-ledger-page/50">
              Событий не было
            </p>
          ) : (
            <div className="overflow-x-auto rounded-sm bg-ledger-page text-ledger-ink shadow-[4px_6px_0_0_rgba(0,0,0,0.25)]">
              <table className="w-full text-sm">
                <thead className="border-b border-ledger-ink/10 text-left text-xs uppercase text-ledger-ink/50">
                  <tr>
                    <th className="px-4 py-2">Когда</th>
                    <th className="px-4 py-2">Событие</th>
                    <th className="px-4 py-2">Опция</th>
                    <th className="px-4 py-2">Сумма</th>
                    <th className="px-4 py-2">Клиент</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id} className="border-b border-ledger-ink/5 last:border-0">
                      <td className="whitespace-nowrap px-4 py-2 font-ledger-mono text-xs text-ledger-ink/60">
                        {new Date(e.createdAt).toLocaleString('ru-RU')}
                      </td>
                      <td className="px-4 py-2">{e.eventType}</td>
                      <td className="px-4 py-2 text-ledger-ink/60">{e.addonCode ?? '—'}</td>
                      <td className="px-4 py-2">{e.amount ? `${e.amount} ₽` : '—'}</td>
                      <td className="px-4 py-2 font-ledger-mono text-xs text-ledger-ink/50">
                        {e.clientId ? e.clientId.slice(0, 8) : 'не найден'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
