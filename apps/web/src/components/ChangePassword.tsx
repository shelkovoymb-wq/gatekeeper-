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
    'w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-primary-500'

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
      <h2 className="mb-4 text-lg font-semibold text-white">Смена пароля</h2>
      {msg && (
        <div
          className={`mb-4 rounded-xl px-4 py-2.5 text-sm ${
            msg.type === 'ok'
              ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
              : 'border border-danger/40 bg-danger/10 text-red-300'
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
          className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-500 disabled:opacity-50"
        >
          {busy ? 'Сохранение…' : 'Сменить пароль'}
        </button>
      </form>
    </section>
  )
}
