import { createHmac } from 'node:crypto';

/**
 * Подпись вебхука Продамуса.
 *
 * Продамус подписывает не сырое тело, а канонический JSON, собранный по правилам
 * PHP `json_encode` на стороне шлюза. Отсюда все расхождения: HMAC от сырого тела
 * не сойдётся с их подписью никогда.
 *
 * Порядок (менять нельзя):
 *   1. рекурсивно отсортировать ключи по алфавиту, включая вложенные объекты;
 *   2. привести все скаляры к строкам: 1490 -> "1490", true -> "true", null -> "";
 *   3. JSON.stringify без пробелов, кириллица как есть;
 *   4. заменить "/" на "\/" — PHP экранирует слеши, JS нет, и любой URL внутри
 *      тела ломает подпись именно здесь;
 *   5. HMAC-SHA256 в hex.
 *
 * Алгоритм и эталонный вектор взяты из скилла prodamus-subscription
 * (.claude/skills/prodamus-subscription), там же лежит sign-check.mjs.
 */
export function canonicalize(data: unknown): unknown {
  if (Array.isArray(data)) return data.map(canonicalize);
  if (data !== null && typeof data === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(data as Record<string, unknown>).sort()) {
      out[key] = canonicalize((data as Record<string, unknown>)[key]);
    }
    return out;
  }
  // null и undefined в PHP-сериализации становятся пустой строкой, а не "null".
  if (data === null || data === undefined) return '';
  // Срезаем только хвостовые переводы строк: в form-urlencoded теле текстовое
  // поле может приехать с \r\n, которого не было в момент подписи. Обычные
  // пробелы значимы и не трогаются.
  return String(data).replace(/[\r\n]+$/, '');
}

/** Канонический payload — ровно та строка, которую подписывает шлюз. */
export function canonicalPayload(body: unknown): string {
  return JSON.stringify(canonicalize(body)).replace(/\//g, '\\/');
}

export function prodamusSignature(secret: string, body: unknown): string {
  return createHmac('sha256', secret).update(canonicalPayload(body), 'utf8').digest('hex');
}
