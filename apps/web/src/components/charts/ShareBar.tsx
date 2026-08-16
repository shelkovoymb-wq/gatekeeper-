'use client'

import { SERIES } from './chart-kit'

export interface ShareItem {
  key: string
  label: string
  value: number
  sharePct: number
  note?: string
}

interface Props {
  items: ShareItem[]
  formatValue: (n: number) => string
  emptyText?: string
}

/**
 * Доли в целом — горизонтальная накопительная полоса плюс подписанный список.
 * Круговую диаграмму намеренно не рисуем: доли рядом друг с другом сравнивать
 * легче по длине, чем по углу, а подписи не приходится прятать.
 */
export function ShareBar({ items, formatValue, emptyText = 'Нет платежей за период' }: Props) {
  const total = items.reduce((s, i) => s + i.value, 0)

  if (!items.length || total <= 0) {
    return <p className="py-8 text-center text-sm text-ledger-ink/45">{emptyText}</p>
  }

  return (
    <div>
      <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-sm">
        {items.map((item, i) => (
          <div
            key={item.key}
            style={{
              width: `${Math.max(1, (item.value / total) * 100)}%`,
              background: SERIES[i % SERIES.length],
            }}
            title={`${item.label}: ${formatValue(item.value)}`}
          />
        ))}
      </div>

      <ul className="mt-4 space-y-2">
        {items.map((item, i) => (
          <li key={item.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: SERIES[i % SERIES.length] }}
              />
              <span className="truncate text-ledger-ink">{item.label}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="font-ledger-mono font-bold text-ledger-ink">
                {formatValue(item.value)}
              </span>
              <span className="ml-2 font-ledger-mono text-xs text-ledger-ink/50">
                {item.sharePct.toLocaleString('ru-RU')}%
              </span>
              {item.note && <span className="ml-2 text-xs text-ledger-ink/45">{item.note}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
