/**
 * Приведение разметки поста к тому подмножеству HTML, которое понимает Telegram.
 *
 * Telegram разбирает parse_mode=HTML сам и на чужом теге отвечает 400
 * «can't parse entities» — пост при этом не уходит вовсе. Поэтому чистим на
 * входе, при сохранении, а не при отправке: клиент должен увидеть отказ сразу
 * в редакторе, а не через час, когда сработает отложенная публикация.
 *
 * Список тегов — из документации Bot API (раздел HTML style).
 */

/** Теги, которые Telegram понимает. Всё остальное выбрасываем, текст оставляем. */
const ALLOWED = new Set([
  'b',
  'strong',
  'i',
  'em',
  'u',
  'ins',
  's',
  'strike',
  'del',
  'a',
  'code',
  'pre',
  'blockquote',
  'span',
  'tg-spoiler',
  'tg-emoji',
]);

/** У каждого тега — свой белый список атрибутов, остальные срезаем. */
const ALLOWED_ATTRS: Record<string, string[]> = {
  a: ['href'],
  code: ['class'],
  span: ['class'],
  blockquote: ['expandable'],
  'tg-emoji': ['emoji-id'],
};

/** Тег без закрывающей пары. У Telegram таких в разметке нет. */
const VOID_TAGS = new Set(['br', 'hr', 'img']);

const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:[^<>"']|"[^"]*"|'[^']*')*)>/g;
const ATTR_RE = /([a-zA-Z][a-zA-Z0-9-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

/** Экранируем то, что вне тегов. Уже готовые сущности не трогаем дважды. */
function escapeText(text: string): string {
  return text
    .replace(/&(?!(?:amp|lt|gt|quot|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
  return value.replace(/&(?!(?:amp|lt|gt|quot);)/g, '&amp;').replace(/"/g, '&quot;');
}

/** Ссылка: только http(s), tg: и mailto. javascript: в href — путь к XSS у тех, кто отрисует пост у себя. */
function safeHref(value: string): string | null {
  const href = value.trim();
  if (/^(https?:|tg:|mailto:)/i.test(href)) return href;
  return null;
}

function renderAttrs(tag: string, raw: string): string | null {
  const allowed = ALLOWED_ATTRS[tag];
  if (!allowed) return '';

  const out: string[] = [];
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(raw))) {
    const name = m[1].toLowerCase();
    if (!allowed.includes(name)) continue;
    const value = m[2] ?? m[3] ?? m[4] ?? '';

    if (tag === 'a' && name === 'href') {
      const href = safeHref(value);
      // Ссылка с недопустимой схемой — не «оставить как есть»: выбрасываем весь
      // тег <a>, текст при этом сохраняется.
      if (!href) return null;
      out.push(`href="${escapeAttr(href)}"`);
      continue;
    }
    if (name === 'expandable') {
      out.push('expandable');
      continue;
    }
    out.push(`${name}="${escapeAttr(value)}"`);
  }
  return out.length ? ` ${out.join(' ')}` : '';
}

/**
 * Вычистить разметку. Незакрытые теги закрываются, лишние закрывающие
 * выбрасываются: Telegram отвергает несбалансированную разметку целиком.
 */
export function sanitizeTelegramHtml(input: string): string {
  if (!input) return '';

  const out: string[] = [];
  const stack: string[] = [];
  let last = 0;

  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(input))) {
    out.push(escapeText(input.slice(last, m.index)));
    last = m.index + m[0].length;

    const tag = m[1].toLowerCase();
    const closing = m[0].startsWith('</');

    if (VOID_TAGS.has(tag)) {
      // <br> в тексте — это перевод строки, Telegram его в разметке не знает.
      if (tag === 'br') out.push('\n');
      continue;
    }
    if (!ALLOWED.has(tag)) continue;

    if (closing) {
      const at = stack.lastIndexOf(tag);
      if (at === -1) continue; // закрывающий без открывающего — мусор
      // Закрываем всё, что осталось открытым внутри: <b><i></b> → <b><i></i></b>.
      for (let i = stack.length - 1; i > at; i -= 1) out.push(`</${stack[i]}>`);
      out.push(`</${tag}>`);
      stack.splice(at);
      continue;
    }

    const attrs = renderAttrs(tag, m[2] ?? '');
    if (attrs === null) continue; // тег отброшен целиком (например, javascript:)
    out.push(`<${tag}${attrs}>`);
    stack.push(tag);
  }

  out.push(escapeText(input.slice(last)));
  for (let i = stack.length - 1; i >= 0; i -= 1) out.push(`</${stack[i]}>`);

  return out.join('');
}

/** Длина текста без разметки — по ней Telegram считает лимит сообщения. */
export function plainLength(html: string): number {
  const text = html
    .replace(TAG_RE, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
  return [...text].length;
}

/** Лимит обычного сообщения Telegram. */
export const MESSAGE_LIMIT = 4096;
/** Лимит подписи к вложению. */
export const CAPTION_LIMIT = 1024;
