'use client'

import { useCallback, useEffect, useState } from 'react'

interface Row {
  id: string
  clientId: string
  status: 'pending' | 'declared' | 'dismissed'
  periodMonth: string
  detectedAt: string
  declaredAmount: string | null
  billedAt: string | null
  billedBase: string | null
  channelTitle: string
  tgUserId: number
  username: string | null
}

interface Client {
  id: string
  name: string
  commissionPct: number
}

const statusLabel: Record<Row['status'], { text: string; tone: string }> = {
  pending: { text: 'не оформлен', tone: 'bg-amber-500/15 text-amber-700' },
  declared: { text: 'оформлен', tone: 'bg-emerald-500/15 text-emerald-700' },
  dismissed: { text: 'не продажа', tone: 'bg-ledger-ink/10 text-ledger-ink/60' },
}

/**
 * Прямые добавления глазами владельца платформы.
 *
 * Клиент вправе брать деньги мимо платформы — здесь видно, сколько раз он это
 * сделал, что сам об этом сказал и что из этого уже попало в счёт. Суммы у
 * оформленных строк держатся на слове клиента, и это подписано явно.
 */
export default function OwnerDirectMembersPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [d, c] = await Promise.all([
        fetch('/api/platform/direct-members').then((r) => r.json()),
        fetch('/api/platform/clients').then((r) => r.json()),
      ])
      setRows(Array.isArray(d?.data) ? d.data : [])
      setClients(Array.isArray(c?.data) ? c.data : [])
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

  if (loading) return <div className="h-40 animate-pulse rounded-sm bg-ledger-page/10" />

  const nameOf = (id: string) => clients.find((c) => c.id === id)?.name ?? id.slice(0, 8)
  const pending = rows.filter((r) => r.status === 'pending').length
  const declaredSum = rows
    .filter((r) => r.status === 'declared' && r.declaredAmount)
    .reduce((s, r) => s + Number(r.declaredAmount), 0)

  return (
    <div>
      <header className="mb-8">
        <h1 className="font-display text-2xl text-ledger-page md:text-3xl">Прямые добавления</h1>
        <p className="mt-1 text-sm text-ledger-page/60">
          Кого клиенты завели в каналы сами, минуя платформу. Комиссия с них берётся та же, что и
          с платежей через платформу
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-sm border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile label="Всего записей" value={String(rows.length)} />
        <Tile label="Не оформлено клиентами" value={String(pending)} />
        <Tile label="Заявлено клиентами" value={`${declaredSum.toLocaleString('ru-RU')} ₽`} />
      </div>

      {rows.length === 0 ? (
        <p className="rounded-sm border border-dashed border-ledger-page/20 p-12 text-center text-sm text-ledger-page/50">
          Прямых добавлений пока не было
        </p>
      ) : (
        <div className="overflow-x-auto rounded-sm bg-ledger-page text-ledger-ink shadow-[4px_6px_0_0_rgba(0,0,0,0.25)]">
          <table className="w-full text-sm">
            <thead className="border-b border-ledger-ink/10 text-left text-xs uppercase text-ledger-ink/50">
              <tr>
                <th className="px-4 py-2">Замечен</th>
                <th className="px-4 py-2">Клиент</th>
                <th className="px-4 py-2">Канал</th>
                <th className="px-4 py-2">Участник</th>
                <th className="px-4 py-2">Статус</th>
                <th className="px-4 py-2">Со слов клиента</th>
                <th className="px-4 py-2">В счёте</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-ledger-ink/5 last:border-0">
                  <td className="whitespace-nowrap px-4 py-2 font-ledger-mono text-xs text-ledger-ink/60">
                    {new Date(r.detectedAt).toLocaleString('ru-RU')}
                  </td>
                  <td className="px-4 py-2">{nameOf(r.clientId)}</td>
                  <td className="px-4 py-2 text-ledger-ink/70">{r.channelTitle}</td>
                  <td className="px-4 py-2 font-ledger-mono text-xs">
                    {r.username ? `@${r.username}` : r.tgUserId}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-sm px-2 py-0.5 text-xs font-bold ${statusLabel[r.status].tone}`}
                    >
                      {statusLabel[r.status].text}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {r.declaredAmount ? `${Number(r.declaredAmount).toLocaleString('ru-RU')} ₽` : '—'}
                  </td>
                  <td className="px-4 py-2 text-ledger-ink/60">
                    {r.billedAt
                      ? `${Number(r.billedBase ?? 0).toLocaleString('ru-RU')} ₽`
                      : 'ещё нет'}
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

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm bg-ledger-page p-4 text-ledger-ink shadow-[4px_6px_0_0_rgba(0,0,0,0.25)]">
      <p className="text-xs uppercase tracking-wide text-ledger-ink/50">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  )
}
