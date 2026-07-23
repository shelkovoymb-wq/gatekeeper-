import type { Channel } from '@/types'

interface ChannelCardProps {
  channel: Channel
  onEdit?: (channel: Channel) => void
  onDelete?: (id: string) => void
}

export function ChannelCard({ channel, onEdit, onDelete }: ChannelCardProps) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-md hover:shadow-lg transition-shadow duration-200">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{channel.name}</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">@{channel.telegramId}</p>
        </div>
        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
            channel.isActive
              ? 'bg-success/10 text-success'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
          }`}
        >
          {channel.isActive ? '🟢 Active' : '⭕ Inactive'}
        </span>
      </div>

      {channel.description && (
        <p className="mb-4 text-sm text-slate-700 dark:text-slate-300">{channel.description}</p>
      )}

      <div className="mb-6 grid grid-cols-3 gap-4 py-4 border-y border-slate-200 dark:border-slate-700">
        <div>
          <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase">Members</p>
          <p className="mt-1 text-xl font-bold text-primary-600 dark:text-primary-400">
            {channel.memberCount.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase">Fee</p>
          <p className="mt-1 text-xl font-bold text-secondary-600 dark:text-secondary-400">
            {channel.subscriptionFee} {channel.currency}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase">Created</p>
          <p className="mt-1 text-sm text-slate-900 dark:text-slate-50">
            {new Date(channel.createdAt).toLocaleDateString('ru-RU')}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        {onEdit && (
          <button
            onClick={() => onEdit(channel)}
            className="flex-1 rounded-lg bg-primary-50 dark:bg-primary-900 px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-800 transition-colors"
          >
            Edit
          </button>
        )}
        {onDelete && (
          <button
            onClick={() => onDelete(channel.id)}
            className="flex-1 rounded-lg bg-danger/10 dark:bg-danger/20 px-4 py-2 text-sm font-medium text-danger hover:bg-danger/20 dark:hover:bg-danger/30 transition-colors"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  )
}
