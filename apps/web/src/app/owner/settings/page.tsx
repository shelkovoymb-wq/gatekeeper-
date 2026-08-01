'use client'

import { ChangePassword } from '@/components/ChangePassword'

export default function OwnerSettingsPage() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-white md:text-3xl">Настройки</h1>
        <p className="mt-1 text-sm text-slate-400">Профиль владельца платформы</p>
      </header>
      <ChangePassword />
    </div>
  )
}
