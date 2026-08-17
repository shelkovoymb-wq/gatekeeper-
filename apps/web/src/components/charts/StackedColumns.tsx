'use client'

import { useState } from 'react'
import {
  CHART_SURFACE,
  GRID,
  INK,
  INK_MUTED,
  axisTicks,
  columnPath,
  labelStride,
  niceScale,
  useElementWidth,
} from './chart-kit'

export interface ColumnSeries {
  key: string
  label: string
  color: string
}

export interface ColumnPoint {
  label: string
  /** Значения по сериям в том же порядке, что и series: снизу вверх. */
  values: number[]
  /** Подпись для подсказки — например полная дата. */
  hint?: string
}

interface Props {
  points: ColumnPoint[]
  series: ColumnSeries[]
  formatValue: (n: number) => string
  formatAxis: (n: number) => string
  height?: number
  emptyText?: string
}

const PAD = { top: 12, right: 8, bottom: 26, left: 56 }
/** Зазор цветом поверхности между сегментами стопки. */
const SEGMENT_GAP = 2

/**
 * Столбчатый график с накоплением: высота столбца — общий оборот периода,
 * сегменты — из чего он состоит. Одна ось, одна единица измерения.
 */
export function StackedColumns({
  points,
  series,
  formatValue,
  formatAxis,
  height = 260,
  emptyText = 'Нет данных за период',
}: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  const totals = points.map((p) => p.values.reduce((s, v) => s + Math.max(0, v), 0))
  const maxTotal = Math.max(0, ...totals)
  const hasData = points.length > 0 && maxTotal > 0

  const plotW = Math.max(80, width - PAD.left - PAD.right)
  const plotH = height - PAD.top - PAD.bottom
  const scale = niceScale(maxTotal)
  const ticks = axisTicks(maxTotal)
  const band = points.length ? plotW / points.length : plotW
  const barW = Math.max(3, Math.min(24, band * 0.62))
  const stride = labelStride(points.length, plotW)
  const y = (value: number) => PAD.top + plotH - (value / scale.max) * plotH

  return (
    <div ref={ref} className="relative w-full">
      {!hasData && (
        <div className="flex h-[260px] items-center justify-center text-sm text-ledger-ink/45">
          {emptyText}
        </div>
      )}

      {hasData && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`График: ${series.map((s) => s.label).join(' и ')}`}
          onMouseLeave={() => setHover(null)}
        >
          {/* Сетка и подписи оси значений */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
              <text
                x={PAD.left - 8}
                y={y(t) + 4}
                textAnchor="end"
                fontSize={11}
                fill={INK_MUTED}
                className="font-ledger-mono"
              >
                {formatAxis(t)}
              </text>
            </g>
          ))}

          {points.map((point, i) => {
            const x = PAD.left + band * i + (band - barW) / 2
            let cursor = PAD.top + plotH
            const isHover = hover === i

            return (
              <g key={`${point.label}-${i}`}>
                {/* Прозрачная зона наведения шире столбца — попасть проще */}
                <rect
                  x={PAD.left + band * i}
                  y={PAD.top}
                  width={band}
                  height={plotH}
                  fill={isHover ? 'rgba(35,50,74,0.05)' : 'transparent'}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  tabIndex={0}
                  role="button"
                  aria-label={`${point.hint ?? point.label}: ${formatValue(totals[i])}`}
                />
                {series.map((s, si) => {
                  const value = Math.max(0, point.values[si] ?? 0)
                  if (value <= 0) return null
                  const rawH = (value / scale.max) * plotH
                  const isTop = point.values.slice(si + 1).every((v) => (v ?? 0) <= 0)
                  const h = Math.max(1, rawH - (isTop ? 0 : SEGMENT_GAP))
                  cursor -= rawH
                  return (
                    <path
                      key={s.key}
                      d={columnPath(x, cursor, barW, h, isTop ? 4 : 0)}
                      fill={s.color}
                      opacity={hover === null || isHover ? 1 : 0.45}
                      pointerEvents="none"
                    />
                  )
                })}
              </g>
            )
          })}

          {/* Ось X */}
          <line
            x1={PAD.left}
            x2={PAD.left + plotW}
            y1={PAD.top + plotH}
            y2={PAD.top + plotH}
            stroke={GRID}
            strokeWidth={1}
          />
          {points.map((point, i) =>
            i % stride === 0 ? (
              <text
                key={`label-${i}`}
                x={PAD.left + band * i + band / 2}
                y={height - 8}
                textAnchor="middle"
                fontSize={11}
                fill={INK_MUTED}
                className="font-ledger-mono"
              >
                {point.label}
              </text>
            ) : null,
          )}
        </svg>
      )}

      {/* Подсказка по наведению */}
      {hasData && hover !== null && points[hover] && (
        <div
          className="pointer-events-none absolute z-10 min-w-[180px] -translate-x-1/2 rounded-sm border border-ledger-ink/15 bg-ledger-page px-3 py-2 text-xs shadow-lg"
          style={{
            left: Math.min(
              Math.max(PAD.left + band * hover + band / 2, 96),
              Math.max(width - 96, 96),
            ),
            top: 4,
            backgroundColor: CHART_SURFACE,
          }}
        >
          <p className="font-ledger-mono text-[11px] uppercase tracking-wide text-ledger-ink/50">
            {points[hover].hint ?? points[hover].label}
          </p>
          {series.map((s, si) => (
            <p key={s.key} className="mt-1 flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-ledger-ink/70">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="font-bold" style={{ color: INK }}>
                {formatValue(points[hover].values[si] ?? 0)}
              </span>
            </p>
          ))}
          {series.length > 1 && (
            <p className="mt-1 flex items-center justify-between gap-3 border-t border-ledger-ink/10 pt-1 text-ledger-ink/70">
              <span>Всего</span>
              <span className="font-bold text-ledger-ink">{formatValue(totals[hover])}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** Легенда: идентичность серии не должна держаться только на цвете. */
export function ChartLegend({ series }: { series: ColumnSeries[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
      {series.map((s) => (
        <span key={s.key} className="flex items-center gap-2 text-xs text-ledger-ink/70">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  )
}
