'use client'

import { useCallback, useEffect, useState } from 'react'

interface Bot {
  id: string
  username: string
  status: string
}
interface PayCfg {
  provider: string
  configured: boolean
  isActive: boolean
  needsKeys: boolean
}

const providerMeta: Record<string, { label: string; fields: { key: string; label: string }[] }> = {
  yookassa: {
    label: 'ЮKassa',
    fields: [
      { key: 'shopId', label: 'shopId' },
      { key: 'secretKey', label: 'Секретный ключ' },
    ],
  },
  cloudpayments: {
    label: 'CloudPayments',
    fields: [
      { key: 'publicId', label: 'Public ID' },
      { key: 'apiSecret', label: 'API Secret' },
    ],
  },
  robokassa: {
    label: 'Robokassa',
    fields: [
      { key: 'merchantLogin', label: 'Логин магазина' },
      { key: 'password1', label: 'Пароль #1' },
      { key: 'password2', label: 'Пароль #2' },
    ],
  },
  stars: { label: 'Telegram Stars', fields: [] },
}

export default function SettingsPage() {
  const [bots, setBots] = useState<Bot[]>([])
  const [cfgs, setCfgs] = useState<PayCfg[]>([])
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    const [b, p] = await Promise.all([
      fetch('/api/bots').then((r) => r.json()),
      fetch('/api/pay-config').then((r) => r.json()),
    ])
    setBots(Array.isArray(b?.data) ? b.data : [])
    setCfgs(Array.isArray(p?.data) ? p.data : [])
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
        <h1 className="text-2xl font-bold text-white md:text-3xl">Настройка</h1>
        <p className="mt-1 text-sm text-slate-400">Боты и приём платежей</p>
      </header>

      {msg && (
        <div
          className={`rounded-xl px-4 py-2.5 text-sm ${
            msg.type === 'ok'
              ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
              : 'border border-danger/40 bg-danger/10 text-red-300'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Боты */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Telegram-боты</h2>
        {bots.length > 0 && (
          <ul className="mb-4 space-y-2">
            {bots.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3"
              >
                <span className="font-medium text-white">@{b.username}</span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs ${
                    b.status === 'active'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'bg-amber-500/10 text-amber-400'
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
            className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-primary-500"
          />
          <button
            type="submit"
            disabled={busy || !token.trim()}
            className="shrink-0 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-500 disabled:opacity-50"
          >
            Подключить
          </button>
        </form>
      </section>

      {/* Платежи */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-white">Платёжные системы</h2>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {cfgs.map((c) => (
            <ProviderCard key={c.provider} cfg={c} onSaved={load} setMsg={setMsg} />
          ))}
        </div>
      </section>
    </div>
  )
}

function ProviderCard({
  cfg,
  onSaved,
  setMsg,
}: {
  cfg: PayCfg
  onSaved: () => void
  setMsg: (m: { type: 'ok' | 'err'; text: string }) => void
}) {
  const meta = providerMeta[cfg.provider]
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const save = async (enable: boolean) => {
    setBusy(true)
    try {
      const credentials = cfg.needsKeys ? values : null
      const r = await fetch(`/api/pay-config/${cfg.provider}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials, isActive: enable }),
      })
      const d = await r.json()
      if (!r.ok || !d.success) throw new Error(d.error || 'Ошибка')
      setMsg({ type: 'ok', text: `${meta.label}: сохранено` })
      onSaved()
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Ошибка' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-white">{meta.label}</h3>
        <span
          className={`rounded-full px-2.5 py-1 text-xs ${
            cfg.configured && cfg.isActive
              ? 'bg-emerald-500/10 text-emerald-400'
              : 'bg-slate-700/40 text-slate-400'
          }`}
        >
          {cfg.configured && cfg.isActive ? 'подключён' : 'выключен'}
        </span>
      </div>

      {cfg.needsKeys ? (
        <div className="space-y-2">
          {meta.fields.map((f) => (
            <input
              key={f.key}
              placeholder={f.label}
              value={values[f.key] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-primary-500"
            />
          ))}
          <button
            onClick={() => save(true)}
            disabled={busy}
            className="mt-1 w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500 disabled:opacity-50"
          >
            {busy ? '…' : 'Сохранить и включить'}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-slate-400">Ключи не требуются — оплата звёздами Telegram.</p>
          <button
            onClick={() => save(!cfg.isActive)}
            disabled={busy}
            className={`w-full rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${
              cfg.isActive
                ? 'border border-slate-700 text-slate-300 hover:bg-slate-800'
                : 'bg-primary-600 text-white hover:bg-primary-500'
            }`}
          >
            {cfg.isActive ? 'Выключить' : 'Включить'}
          </button>
        </div>
      )}
    </div>
  )
}
