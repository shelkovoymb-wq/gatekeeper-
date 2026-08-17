import { describe, it, expect } from 'vitest'
import {
  buildWorkbookXml,
  escapeXml,
  sanitizeSheetName,
  workbookFileName,
  type Sheet,
} from '../../src/lib/xls'

interface Row {
  client: string
  amount: number
  pct: number
  when: string
  note?: string | null
}

const sheet: Sheet<Row> = {
  name: 'Клиенты',
  preamble: [
    ['Период', '01.08.2026 — 16.08.2026'],
    ['Оборот', 10000],
  ],
  columns: [
    { header: 'Клиент', value: (r) => r.client },
    { header: 'Сумма', value: (r) => r.amount, type: 'money' },
    { header: 'Комиссия, %', value: (r) => r.pct, type: 'percent' },
    { header: 'Дата', value: (r) => r.when, type: 'date' },
    { header: 'Примечание', value: (r) => r.note, type: 'text' },
  ],
  rows: [
    { client: 'Клуб «Инвесторы» & Ко', amount: 1500.5, pct: 10, when: '2026-08-14T09:00:00Z', note: null },
  ],
}

describe('buildWorkbookXml', () => {
  const xml = buildWorkbookXml([sheet])

  it('объявляет книгу Excel', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('progid="Excel.Sheet"')
    expect(xml).toContain('urn:schemas-microsoft-com:office:spreadsheet')
  })

  it('кладёт данные на именованный лист', () => {
    expect(xml).toContain('<Worksheet ss:Name="Клиенты">')
  })

  it('экранирует спецсимволы в значениях', () => {
    expect(xml).toContain('Клуб «Инвесторы» &amp; Ко')
    // Голых амперсандов в документе быть не должно — иначе Excel не откроет файл.
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#)/)
  })

  it('числа отдаёт числами, а не строками', () => {
    expect(xml).toContain('<Data ss:Type="Number">1500.5</Data>')
    expect(xml).toContain('ss:StyleID="sMoney"')
    expect(xml).toContain('ss:StyleID="sPercent"')
  })

  it('дату отдаёт типом DateTime', () => {
    expect(xml).toMatch(/<Data ss:Type="DateTime">2026-08-14T\d{2}:00:00\.000<\/Data>/)
  })

  it('пустое значение превращает в пустую ячейку, а не в «null»', () => {
    expect(xml).not.toContain('null')
    expect(xml).toContain('<Cell ss:StyleID="sText"/>')
  })

  it('пишет преамбулу и закрепляет строку заголовка под ней', () => {
    expect(xml).toContain('Период')
    // 2 строки преамбулы + пустая строка → заголовок в 4-й строке
    expect(xml).toContain('<SplitHorizontal>4</SplitHorizontal>')
  })

  it('собирает несколько листов в одну книгу', () => {
    const multi = buildWorkbookXml([sheet, { ...sheet, name: 'Каналы' }])
    expect(multi.match(/<Worksheet /g)).toHaveLength(2)
  })

  it('переживает лист без строк', () => {
    const empty = buildWorkbookXml([{ ...sheet, rows: [], preamble: undefined }])
    expect(empty).toContain('<Worksheet ss:Name="Клиенты">')
    expect(empty).toContain('<SplitHorizontal>1</SplitHorizontal>')
  })

  it('не ломается на некорректной дате', () => {
    const broken = buildWorkbookXml([
      { ...sheet, rows: [{ ...sheet.rows[0], when: 'не дата' }] },
    ])
    expect(broken).toContain('<Data ss:Type="String">не дата</Data>')
  })
})

describe('sanitizeSheetName', () => {
  it('чистит запрещённые символы', () => {
    expect(sanitizeSheetName('Платежи: 08/2026 [все]')).toBe('Платежи  08 2026  все')
  })

  it('обрезает до 31 символа', () => {
    expect(sanitizeSheetName('я'.repeat(50))).toHaveLength(31)
  })

  it('разводит одинаковые имена', () => {
    const taken = new Set<string>()
    expect(sanitizeSheetName('Клиенты', taken)).toBe('Клиенты')
    expect(sanitizeSheetName('Клиенты', taken)).toBe('Клиенты (2)')
    expect(sanitizeSheetName('Клиенты', taken)).toBe('Клиенты (3)')
  })

  it('подставляет имя по умолчанию для пустого', () => {
    expect(sanitizeSheetName('   ')).toBe('Лист')
  })
})

describe('escapeXml', () => {
  it('вычищает управляющие символы', () => {
    expect(escapeXml('ab\u0007c')).toBe('abc')
  })

  it('экранирует всю пятёрку XML-символов', () => {
    expect(escapeXml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&apos;')
  })

  it('сохраняет перевод строки', () => {
    expect(escapeXml('a\nb')).toBe('a\nb')
  })
})

describe('workbookFileName', () => {
  it('переводит имя в латиницу — Chromium игнорирует не-ASCII в атрибуте download', () => {
    expect(workbookFileName('gatekeeper-статистика', '2026-08-01', '2026-08-16')).toBe(
      'gatekeeper-statistika-2026-08-01_2026-08-16.xls',
    )
  })

  it('схлопывает пробелы и служебные символы в дефисы', () => {
    expect(workbookFileName('gatekeeper-кто кому заплатил', '2026-08-01', '2026-08-16')).toBe(
      'gatekeeper-kto-komu-zaplatil-2026-08-01_2026-08-16.xls',
    )
  })

  it('в имени файла остаются только безопасные символы', () => {
    expect(workbookFileName('Отчёт: платежи/каналы', '2026-08-01', '2026-08-16')).toMatch(
      /^[a-z0-9._-]+\.xls$/,
    )
  })

  it('не оставляет пустое имя', () => {
    expect(workbookFileName('«»', '2026-08-01', '2026-08-16')).toBe(
      'report-2026-08-01_2026-08-16.xls',
    )
  })

  it('без периода подставляет сегодняшнюю дату', () => {
    expect(workbookFileName('otchet')).toMatch(/^otchet-\d{4}-\d{2}-\d{2}\.xls$/)
  })
})
