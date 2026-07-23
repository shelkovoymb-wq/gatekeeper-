import type { User } from '@/types'

interface UserTableProps {
  users: User[]
  onDelete?: (id: string) => void
}

export function UserTable({ users, onDelete }: UserTableProps) {
  if (users.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <p className="text-slate-500">No users found</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
              Username
            </th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
              Telegram ID
            </th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
              Subscriptions
            </th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
              Role
            </th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
              Joined
            </th>
            <th className="px-6 py-3 text-right text-sm font-semibold text-slate-900">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr
              key={user.id}
              className="border-b border-slate-100 hover:bg-slate-50"
            >
              <td className="px-6 py-4 text-sm text-slate-900">{user.username}</td>
              <td className="px-6 py-4 text-sm text-slate-600">{user.telegramId}</td>
              <td className="px-6 py-4 text-sm">
                <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                  {user.subscriptions.length}
                </span>
              </td>
              <td className="px-6 py-4 text-sm text-slate-600">
                {user.isAdmin ? (
                  <span className="rounded-full bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700">
                    Admin
                  </span>
                ) : (
                  <span className="text-slate-500">User</span>
                )}
              </td>
              <td className="px-6 py-4 text-sm text-slate-600">
                {new Date(user.createdAt).toLocaleDateString('ru-RU')}
              </td>
              <td className="px-6 py-4 text-right">
                {onDelete && (
                  <button
                    onClick={() => onDelete(user.id)}
                    className="text-sm font-medium text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
