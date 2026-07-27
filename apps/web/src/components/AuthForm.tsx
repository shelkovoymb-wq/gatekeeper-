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
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 via-secondary-500 to-accent-500 shadow-lg shadow-primary-600/30">
            <span className="text-xl">🛡️</span>
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight text-white">Gatekeeper</h1>
            <p className="text-xs text-slate-400">Платные Telegram-каналы</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-xl">
          <h2 className="mb-1 text-xl font-bold text-white">
            {mode === 'register' ? 'Регистрация проекта' : 'Вход в кабинет'}
          </h2>
          <p className="mb-6 text-sm text-slate-400">
            {mode === 'register'
              ? 'Создайте аккаунт, чтобы подключить бота и принимать подписки'
              : 'Войдите, чтобы управлять каналами и подписками'}
          </p>

          {error && (
            <div className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-300">
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
              className="w-full rounded-xl bg-gradient-to-r from-primary-600 to-secondary-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-600/25 transition-opacity hover:opacity-95 disabled:opacity-50"
            >
              {loading ? 'Секунду…' : mode === 'register' ? 'Создать аккаунт' : 'Войти'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-400">
            {mode === 'register' ? (
              <>
                Уже есть аккаунт?{' '}
                <Link href="/login" className="text-primary-300 hover:text-primary-200">
                  Войти
                </Link>
              </>
            ) : (
              <>
                Нет аккаунта?{' '}
                <Link href="/register" className="text-primary-300 hover:text-primary-200">
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
      <span className="mb-1.5 block text-sm font-medium text-slate-300">{props.label}</span>
      <input
        type={props.type}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        required={props.required}
        className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition-colors focus:border-primary-500"
      />
    </label>
  )
}
