'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import clsx from 'clsx'

interface LayoutProps {
  children: React.ReactNode
}

const clientNav = [
  { href: '/admin/stats', label: 'Обзор', icon: '📊' },
  { href: '/admin/channels', label: 'Каналы', icon: '📺' },
  { href: '/admin/tariffs', label: 'Тарифы', icon: '🏷️' },
  { href: '/admin/users', label: 'Подписчики', icon: '👥' },
  { href: '/admin/payments', label: 'Платежи', icon: '💳' },
  { href: '/admin/billing', label: 'Оплата платформы', icon: '🧾' },
  { href: '/admin/settings', label: 'Настройка', icon: '⚙️' },
  { href: '/admin/assistant', label: 'Ассистент', icon: '🤖' },
]

const ownerNav = [
  { href: '/owner/overview', label: 'Платформа', icon: '📈' },
  { href: '/owner/clients', label: 'Клиенты', icon: '🏢' },
  { href: '/owner/plans', label: 'Тарифы платформы', icon: '🏷️' },
  { href: '/owner/billing', label: 'Биллинг', icon: '🧾' },
]

export function Layout({ children }: LayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [company, setCompany] = useState<string>('')
  const [role, setRole] = useState<string>('')
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.data?.companyName) setCompany(d.data.companyName)
        if (d?.data?.role) setRole(d.data.role)
      })
      .catch(() => {})
  }, [])

  const isOwner = role === 'owner'
  const navItems = isOwner ? ownerNav : clientNav
  const subtitle = isOwner ? 'Владелец платформы' : company || 'Кабинет клиента'

  // Закрываем мобильное меню при переходе на другую страницу
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const NavContent = (
    <>
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 via-secondary-500 to-accent-500 shadow-lg shadow-primary-600/30">
          <span className="text-xl">🛡️</span>
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold leading-tight text-white">Gatekeeper</h1>
          <p className="truncate text-xs text-slate-400">{subtitle}</p>
        </div>
      </div>

      <nav className="space-y-1.5">
        {navItems.map((item) => {
          const isActive = pathname?.startsWith(item.href) ?? false
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
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
    </>
  )

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      {/* Desktop sidebar */}
      <aside className="hidden w-72 shrink-0 flex-col border-r border-slate-800 bg-slate-900/60 p-6 backdrop-blur-glass md:flex">
        {NavContent}
      </aside>

      {/* Mobile drawer + backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col border-r border-slate-800 bg-slate-900 p-6 shadow-2xl gk-fade-in">
            {NavContent}
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {/* Mobile top bar with hamburger */}
        <div className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 py-3 backdrop-blur-glass md:hidden">
          <div className="flex items-center gap-2">
            <span className="text-xl">🛡️</span>
            <span className="font-bold text-white">Gatekeeper</span>
          </div>
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Меню"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/60 text-slate-200 active:bg-slate-700"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
        <div className="mx-auto min-h-screen w-full max-w-6xl gk-fade-in p-5 md:p-10">{children}</div>
      </main>
    </div>
  )
}
