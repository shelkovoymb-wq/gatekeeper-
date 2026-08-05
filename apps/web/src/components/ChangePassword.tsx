'use client'

import { useState } from 'react'

/** Форма смены собственного пароля (для владельца и клиента). */
export function ChangePassword() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(null)
    if (next.length < 8) {
      setMsg({ type: 'err', text: 'Новый пароль — не короче 8 символов' })
      return
    }
    if (next !== repeat) {
      setMsg({ type: 'err', text: 'Пароли не совпадают' })
      return
    }
    setBusy(true)
    try {
      const r = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })
      const d = await r.json()
      if (!r.ok || !d.success) throw new Error(d.error || 'Ошибка')
      setMsg({ type: 'ok', text: 'Пароль изменён' })
      setCurrent('')
      setNext('')
      setRepeat('')
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Ошибка' })
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    'w-full rounded-sm border border-ledger-ink/15 bg-white/50 px-4 py-2.5 text-sm text-ledger-ink placeholder-ledger-ink/35 outline-none focus:border-ledger-stamp/60'

  return (
    <section className="rounded-sm bg-ledger-page p-6 text-ledger-ink shadow-[4px_6px_0_0_rgba(0,0,0,0.25)]">
      <h2 className="mb-4 font-display text-lg text-ledger-ink">Смена пароля</h2>
      {msg && (
        <div
          className={`mb-4 rounded-sm px-4 py-2.5 text-sm ${
            msg.type === 'ok'
              ? 'border border-success/40 bg-success/10 text-emerald-700'
              : 'border border-danger/40 bg-danger/10 text-red-700'
          }`}
        >
          {msg.text}
        </div>
      )}
      <form onSubmit={submit} className="max-w-md space-y-3">
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Текущий пароль"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className={inputCls}
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder="Новый пароль (≥ 8 символов)"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className={inputCls}
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder="Повторите новый пароль"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          className={inputCls}
        />
        <button
          type="submit"
          disabled={busy || !current || !next}
          className="rounded-sm bg-ledger-stamp px-5 py-2.5 text-sm font-bold text-ledger-page hover:brightness-110 disabled:opacity-50"
        >
          {busy ? 'Сохранение…' : 'Сменить пароль'}
        </button>
      </form>
    </section>
  )
}
