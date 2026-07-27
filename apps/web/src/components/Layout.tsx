'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import clsx from 'clsx'

interface LayoutProps {
  children: React.ReactNode
}

const navItems = [
  { href: '/admin/stats', label: 'Обзор', icon: '📊' },
  { href: '/admin/channels', label: 'Каналы', icon: '📺' },
  { href: '/admin/tariffs', label: 'Тарифы', icon: '🏷️' },
  { href: '/admin/users', label: 'Подписчики', icon: '👥' },
  { href: '/admin/payments', label: 'Платежи', icon: '💳' },
  { href: '/admin/settings', label: 'Настройка', icon: '⚙️' },
  { href: '/admin/assistant', label: 'Ассистент', icon: '🤖' },
]

export function Layout({ children }: LayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [company, setCompany] = useState<string>('')

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.data?.companyName && setCompany(d.data.companyName))
      .catch(() => {})
  }, [])

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-slate-800 bg-slate-900/60 p-6 backdrop-blur-glass md:flex">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 via-secondary-500 to-accent-500 shadow-lg shadow-primary-600/30">
            <span className="text-xl">🛡️</span>
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold leading-tight text-white">Gatekeeper</h1>
            <p className="truncate text-xs text-slate-400">{company || 'Платные Telegram-каналы'}</p>
          </div>
        </div>

        <nav className="space-y-1.5">
          {navItems.map((item) => {
            const isActive = pathname?.startsWith(item.href) ?? false
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-standard',
                  isActive
                    ? 'bg-gradient-to-r from-primary-600/90 to-secondary-600/90 text-white shadow-lg shadow-primary-600/25'
                    : 'text-slate-400 hover:bg-slate-800/70 hover:text-white',
                )}
              >
                <span className="text-lg">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="mt-auto space-y-3 border-t border-slate-800 pt-5">
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800/70 hover:text-white"
          >
            <span className="text-lg">🚪</span>
            <span>Выйти</span>
          </button>
          <div className="flex items-center gap-2 px-1 text-xs text-slate-500">
            <span className="h-2 w-2 rounded-full bg-success shadow-[0_0_8px] shadow-success" />
            <span>Система работает</span>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="flex items-center gap-3 border-b border-slate-800 bg-slate-900/60 px-6 py-4 backdrop-blur-glass md:hidden">
          <span className="text-xl">🛡️</span>
          <span className="font-bold text-white">Gatekeeper</span>
        </div>
        <div className="mx-auto min-h-screen w-full max-w-6xl gk-fade-in p-6 md:p-10">{children}</div>
      </main>
    </div>
  )
}
