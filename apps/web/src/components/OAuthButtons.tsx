'use client'

import { useEffect, useState } from 'react'

interface ProviderInfo {
  provider: 'google' | 'yandex'
  displayName: string
  enabled: boolean
}

/**
 * Кнопки внешнего входа. Это обычные ссылки, а не fetch: старт OAuth — это
 * навигация верхнего уровня (иначе провайдер не сможет показать своё окно
 * согласия, а cookie со state не переживёт редиректы).
 */
export function OAuthButtons({
  mode = 'login',
  exclude = [],
}: {
  mode?: 'login' | 'link'
  /** Уже привязанные провайдеры — их кнопки не показываем. */
  exclude?: string[]
}) {
  const [providers, setProviders] = useState<ProviderInfo[]>([])

  useEffect(() => {
    let alive = true
    fetch('/api/auth/oauth/providers')
      .then((r) => r.json())
      .then((d) => {
        if (alive && Array.isArray(d?.data)) setProviders(d.data)
      })
      .catch(() => {
        /* форма входа по паролю должна работать и без этого списка */
      })
    return () => {
      alive = false
    }
  }, [])

  const enabled = providers.filter((p) => p.enabled && !exclude.includes(p.provider))
  if (enabled.length === 0) return null

  return (
    <div className="space-y-3">
      {mode === 'login' && (
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-ledger-ink/10" />
          <span className="font-ledger-mono text-xs uppercase tracking-wide text-ledger-ink/40">
            или
          </span>
          <span className="h-px flex-1 bg-ledger-ink/10" />
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {enabled.map((p) => (
          <a
            key={p.provider}
            href={`/api/auth/oauth/${p.provider}/start?mode=${mode}`}
            className="flex items-center justify-center gap-2 rounded-sm border border-ledger-ink/20 bg-white/60 px-4 py-2.5 text-sm font-medium text-ledger-ink transition hover:bg-white"
          >
            <ProviderMark provider={p.provider} />
            {mode === 'link' ? `Привязать ${p.displayName}` : `Войти через ${p.displayName}`}
          </a>
        ))}
      </div>
    </div>
  )
}

function ProviderMark({ provider }: { provider: 'google' | 'yandex' }) {
  if (provider === 'google') {
    return (
      <svg viewBox="0 0 18 18" className="h-4 w-4" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
        />
        <path
          fill="#34A853"
          d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
        />
        <path
          fill="#FBBC05"
          d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
        />
        <path
          fill="#EA4335"
          d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
        />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 18 18" className="h-4 w-4" aria-hidden="true">
      <circle cx="9" cy="9" r="9" fill="#FC3F1D" />
      <path
        fill="#fff"
        d="M10.02 14.4h1.72V3.6H9.22c-2.4 0-4.05 1.47-4.05 3.64 0 1.73.83 2.75 2.3 3.8L4.9 14.4h1.94l2.86-4.27-.87-.58c-1.2-.8-1.78-1.43-1.78-2.77 0-1.18.83-1.98 2.2-1.98h.77V14.4Z"
      />
    </svg>
  )
}
