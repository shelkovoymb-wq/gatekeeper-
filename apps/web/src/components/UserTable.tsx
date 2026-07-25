import type { User } from '@/types'
import { formatDate } from '@/lib/format'

interface UserTableProps {
  users: User[]
}

export function UserTable({ users }: UserTableProps) {
  if (users.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center">
        <div className="mb-3 text-4xl">👥</div>
        <p className="text-slate-300">Пока нет подписчиков</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
      <table className="w-full min-w-[640px] text-left">
        <thead>
          <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
            <th className="px-6 py-4 font-medium">Пользователь</th>
            <th className="px-6 py-4 font-medium">Telegram ID</th>
            <th className="px-6 py-4 font-medium">Подписки</th>
            <th className="px-6 py-4 font-medium">Регистрация</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/70">
          {users.map((user) => (
            <tr key={user.id} className="transition-colors hover:bg-slate-800/40">
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary-600 to-secondary-600 text-sm font-semibold text-white">
                    {(user.username || '?').charAt(0).toUpperCase()}
                  </div>
                  <span className="font-medium text-white">{user.username}</span>
                </div>
              </td>
              <td className="px-6 py-4 font-mono text-sm text-slate-400">
                {user.telegramId}
              </td>
              <td className="px-6 py-4">
                <span className="inline-flex items-center rounded-full bg-primary-500/10 px-2.5 py-1 text-xs font-medium text-primary-300">
                  {user.subscriptions.length}
                </span>
              </td>
              <td className="px-6 py-4 text-sm text-slate-400">
                {formatDate(user.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
