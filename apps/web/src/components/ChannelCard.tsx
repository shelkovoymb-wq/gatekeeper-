import type { Channel } from '@/types'
import { formatMoney, formatNumber, formatDate } from '@/lib/format'

interface ChannelCardProps {
  channel: Channel
}

export function ChannelCard({ channel }: ChannelCardProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg transition-all duration-standard hover:border-slate-700 hover:shadow-xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-white">{channel.name}</h3>
          <p className="mt-1 truncate font-mono text-xs text-slate-500">
            ID {channel.telegramId}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
            channel.isActive
              ? 'bg-emerald-500/10 text-emerald-400'
              : 'bg-slate-700/50 text-slate-400'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              channel.isActive ? 'bg-emerald-400' : 'bg-slate-500'
            }`}
          />
          {channel.isActive ? 'Активен' : 'Отключён'}
        </span>
      </div>

      {channel.description && (
        <p className="mb-4 text-sm text-slate-400">{channel.description}</p>
      )}

      <div className="grid grid-cols-3 gap-3 border-t border-slate-800 pt-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Участники
          </p>
          <p className="mt-1 text-lg font-bold text-primary-300">
            {formatNumber(channel.memberCount)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Тариф
          </p>
          <p className="mt-1 text-lg font-bold text-secondary-300">
            {channel.subscriptionFee > 0
              ? formatMoney(channel.subscriptionFee, channel.currency)
              : '—'}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Создан
          </p>
          <p className="mt-1 text-sm text-slate-300">
            {formatDate(channel.createdAt).split(',')[0]}
          </p>
        </div>
      </div>
    </div>
  )
}
