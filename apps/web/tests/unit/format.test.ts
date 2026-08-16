import { describe, it, expect } from 'vitest'
import { formatMoney, formatNumber, formatDate, formatCompact, formatDay } from '@/lib/format'

// Intl вставляет неразрывные пробелы — сравнивать по подстрокам надёжнее,
// чем по точной строке, которая зависит от версии ICU.
describe('formatMoney', () => {
  it('форматирует рубли с символом валюты', () => {
    const out = formatMoney(1250000)
    expect(out).toContain('₽')
    expect(out.replace(/\s| | /g, '')).toContain('1250000')
  })

  it('показывает ноль, а не пустую строку', () => {
    expect(formatMoney(0)).toContain('0')
  })

  it('сохраняет знак у отрицательной суммы', () => {
    expect(formatMoney(-500)).toMatch(/-|−/)
  })

  it('не падает на неизвестном коде валюты', () => {
    expect(() => formatMoney(100, 'НЕВАЛЮТА')).not.toThrow()
    expect(formatMoney(100, 'НЕВАЛЮТА')).toContain('100')
  })
})

describe('formatNumber', () => {
  it('группирует разряды', () => {
    expect(formatNumber(1234567).replace(/\s| | /g, '')).toBe('1234567')
  })

  it('оставляет малые числа как есть', () => {
    expect(formatNumber(42)).toBe('42')
  })
})

describe('formatCompact', () => {
  it('сокращает крупные суммы для оси графика', () => {
    expect(formatCompact(2_400_000)).toBe('2,4 млн')
    expect(formatCompact(340_000)).toBe('340 тыс')
    expect(formatCompact(1_500_000_000)).toBe('1,5 млрд')
  })

  it('мелкие числа оставляет читаемыми', () => {
    expect(formatCompact(0)).toBe('0')
    expect(formatCompact(950)).toBe('950')
  })
})

describe('formatDay', () => {
  it('печатает дату без времени', () => {
    expect(formatDay('2026-08-13')).toBe('13.08.2026')
  })

  it('отдаёт прочерк на пустом и битом значении', () => {
    expect(formatDay()).toBe('—')
    expect(formatDay('не-дата')).toBe('—')
  })
})

describe('formatDate', () => {
  it('отдаёт прочерк на пустом значении', () => {
    expect(formatDate()).toBe('—')
    expect(formatDate('')).toBe('—')
  })

  it('отдаёт прочерк на неразбираемой дате вместо Invalid Date', () => {
    expect(formatDate('не-дата')).toBe('—')
  })

  it('печатает день, месяц и год для валидной ISO-даты', () => {
    const out = formatDate('2026-08-13T15:00:00Z')
    expect(out).toContain('2026')
    expect(out).toMatch(/\d{2}\.\d{2}\.\d{4}/)
  })
})
