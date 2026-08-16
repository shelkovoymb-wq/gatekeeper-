'use client'

import { useEffect, useState } from 'react'
import { ChangePassword } from '@/components/ChangePassword'
import { TwoFactorSettings } from '@/components/TwoFactorSettings'

export default function OwnerSettingsPage() {
  const [hasPassword, setHasPassword] = useState(true)

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (d?.success) setHasPassword(d.data?.hasPassword !== false)
      })
      .catch(() => {
        /* по умолчанию считаем, что пароль есть */
      })
  }, [])

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-2xl text-ledger-page md:text-3xl">Настройки</h1>
        <p className="mt-1 text-sm text-ledger-page/60">Профиль владельца платформы</p>
      </header>
      {/* Владелец платформы — самая ценная учётка, 2FA здесь особенно уместна. */}
      <TwoFactorSettings hasPassword={hasPassword} />
      <ChangePassword hasPassword={hasPassword} />
    </div>
  )
}
