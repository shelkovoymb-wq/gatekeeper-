'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Общая механика графиков: палитра, «круглые» деления оси и замер ширины
 * контейнера. Графики рисуем сами на SVG — библиотека ради четырёх форм
 * тянула бы в бандл сотни килобайт.
 */

/** Поверхность карточки, на которой лежат графики (ledger.page). */
export const CHART_SURFACE = '#F2EAD3'

/**
 * Категориальные слоты назначаются по порядку и никогда не «прокручиваются».
 * Порядок проверен на различимость при дальтонизме на кремовой поверхности.
 */
export const SERIES = [
  '#2a78d6', // 1 — синий
  '#eb6834', // 2 — оранжевый
  '#1baf7a', // 3 — бирюзовый
  '#eda100', // 4 — жёлтый
  '#e87ba4', // 5 — маджента
  '#008300', // 6 — зелёный
] as const

export const INK = '#23324A'
export const INK_MUTED = 'rgba(35,50,74,0.55)'
export const GRID = 'rgba(35,50,74,0.16)'

/** Ширина контейнера в пикселях — чтобы рисовать SVG без искажения текста. */
export function useElementWidth<T extends HTMLElement>(): [
  (node: T | null) => void,
  number,
] {
  const [width, setWidth] = useState(720)
  const observer = useRef<ResizeObserver | null>(null)

  useEffect(() => () => observer.current?.disconnect(), [])

  const ref = useCallback((node: T | null) => {
    observer.current?.disconnect()
    if (!node) return
    setWidth(node.clientWidth || 720)
    if (typeof ResizeObserver === 'undefined') return
    observer.current = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w && Math.abs(w - width) > 1) setWidth(w)
    })
    observer.current.observe(node)
    // width намеренно не в зависимостях: пересоздавать наблюдатель на каждый
    // пиксель ресайза не нужно, значение читается по замыканию только для
    // отсечки дребезга.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return [ref, width]
}

/** Верхняя граница оси и шаг, округлённые до «человеческих» чисел. */
export function niceScale(max: number, ticks = 4): { max: number; step: number } {
  if (!Number.isFinite(max) || max <= 0) return { max: 1, step: 1 }
  const rough = max / ticks
  const pow = Math.pow(10, Math.floor(Math.log10(rough)))
  const candidates = [1, 2, 2.5, 5, 10].map((m) => m * pow)
  const step = candidates.find((c) => c >= rough) ?? candidates[candidates.length - 1]
  return { max: Math.ceil(max / step) * step, step }
}

/** Деления оси от нуля до максимума включительно. */
export function axisTicks(max: number, ticks = 4): number[] {
  const scale = niceScale(max, ticks)
  const out: number[] = []
  for (let v = 0; v <= scale.max + scale.step / 2; v += scale.step) out.push(v)
  return out
}

/**
 * Прямоугольник со скруглённым верхом и прямым основанием — форма столбца.
 * При маленькой высоте радиус ужимается, иначе столбик «схлопывается» в каплю.
 */
export function columnPath(x: number, y: number, w: number, h: number, r = 4): string {
  const radius = Math.max(0, Math.min(r, w / 2, h))
  const bottom = y + h
  return [
    `M${x},${bottom}`,
    `L${x},${y + radius}`,
    `Q${x},${y} ${x + radius},${y}`,
    `L${x + w - radius},${y}`,
    `Q${x + w},${y} ${x + w},${y + radius}`,
    `L${x + w},${bottom}`,
    'Z',
  ].join(' ')
}

/** Показываем не каждую подпись оси X, иначе они наезжают друг на друга. */
export function labelStride(count: number, plotWidth: number, minGap = 52): number {
  if (count <= 1) return 1
  const fits = Math.max(1, Math.floor(plotWidth / minGap))
  return Math.ceil(count / fits)
}
