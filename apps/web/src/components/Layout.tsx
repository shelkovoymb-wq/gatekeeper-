'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'

interface LayoutProps {
  children: React.ReactNode
}

const navItems = [
  { href: '/admin/channels', label: 'Каналы' },
  { href: '/admin/users', label: 'Пользователи' },
  { href: '/admin/stats', label: 'Статистика' },
  { href: '/chat', label: 'Чат' },
]

const icons: Record<string, string> = {
  'Каналы': '📺',
  'Пользователи': '👥',
  'Статистика': '📊',
  'Чат': '💬',
}

export function Layout({ children }: LayoutProps) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Sidebar */}
      <aside className="w-72 bg-gradient-to-b from-slate-800 via-slate-800 to-slate-900 border-r border-slate-700 p-8 shadow-2xl">
        {/* Logo */}
        <div className="mb-16">
          <div className="inline-block p-3 bg-gradient-to-br from-primary-600 via-secondary-600 to-accent-500 rounded-2xl mb-4 shadow-lg">
            <span className="text-2xl">⚡</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            n8nHarness
          </h1>
          <p className="text-sm text-slate-400">AI Agent Platform</p>
        </div>

        {/* Navigation */}
        <nav className="space-y-3">
          {navItems.map((item) => {
            const isActive = pathname?.startsWith(item.href) ?? false
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-300',
                  isActive
                    ? 'bg-gradient-to-r from-primary-600 to-secondary-600 text-white shadow-lg shadow-primary-600/50'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                )}
              >
                <span className="text-xl">{icons[item.label]}</span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="absolute bottom-8 left-8 right-8 pt-6 border-t border-slate-700">
          <p className="text-xs text-slate-500 text-center">
            v1.0 • Powered by n8n
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="min-h-screen p-8">{children}</div>
      </main>
    </div>
  )
}
