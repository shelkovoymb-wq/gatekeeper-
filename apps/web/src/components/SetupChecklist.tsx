'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

interface Step {
  key: string
  title: string
  done: boolean
  hint: string
}

export function SetupChecklist() {
  const [bots, setBots] = useState<unknown[]>([])
  const [channels, setChannels] = useState<unknown[]>([])
  const [tariffs, setTariffs] = useState<unknown[]>([])
  const [payments, setPayments] = useState<Array<{ configured: boolean }>>([])
  const [loaded, setLoaded] = useState(false)

  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    const arr = async (url: string) => {
      const r = await fetch(url)
      const d = await r.json().catch(() => ({}))
      return Array.isArray(d?.data) ? d.data : []
    }
    const [b, c, t, p] = await Promise.all([
      arr('/api/bots'),
      arr('/api/channels'),
      arr('/api/tariffs'),
      arr('/api/pay-config'),
    ])
    setBots(b)
    setChannels(c)
    setTariffs(t)
    setPayments(p)
    setLoaded(true)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const connect = async (e: React.FormEvent) => {
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
      if (!r.ok || !d.success) throw new Error(d.error || 'Не удалось подключить бота')
      setMsg({ type: 'ok', text: `Бот @${d.data?.username ?? ''} подключён` })
      setToken('')
      await load()
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Ошибка' })
    } finally {
      setBusy(false)
    }
  }

  const steps: Step[] = [
    { key: 'bot', title: 'Подключить Telegram-бота', done: bots.length > 0, hint: 'Токен от @BotFather' },
    {
      key: 'channel',
      title: 'Добавить бота в канал',
      done: channels.length > 0,
      hint: 'Админ + права «Приглашать» и «Банить»',
    },
    { key: 'tariff', title: 'Создать тариф', done: tariffs.length > 0, hint: 'Цена и период подписки' },
    {
      key: 'pay',
      title: 'Подключить оплату',
      done: payments.some((p) => p.configured),
      hint: 'ЮKassa / CloudPayments / Stars',
    },
  ]
  const allDone = loaded && steps.every((s) => s.done)
  if (allDone) return null

  return (
    <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Быстрая настройка</h2>
        <span className="text-sm text-slate-400">
          {steps.filter((s) => s.done).length}/{steps.length}
        </span>
      </div>

      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s.key} className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                s.done ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {s.done ? '✓' : i + 1}
            </span>
            <div className="min-w-0">
              <p className={`text-sm font-medium ${s.done ? 'text-slate-400 line-through' : 'text-white'}`}>
                {s.title}
              </p>
              <p className="text-xs text-slate-500">{s.hint}</p>

              {s.key === 'bot' && !s.done && (
                <form onSubmit={connect} className="mt-2 flex gap-2">
                  <input
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="123456:ABC-DEF..."
                    className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-primary-500"
                  />
                  <button
                    type="submit"
                    disabled={busy || !token.trim()}
                    className="shrink-0 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500 disabled:opacity-50"
                  >
                    {busy ? '…' : 'Подключить'}
                  </button>
                </form>
              )}
              {s.key === 'tariff' && !s.done && bots.length > 0 && (
                <Link href="/admin/tariffs" className="mt-1 inline-block text-xs text-primary-300 hover:text-primary-200">
                  Перейти к тарифам →
                </Link>
              )}
              {s.key === 'pay' && !s.done && (
                <Link href="/admin/settings" className="mt-1 inline-block text-xs text-primary-300 hover:text-primary-200">
                  Настроить оплату →
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>

      {msg && (
        <div
          className={`mt-4 rounded-xl px-4 py-2.5 text-sm ${
            msg.type === 'ok'
              ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
              : 'border border-danger/40 bg-danger/10 text-red-300'
          }`}
        >
          {msg.text}
        </div>
      )}
    </div>
  )
}
