'use client'

import { useEffect } from 'react'
import { UserTable } from '@/components/UserTable'
import { useAdminStore } from '@/lib/store'
import { api } from '@/lib/api'

export default function UsersPage() {
  const { users, setUsers, isLoading, setIsLoading, setError } = useAdminStore()

  useEffect(() => {
    const loadUsers = async () => {
      try {
        setIsLoading(true)
        const data = await api.users.list()
        setUsers(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load users')
      } finally {
        setIsLoading(false)
      }
    }

    loadUsers()
  }, [setUsers, setIsLoading, setError])

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to remove this user?')) {
      try {
        await api.users.delete(id)
        setUsers(users.filter((u) => u.id !== id))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete user')
      }
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-slate-500">Loading...</p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold text-slate-900">Users</h1>

      <UserTable users={users} onDelete={handleDelete} />

      <div className="mt-4 text-sm text-slate-500">
        Total: {users.length.toLocaleString()} users
      </div>
    </div>
  )
}
