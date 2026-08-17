/**
 * Выгрузка таблиц в Excel без внешних зависимостей.
 *
 * Формат — SpreadsheetML 2003 (XML внутри .xls): открывается Excel, LibreOffice,
 * Numbers и Google Sheets, поддерживает несколько листов, типы ячеек и числовые
 * форматы. Это позволяет отдать владельцу платформы один файл, где каждый разрез
 * статистики лежит на своём листе, и не тянуть в бандл xlsx-библиотеку.
 */

export type CellValue = string | number | Date | null | undefined

export type CellType = 'text' | 'number' | 'money' | 'percent' | 'date'

export interface SheetColumn<T> {
  header: string
  value: (row: T) => CellValue
  /** Тип влияет на числовой формат ячейки в Excel. По умолчанию — текст. */
  type?: CellType
  /** Ширина колонки в пикселях. */
  width?: number
}

export interface Sheet<T = Record<string, unknown>> {
  name: string
  columns: SheetColumn<T>[]
  rows: T[]
  /** Строки «параметр — значение» над таблицей: период, фильтры, пояснения. */
  preamble?: Array<[string, CellValue]>
}

const STYLE_BY_TYPE: Record<CellType, string> = {
  text: 'sText',
  number: 'sInt',
  money: 'sMoney',
  percent: 'sPercent',
  date: 'sDate',
}

/** Экранирование для XML-содержимого и атрибутов. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Управляющие символы Excel не переваривает.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
}

/** Excel запрещает : \ / ? * [ ] в имени листа и держит лимит в 31 символ. */
export function sanitizeSheetName(name: string, taken: Set<string> = new Set()): string {
  const base = (name.replace(/[:\\/?*[\]]/g, ' ').trim() || 'Лист').slice(0, 31)
  if (!taken.has(base)) {
    taken.add(base)
    return base
  }
  for (let i = 2; i < 1000; i += 1) {
    const suffix = ` (${i})`
    const candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`
    if (!taken.has(candidate)) {
      taken.add(candidate)
      return candidate
    }
  }
  taken.add(base)
  return base
}

function isoLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.000`
  )
}

function toDate(value: CellValue): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'string' && value) {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

/** Одна ячейка листа. Пустые значения отдаём пустой ячейкой, а не строкой «null». */
function cellXml(value: CellValue, type: CellType = 'text'): string {
  const style = ` ss:StyleID="${STYLE_BY_TYPE[type]}"`
  if (value === null || value === undefined || value === '') return `<Cell${style}/>`

  if (type === 'date') {
    const d = toDate(value)
    if (!d) return `<Cell${style}><Data ss:Type="String">${escapeXml(String(value))}</Data></Cell>`
    return `<Cell${style}><Data ss:Type="DateTime">${isoLocal(d)}</Data></Cell>`
  }

  if (type === 'number' || type === 'money' || type === 'percent') {
    const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
    if (!Number.isFinite(n)) {
      return `<Cell${style}><Data ss:Type="String">${escapeXml(String(value))}</Data></Cell>`
    }
    return `<Cell${style}><Data ss:Type="Number">${n}</Data></Cell>`
  }

  return `<Cell${style}><Data ss:Type="String">${escapeXml(String(value))}</Data></Cell>`
}

const STYLES = `<Styles>
 <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Bottom"/><Font ss:FontName="Calibri" ss:Size="11" ss:Color="#23324A"/></Style>
 <Style ss:ID="sHeader"><Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#F2EAD3"/><Interior ss:Color="#23324A" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:WrapText="1"/></Style>
 <Style ss:ID="sTitle"><Font ss:FontName="Calibri" ss:Size="13" ss:Bold="1" ss:Color="#23324A"/></Style>
 <Style ss:ID="sLabel"><Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#6B5B3E"/></Style>
 <Style ss:ID="sText"><Alignment ss:Vertical="Center"/></Style>
 <Style ss:ID="sInt"><NumberFormat ss:Format="#,##0"/></Style>
 <Style ss:ID="sMoney"><NumberFormat ss:Format="#,##0.00"/></Style>
 <Style ss:ID="sPercent"><NumberFormat ss:Format="0.0&quot;%&quot;"/></Style>
 <Style ss:ID="sDate"><NumberFormat ss:Format="dd.mm.yyyy hh:mm"/></Style>
</Styles>`

/** Закрепление строки заголовка, чтобы таблица не «уезжала» при прокрутке. */
function freezePanes(headerRow: number): string {
  return `<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
 <FreezePanes/><FrozenNoSplit/>
 <SplitHorizontal>${headerRow}</SplitHorizontal>
 <TopRowBottomPane>${headerRow}</TopRowBottomPane>
 <ActivePane>2</ActivePane>
</WorksheetOptions>`
}

function sheetXml<T>(sheet: Sheet<T>, name: string): string {
  const parts: string[] = []

  const cols = sheet.columns
    .map((c) => `<Column ss:AutoFitWidth="0" ss:Width="${c.width ?? 130}"/>`)
    .join('')

  let headerRow = 1
  if (sheet.preamble?.length) {
    for (const [label, value] of sheet.preamble) {
      parts.push(
        `<Row><Cell ss:StyleID="sLabel"><Data ss:Type="String">${escapeXml(label)}</Data></Cell>` +
          `${cellXml(value, value instanceof Date ? 'date' : typeof value === 'number' ? 'money' : 'text')}</Row>`,
      )
    }
    parts.push('<Row/>')
    headerRow = sheet.preamble.length + 2
  }

  parts.push(
    `<Row ss:Height="30">${sheet.columns
      .map((c) => `<Cell ss:StyleID="sHeader"><Data ss:Type="String">${escapeXml(c.header)}</Data></Cell>`)
      .join('')}</Row>`,
  )

  for (const row of sheet.rows) {
    parts.push(
      `<Row>${sheet.columns.map((c) => cellXml(c.value(row), c.type)).join('')}</Row>`,
    )
  }

  return `<Worksheet ss:Name="${escapeXml(name)}"><Table>${cols}${parts.join('')}</Table>${freezePanes(headerRow)}</Worksheet>`
}

/** Собирает книгу SpreadsheetML из листов. Пустые листы тоже попадают в файл. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildWorkbookXml(sheets: Sheet<any>[]): string {
  const taken = new Set<string>()
  const body = sheets.map((s) => sheetXml(s, sanitizeSheetName(s.name, taken))).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
${STYLES}
${body}
</Workbook>`
}

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
}

/**
 * Имя файла латиницей: Chromium молча выбрасывает атрибут download с
 * не-ASCII именем, и файл сохраняется как «download» без расширения.
 */
export function workbookFileName(prefix: string, from?: string, to?: string): string {
  const stamp = from && to ? `${from}_${to}` : new Date().toISOString().slice(0, 10)
  const ascii = prefix
    .toLowerCase()
    .split('')
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return `${ascii || 'report'}-${stamp}.xls`
}

/** Отдаёт книгу браузеру как файл (вызывать только на клиенте). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function downloadWorkbook(fileName: string, sheets: Sheet<any>[]): void {
  const xml = buildWorkbookXml(sheets)
  const blob = new Blob(['\ufeff', xml], { type: 'application/vnd.ms-excel;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Освобождаем ссылку после того, как браузер забрал файл.
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
