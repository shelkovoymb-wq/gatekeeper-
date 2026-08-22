import { timingSafeEqual } from 'node:crypto'

/**
 * Серверная часть OAuth-хелперов. Вынесена из `oauth.ts`, потому что тот
 * импортируют клиентские компоненты, а node:crypto в браузерный бандл не
 * собирается.
 *
 * Сравнение state из cookie и из query — за константное время: время ответа
 * не должно подсказывать, какой префикс state угадан верно.
 */
export function statesEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a ?? '', 'utf8')
  const bb = Buffer.from(b ?? '', 'utf8')
  // Пустой state не совпадает ни с чем: отсутствие cookie не должно
  // проходить проверку «оба пустые».
  if (ba.length === 0 || ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}
