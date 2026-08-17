'use client'

import { SERIES } from './chart-kit'

export interface BarListItem {
  id: string
  label: string
  sublabel?: string
  value: number
  /** Дополнительное значение справа — например комиссия платформы. */
  extra?: string
}

interface Props {
  items: BarListItem[]
  formatValue: (n: number) => string
  emptyText?: string
  color?: string
  onSelect?: (id: string) => void
}

/**
 * Горизонтальные полосы для рейтингов «топ клиентов / топ каналов».
 * Значение подписано у каждой полосы — цифра не спрятана в тултип.
 */
export function BarList({
  items,
  formatValue,
  emptyText = 'Нет данных за период',
  color = SERIES[0],
  onSelect,
}: Props) {
  const max = Math.max(0, ...items.map((i) => i.value))

  if (!items.length || max <= 0) {
    return <p className="py-8 text-center text-sm text-ledger-ink/45">{emptyText}</p>
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const pct = Math.max(1.5, (item.value / max) * 100)
        const Row = (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm font-bold text-ledger-ink" title={item.label}>
                {item.label}
              </span>
              <span className="shrink-0 font-ledger-mono text-sm font-bold text-ledger-ink">
                {formatValue(item.value)}
              </span>
            </div>
            <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-sm bg-ledger-ink/8">
              <div className="h-full rounded-sm" style={{ width: `${pct}%`, background: color }} />
            </div>
            {(item.sublabel || item.extra) && (
              <div className="mt-1 flex items-baseline justify-between gap-3 text-xs text-ledger-ink/50">
                <span className="truncate">{item.sublabel}</span>
                <span className="shrink-0 font-ledger-mono">{item.extra}</span>
              </div>
            )}
          </>
        )

        return (
          <li key={item.id}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                className="w-full rounded-sm px-1 py-1 text-left transition-colors hover:bg-ledger-ink/5"
              >
                {Row}
              </button>
            ) : (
              <div className="px-1 py-1">{Row}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
