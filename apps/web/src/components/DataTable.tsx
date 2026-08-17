'use client'

import { useMemo, useState, type ReactNode } from 'react'
import clsx from 'clsx'

export interface DataColumn<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  /** Значение для сортировки. Если не задано — колонка не сортируется. */
  sortValue?: (row: T) => number | string | null
  align?: 'left' | 'right'
  /** Подсказка в заголовке — чтобы объяснить, как считается колонка. */
  hint?: string
}

interface Props<T> {
  columns: DataColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  empty?: string
  initialSort?: { key: string; dir: 'asc' | 'desc' }
  minWidth?: number
  /** Ограничение видимых строк с кнопкой «показать ещё». */
  pageSize?: number
}

/** Сортируемая таблица на кремовой «странице гроссбуха». */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty = 'Нет данных',
  initialSort,
  minWidth = 900,
  pageSize,
}: Props<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null)
  const [shown, setShown] = useState(pageSize ?? Infinity)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col?.sortValue) return rows
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a)
      const bv = col.sortValue!(b)
      if (av === null || av === undefined) return 1
      if (bv === null || bv === undefined) return -1
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv), 'ru') * dir
    })
  }, [rows, sort, columns])

  const visible = sorted.slice(0, shown)

  const toggle = (key: string) => {
    setSort((prev) =>
      prev?.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'desc' },
    )
  }

  if (!rows.length) {
    return (
      <div className="rounded-sm border border-dashed border-ledger-page/20 p-10 text-center text-sm text-ledger-page/55">
        {empty}
      </div>
    )
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-sm border border-ledger-page/15">
        <table className="w-full text-left text-sm" style={{ minWidth }}>
          <thead>
            <tr className="border-b border-ledger-page/15 bg-ledger-cover font-ledger-mono text-xs uppercase tracking-wide text-ledger-brass">
              {columns.map((col) => {
                const sortable = Boolean(col.sortValue)
                const active = sort?.key === col.key
                return (
                  <th
                    key={col.key}
                    scope="col"
                    title={col.hint}
                    className={clsx(
                      'px-4 py-3 font-medium',
                      col.align === 'right' ? 'text-right' : 'text-left',
                    )}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggle(col.key)}
                        className={clsx(
                          'inline-flex items-center gap-1 transition-colors hover:text-ledger-page',
                          active && 'text-ledger-page',
                        )}
                      >
                        {col.header}
                        <span aria-hidden className="text-[10px]">
                          {active ? (sort?.dir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    ) : (
                      col.header
                    )}
                    {col.hint && <span className="ml-1 text-ledger-page/40" aria-hidden>ⓘ</span>}
                  </th>
                )
              })}
            </tr>
          </thead>
          {/* Цвет текста задаём явно: страница вокруг тёмная и красит текст в
              кремовый, а тело таблицы лежит на кремовой «бумаге». */}
          <tbody className="divide-y divide-ledger-ink/10 bg-ledger-page text-ledger-ink">
            {visible.map((row) => (
              <tr key={rowKey(row)} className="transition-colors hover:bg-ledger-ink/5">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={clsx(
                      'px-4 py-3 align-middle',
                      col.align === 'right' ? 'text-right' : 'text-left',
                    )}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sorted.length > visible.length && (
        <button
          type="button"
          onClick={() => setShown((n) => n + (pageSize ?? 50))}
          className="mt-3 w-full rounded-sm border border-ledger-page/20 px-4 py-2 text-sm font-bold text-ledger-page/80 transition-colors hover:bg-ledger-page/5"
        >
          Показать ещё {Math.min(pageSize ?? 50, sorted.length - visible.length)} из{' '}
          {sorted.length - visible.length}
        </button>
      )}
    </div>
  )
}
