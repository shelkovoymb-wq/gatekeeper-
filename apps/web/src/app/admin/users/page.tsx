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
          <h1 className="text-2xl font-bold text-white md:text-3xl">Подписчики</h1>
          <p className="mt-1 text-sm text-slate-400">
            Пользователи Telegram, оформившие доступ к каналам
          </p>
        </div>
        {!isLoading && (
          <span className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-sm text-slate-300">
            {formatNumber(users.length)}
          </span>
        )}
      </header>

      {error && (
        <div className="mb-6 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="h-64 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60" />
      ) : (
        <UserTable users={users} />
      )}
    </div>
  )
}
