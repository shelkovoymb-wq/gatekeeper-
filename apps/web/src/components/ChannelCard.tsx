import type { Channel } from '@/types'
import { formatMoney, formatNumber, formatDate } from '@/lib/format'

interface ChannelCardProps {
  channel: Channel
}

export function ChannelCard({ channel }: ChannelCardProps) {
  return (
    <div className="rounded-sm bg-ledger-page p-6 text-ledger-ink shadow-[4px_6px_0_0_rgba(0,0,0,0.25)] transition hover:-translate-y-0.5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-lg text-ledger-ink">{channel.name}</h3>
          <p className="mt-1 truncate font-ledger-mono text-xs text-ledger-ink/45">
            ID {channel.telegramId}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-sm px-3 py-1 font-ledger-mono text-xs uppercase tracking-wide ${
            channel.isActive ? 'bg-success/15 text-emerald-700' : 'bg-ledger-ink/10 text-ledger-ink/50'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${channel.isActive ? 'bg-emerald-600' : 'bg-ledger-ink/40'}`} />
          {channel.isActive ? 'Активен' : 'Отключён'}
        </span>
      </div>

      {channel.description && <p className="mb-4 text-sm text-ledger-ink/60">{channel.description}</p>}

      <div className="grid grid-cols-3 gap-3 border-t border-dashed border-ledger-ink/15 pt-4">
        <div>
          <p className="font-ledger-mono text-[11px] uppercase tracking-wide text-ledger-ink/45">Участники</p>
          <p className="mt-1 text-lg font-bold text-ledger-ink">{formatNumber(channel.memberCount)}</p>
        </div>
        <div>
          <p className="font-ledger-mono text-[11px] uppercase tracking-wide text-ledger-ink/45">Тариф</p>
          <p className="mt-1 text-lg font-bold text-ledger-stamp">
            {channel.subscriptionFee > 0 ? formatMoney(channel.subscriptionFee, channel.currency) : '—'}
          </p>
        </div>
        <div>
          <p className="font-ledger-mono text-[11px] uppercase tracking-wide text-ledger-ink/45">Создан</p>
          <p className="mt-1 text-sm text-ledger-ink/70">{formatDate(channel.createdAt).split(',')[0]}</p>
        </div>
      </div>
    </div>
  )
}
