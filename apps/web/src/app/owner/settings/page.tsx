'use client'

import { ChangePassword } from '@/components/ChangePassword'

export default function OwnerSettingsPage() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-2xl text-ledger-page md:text-3xl">Настройки</h1>
        <p className="mt-1 text-sm text-ledger-page/60">Профиль владельца платформы</p>
      </header>
      <ChangePassword />
    </div>
  )
}
