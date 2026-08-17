/** Форматирование денег/чисел/дат под русскую локаль. */

export function formatMoney(amount: number, currency = 'RUB'): string {
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${amount.toLocaleString('ru-RU')} ${currency}`
  }
}

export function formatNumber(n: number): string {
  return n.toLocaleString('ru-RU')
}

/** Короткая запись больших чисел для осей графиков: 1,2 млн / 340 тыс. */
export function formatCompact(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return `${trim(n / 1_000_000_000)} млрд`
  if (abs >= 1_000_000) return `${trim(n / 1_000_000)} млн`
  if (abs >= 10_000) return `${trim(n / 1000)} тыс`
  return formatNumber(Math.round(n * 100) / 100)
}

function trim(n: number): string {
  const rounded = Math.round(n * 10) / 10
  return String(rounded).replace('.', ',')
}

/** Дата без времени — для подписей периода и колонок таблиц. */
export function formatDay(value?: string): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatDate(value?: string): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
