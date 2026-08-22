'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChangePassword } from '@/components/ChangePassword'

interface Bot {
  id: string
  username: string
  status: string
}
export default function SettingsPage() {
  const [bots, setBots] = useState<Bot[]>([])
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    const b = await fetch('/api/bots').then((r) => r.json())
    setBots(Array.isArray(b?.data) ? b.data : [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const connectBot = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      const r = await fetch('/api/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      })
      const d = await r.json()
      if (!r.ok || !d.success) throw new Error(d.error || 'Ошибка')
      setMsg({ type: 'ok', text: `Бот @${d.data?.username ?? ''} подключён` })
      setToken('')
      await load()
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Ошибка' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-2xl text-ledger-page md:text-3xl">Настройка</h1>
        <p className="mt-1 text-sm text-ledger-page/60">Боты и доступ к кабинету</p>
      </header>

      {msg && (
        <div
          className={`rounded-sm px-4 py-2.5 text-sm ${
            msg.type === 'ok'
              ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
              : 'border border-danger/40 bg-danger/10 text-red-300'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Боты */}
      <section className="rounded-sm bg-ledger-page p-6 text-ledger-ink shadow-[4px_6px_0_0_rgba(0,0,0,0.25)]">
        <h2 className="mb-4 text-lg font-bold text-ledger-ink">Telegram-боты</h2>
        {bots.length > 0 && (
          <ul className="mb-4 space-y-2">
            {bots.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between rounded-sm border border-ledger-ink/10 bg-ledger-pageDark px-4 py-3"
              >
                <span className="font-medium text-ledger-ink">@{b.username}</span>
                <span
                  className={`rounded-sm px-2.5 py-1 text-xs ${
                    b.status === 'active'
                      ? 'bg-emerald-500/10 text-emerald-700'
                      : 'bg-amber-500/10 text-amber-700'
                  }`}
                >
                  {b.status === 'active' ? 'активен' : b.status}
                </span>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={connectBot} className="flex gap-2">
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Токен от @BotFather (123456:ABC...)"
            className="min-w-0 flex-1 rounded-sm border border-ledger-ink/15 bg-white/50 px-4 py-2.5 text-sm text-ledger-ink placeholder-ledger-ink/35 outline-none focus:border-ledger-stamp/60"
          />
          <button
            type="submit"
            disabled={busy || !token.trim()}
            className="shrink-0 rounded-sm bg-ledger-stamp px-4 py-2.5 text-sm font-bold text-ledger-page hover:brightness-110 disabled:opacity-50"
          >
            Подключить
          </button>
        </form>
      </section>

      {/* Приём денег переехал на отдельный экран вместе с реквизитами */}
      <section className="rounded-sm border border-ledger-page/15 px-5 py-4">
        <h2 className="text-lg font-bold text-ledger-page">Приём денег</h2>
        <p className="mt-1 text-sm text-ledger-page/60">
          Платёжные системы и свои реквизиты — на одном экране{' '}
          <Link href="/admin/payment-methods" className="text-ledger-brass underline">
            «Приём денег»
          </Link>
          .
        </p>
      </section>

      <ChangePassword />
    </div>
  )
}
