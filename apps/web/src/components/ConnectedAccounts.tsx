'use client'

import { useCallback, useEffect, useState } from 'react'
import { OAuthButtons } from '@/components/OAuthButtons'
import { PROVIDER_LABELS, type OAuthProvider } from '@/lib/oauth'

interface Identity {
  provider: OAuthProvider
  email: string | null
  displayName: string | null
  lastLoginAt: string | null
}

/** Привязка Google/Яндекса к уже существующему аккаунту кабинета. */
export function ConnectedAccounts() {
  const [items, setItems] = useState<Identity[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/auth/identities')
      const d = await r.json()
      if (d?.success && Array.isArray(d.data)) setItems(d.data as Identity[])
    } catch {
      /* раздел просто останется пустым */
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const unlink = async (provider: OAuthProvider) => {
    setBusy(true)
    setMsg(null)
    try {
      const r = await fetch(`/api/auth/identities/${provider}`, { method: 'DELETE' })
      const d = await r.json()
      if (!r.ok || !d.success) throw new Error(d.error || 'Ошибка')
      setMsg({ type: 'ok', text: `${PROVIDER_LABELS[provider]} отвязан` })
      await load()
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Ошибка' })
    } finally {
      setBusy(false)
    }
  }

  const linked = items.map((i) => i.provider)

  return (
    <section className="rounded-sm bg-ledger-page p-6 text-ledger-ink shadow-[4px_6px_0_0_rgba(0,0,0,0.25)]">
      <h2 className="mb-4 font-display text-lg text-ledger-ink">Вход через сервисы</h2>

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

      {items.length > 0 && (
        <ul className="mb-4 space-y-2">
          {items.map((i) => (
            <li
              key={i.provider}
              className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-ledger-ink/10 bg-ledger-pageDark px-4 py-3"
            >
              <div className="min-w-0">
                <span className="font-medium text-ledger-ink">
                  {PROVIDER_LABELS[i.provider] ?? i.provider}
                </span>
                {i.email && (
                  <span className="ml-2 truncate text-sm text-ledger-ink/55">{i.email}</span>
                )}
              </div>
              <button
                onClick={() => unlink(i.provider)}
                disabled={busy}
                className="shrink-0 rounded-sm border border-ledger-ink/20 px-3 py-1.5 text-xs text-ledger-ink hover:bg-ledger-ink/5 disabled:opacity-50"
              >
                Отвязать
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mb-3 text-sm text-ledger-ink/65">
        Привяжите аккаунт, чтобы входить в кабинет одним нажатием.
      </p>
      <OAuthButtons mode="link" exclude={linked} />
    </section>
  )
}
