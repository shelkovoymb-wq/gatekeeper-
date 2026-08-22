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
  { href: '/admin/payment-methods', label: 'Приём денег', icon: '💰' },
  { href: '/admin/billing', label: 'Оплата платформы', icon: '🧾' },
  { href: '/admin/settings', label: 'Настройка', icon: '⚙️' },
  { href: '/admin/assistant', label: 'Ассистент', icon: '🤖' },
]

const ownerNav = [
  { href: '/owner/overview', label: 'Платформа', icon: '📈' },
  { href: '/owner/analytics', label: 'Детальная статистика', icon: '📊' },
  { href: '/owner/clients', label: 'Клиенты', icon: '🏢' },
  { href: '/owner/plans', label: 'Тарифы платформы', icon: '🏷️' },
  { href: '/owner/billing', label: 'Биллинг', icon: '🧾' },
  { href: '/owner/payouts', label: 'Реквизиты и выплаты', icon: '💰' },
  { href: '/owner/client-accounts', label: 'Реквизиты клиентов', icon: '🏦' },
  { href: '/owner/settings', label: 'Настройки', icon: '⚙️' },
]

function SealMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="20" cy="16" r="5.5" fill="currentColor" />
      <path d="M20 21 L14 30 L26 30 Z" fill="currentColor" />
    </svg>
  )
}

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
      <Link href="/" className="mb-8 flex items-center gap-3 transition hover:opacity-80">
        <SealMark className="h-10 w-10 text-ledger-brass" />
        <div className="min-w-0">
          <h1 className="truncate font-display text-lg leading-tight text-ledger-page">Gatekeeper</h1>
          <p className="truncate font-ledger-mono text-[11px] uppercase tracking-wide text-ledger-page/50">
            {subtitle}
          </p>
        </div>
      </Link>

      <nav className="space-y-1">
        {navItems.map((item) => {
          const isActive = pathname?.startsWith(item.href) ?? false
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={clsx(
                'flex items-center gap-3 rounded-sm border-l-2 px-4 py-2.5 text-sm font-bold transition-all duration-standard',
                isActive
                  ? 'border-ledger-stamp bg-ledger-page/10 text-ledger-page'
                  : 'border-transparent text-ledger-page/55 hover:bg-ledger-page/5 hover:text-ledger-page',
              )}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto space-y-3 border-t border-ledger-page/10 pt-5">
        <button
          onClick={logout}
          className="flex w-full items-center gap-2 rounded-sm px-4 py-2.5 text-sm font-bold text-ledger-page/55 transition-colors hover:bg-ledger-page/5 hover:text-ledger-page"
        >
          <span className="text-lg">🚪</span>
          <span>Выйти</span>
        </button>
        <div className="flex items-center gap-2 px-1 font-ledger-mono text-[11px] uppercase tracking-wide text-ledger-page/40">
          <span className="h-2 w-2 rounded-full bg-success shadow-[0_0_8px] shadow-success" />
          <span>Система работает</span>
        </div>
      </div>
    </>
  )

  return (
    <div className="flex min-h-screen bg-ledger-cover font-ledger-body text-ledger-page">
      {/* Desktop sidebar */}
      <aside className="hidden w-72 shrink-0 flex-col border-r border-ledger-page/10 bg-ledger-coverLight p-6 md:flex">
        {NavContent}
      </aside>

      {/* Mobile drawer + backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col border-r border-ledger-page/10 bg-ledger-coverLight p-6 shadow-2xl gk-fade-in">
            {NavContent}
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {/* Mobile top bar with hamburger */}
        <div className="sticky top-0 z-30 flex items-center justify-between border-b border-ledger-page/10 bg-ledger-coverLight/90 px-4 py-3 backdrop-blur-glass md:hidden">
          <Link href="/" className="flex items-center gap-2">
            <SealMark className="h-6 w-6 text-ledger-brass" />
            <span className="font-display text-base text-ledger-page">Gatekeeper</span>
          </Link>
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Меню"
            className="flex h-10 w-10 items-center justify-center rounded-sm border border-ledger-page/15 bg-ledger-page/5 text-ledger-page active:bg-ledger-page/10"
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
