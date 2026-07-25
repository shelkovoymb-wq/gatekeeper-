'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'

interface LayoutProps {
  children: React.ReactNode
}

const navItems = [
  { href: '/admin/stats', label: 'Обзор', icon: '📊' },
  { href: '/admin/channels', label: 'Каналы', icon: '📺' },
  { href: '/admin/users', label: 'Подписчики', icon: '👥' },
  { href: '/admin/payments', label: 'Платежи', icon: '💳' },
]

export function Layout({ children }: LayoutProps) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      {/* Sidebar */}
      <aside className="hidden w-72 shrink-0 flex-col border-r border-slate-800 bg-slate-900/60 p-6 backdrop-blur-glass md:flex">
        {/* Logo */}
        <div className="mb-10 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 via-secondary-500 to-accent-500 shadow-lg shadow-primary-600/30">
            <span className="text-xl">🛡️</span>
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight text-white">Gatekeeper</h1>
            <p className="text-xs text-slate-400">Платные Telegram-каналы</p>
          </div>
        </div>

        {/* Navigation */}
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

        {/* Footer */}
        <div className="mt-auto border-t border-slate-800 pt-5">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="h-2 w-2 rounded-full bg-success shadow-[0_0_8px] shadow-success" />
            <span>Система работает</span>
          </div>
          <p className="mt-2 text-xs text-slate-600">v1.0 · gatekeeper.skud24.ru</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 border-b border-slate-800 bg-slate-900/60 px-6 py-4 backdrop-blur-glass md:hidden">
          <span className="text-xl">🛡️</span>
          <span className="font-bold text-white">Gatekeeper</span>
        </div>
        <div className="mx-auto min-h-screen w-full max-w-6xl gk-fade-in p-6 md:p-10">
          {children}
        </div>
      </main>
    </div>
  )
}
