import type { User } from '@/types'
import { formatDate } from '@/lib/format'

interface UserTableProps {
  users: User[]
}

export function UserTable({ users }: UserTableProps) {
  if (users.length === 0) {
    return (
      <div className="rounded-sm border border-dashed border-ledger-page/20 p-12 text-center">
        <div className="mb-3 text-4xl">👥</div>
        <p className="text-ledger-page/70">Пока нет подписчиков</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-sm border border-ledger-page/15">
      <table className="w-full min-w-[640px] text-left">
        <thead>
          <tr className="border-b border-ledger-page/15 bg-ledger-cover font-ledger-mono text-xs uppercase tracking-wide text-ledger-brass">
            <th className="px-6 py-3 font-medium">Пользователь</th>
            <th className="px-6 py-3 font-medium">Telegram ID</th>
            <th className="px-6 py-3 font-medium">Подписки</th>
            <th className="px-6 py-3 font-medium">Регистрация</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ledger-ink/10 bg-ledger-page">
          {users.map((user) => (
            <tr key={user.id} className="transition-colors hover:bg-ledger-ink/5">
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ledger-ink font-display text-sm text-ledger-page">
                    {(user.username || '?').charAt(0).toUpperCase()}
                  </div>
                  <span className="font-bold text-ledger-ink">{user.username}</span>
                </div>
              </td>
              <td className="px-6 py-4 font-ledger-mono text-sm text-ledger-ink/55">{user.telegramId}</td>
              <td className="px-6 py-4">
                <span className="inline-flex items-center rounded-sm bg-ledger-stamp/10 px-2.5 py-1 font-ledger-mono text-xs text-ledger-stamp">
                  {user.subscriptions.length}
                </span>
              </td>
              <td className="px-6 py-4 text-sm text-ledger-ink/55">{formatDate(user.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
