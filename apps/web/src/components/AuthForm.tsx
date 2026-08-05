'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface AuthFormProps {
  mode: 'login' | 'register'
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'register' ? { email, password, companyName } : { email, password },
        ),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Не удалось выполнить вход')
      router.push('/admin/stats')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="gk-ledger-lines flex min-h-screen items-center justify-center bg-ledger-cover p-6 font-ledger-body">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-3 transition hover:opacity-80">
          <svg viewBox="0 0 40 40" className="h-10 w-10 text-ledger-brass" aria-hidden="true">
            <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="2" />
            <circle cx="20" cy="16" r="5.5" fill="currentColor" />
            <path d="M20 21 L14 30 L26 30 Z" fill="currentColor" />
          </svg>
          <div>
            <h1 className="font-display text-lg leading-tight text-ledger-page">Gatekeeper</h1>
            <p className="font-ledger-mono text-xs uppercase tracking-wide text-ledger-page/50">
              Платные Telegram-каналы
            </p>
          </div>
        </Link>

        <div className="rounded-sm bg-ledger-page p-8 text-ledger-ink shadow-[6px_8px_0_0_rgba(0,0,0,0.3)]">
          <h2 className="mb-1 font-display text-xl text-ledger-ink">
            {mode === 'register' ? 'Регистрация проекта' : 'Вход в кабинет'}
          </h2>
          <p className="mb-6 text-sm text-ledger-ink/60">
            {mode === 'register'
              ? 'Создайте аккаунт, чтобы подключить бота и принимать подписки'
              : 'Войдите, чтобы управлять каналами и подписками'}
          </p>

          {error && (
            <div className="mb-4 rounded-sm border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <Field
                label="Название проекта"
                type="text"
                value={companyName}
                onChange={setCompanyName}
                placeholder="Мой клуб"
                required
              />
            )}
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              required
            />
            <Field
              label="Пароль"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="минимум 8 символов"
              required
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-sm bg-ledger-stamp px-4 py-3 text-sm font-bold text-ledger-page shadow-[3px_3px_0_0_rgba(0,0,0,0.25)] transition hover:brightness-110 disabled:opacity-50"
            >
              {loading ? 'Секунду…' : mode === 'register' ? 'Создать аккаунт' : 'Войти'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-ledger-ink/60">
            {mode === 'register' ? (
              <>
                Уже есть аккаунт?{' '}
                <Link href="/login" className="font-bold text-ledger-stamp hover:brightness-110">
                  Войти
                </Link>
              </>
            ) : (
              <>
                Нет аккаунта?{' '}
                <Link href="/register" className="font-bold text-ledger-stamp hover:brightness-110">
                  Зарегистрироваться
                </Link>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}

function Field(props: {
  label: string
  type: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold text-ledger-ink/80">{props.label}</span>
      <input
        type={props.type}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        required={props.required}
        className="w-full rounded-sm border border-ledger-ink/15 bg-white/50 px-4 py-2.5 text-sm text-ledger-ink placeholder-ledger-ink/35 outline-none transition-colors focus:border-ledger-stamp/60"
      />
    </label>
  )
}
