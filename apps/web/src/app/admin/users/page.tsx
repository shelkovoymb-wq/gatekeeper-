'use client'

import { useEffect } from 'react'
import { UserTable } from '@/components/UserTable'
import { useAdminStore } from '@/lib/store'
import { api } from '@/lib/api'
import { formatNumber } from '@/lib/format'

export default function UsersPage() {
  const { users, setUsers, isLoading, setIsLoading, setError, error } = useAdminStore()

  useEffect(() => {
    const loadUsers = async () => {
      try {
        setIsLoading(true)
        const data = await api.users.list()
        setUsers(data)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось загрузить подписчиков')
      } finally {
        setIsLoading(false)
      }
    }
    loadUsers()
  }, [setUsers, setIsLoading, setError])

  return (
    <div>
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-ledger-page md:text-3xl">Подписчики</h1>
          <p className="mt-1 text-sm text-ledger-page/60">
            Пользователи Telegram, оформившие доступ к каналам
          </p>
        </div>
        {!isLoading && (
          <span className="rounded-sm border border-ledger-page/20 bg-ledger-page/10 px-3 py-1 text-sm text-ledger-page">
            {formatNumber(users.length)}
          </span>
        )}
      </header>

      {error && (
        <div className="mb-6 rounded-sm border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="h-64 animate-pulse rounded-sm bg-ledger-page/10" />
      ) : (
        <UserTable users={users} />
      )}
    </div>
  )
}
