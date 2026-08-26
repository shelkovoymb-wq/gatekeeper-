import { describe, it, expect } from 'vitest';
import { sanitizeTelegramHtml, plainLength } from './telegram-html.js';

describe('Разметка поста для Telegram', () => {
  it('оставляет разрешённые теги как есть', () => {
    expect(sanitizeTelegramHtml('<b>жирно</b> и <i>курсив</i>')).toBe(
      '<b>жирно</b> и <i>курсив</i>',
    );
    expect(sanitizeTelegramHtml('<u>x</u><s>y</s><code>z</code><pre>p</pre>')).toBe(
      '<u>x</u><s>y</s><code>z</code><pre>p</pre>',
    );
  });

  it('выбрасывает неизвестный тег, сохраняя текст', () => {
    // Telegram на <div> отвечает 400 и не публикует пост вовсе.
    expect(sanitizeTelegramHtml('<div>текст</div>')).toBe('текст');
    expect(sanitizeTelegramHtml('<p>абзац</p>')).toBe('абзац');
  });

  it('превращает <br> в перевод строки', () => {
    expect(sanitizeTelegramHtml('строка<br>вторая')).toBe('строка\nвторая');
  });

  it('срезает <script> целиком по содержимому тега', () => {
    expect(sanitizeTelegramHtml('<script>alert(1)</script>')).toBe('alert(1)');
  });

  it('закрывает незакрытый тег', () => {
    expect(sanitizeTelegramHtml('<b>жирно')).toBe('<b>жирно</b>');
  });

  it('выбрасывает закрывающий тег без открывающего', () => {
    expect(sanitizeTelegramHtml('текст</b>')).toBe('текст');
  });

  it('чинит перехлёст тегов', () => {
    expect(sanitizeTelegramHtml('<b>а<i>б</b>в</i>')).toBe('<b>а<i>б</i></b>в');
  });

  it('оставляет href только у разрешённых схем', () => {
    expect(sanitizeTelegramHtml('<a href="https://ok.ru">тут</a>')).toBe(
      '<a href="https://ok.ru">тут</a>',
    );
    expect(sanitizeTelegramHtml('<a href="tg://user?id=1">тут</a>')).toBe(
      '<a href="tg://user?id=1">тут</a>',
    );
  });

  it('выбрасывает ссылку с javascript:, оставляя текст', () => {
    expect(sanitizeTelegramHtml('<a href="javascript:alert(1)">жми</a>')).toBe('жми');
  });

  it('срезает посторонние атрибуты', () => {
    expect(sanitizeTelegramHtml('<b onclick="hack()">x</b>')).toBe('<b>x</b>');
    expect(sanitizeTelegramHtml('<a href="https://a.ru" onmouseover="x">y</a>')).toBe(
      '<a href="https://a.ru">y</a>',
    );
  });

  it('оставляет спойлер и подсветку кода', () => {
    expect(sanitizeTelegramHtml('<span class="tg-spoiler">тс</span>')).toBe(
      '<span class="tg-spoiler">тс</span>',
    );
    expect(sanitizeTelegramHtml('<code class="language-js">x</code>')).toBe(
      '<code class="language-js">x</code>',
    );
    expect(sanitizeTelegramHtml('<tg-spoiler>тс</tg-spoiler>')).toBe(
      '<tg-spoiler>тс</tg-spoiler>',
    );
  });

  it('экранирует голые угловые скобки и амперсанд', () => {
    expect(sanitizeTelegramHtml('5 < 7 & 8 > 6')).toBe('5 &lt; 7 &amp; 8 &gt; 6');
  });

  it('не экранирует уже готовые сущности дважды', () => {
    expect(sanitizeTelegramHtml('&amp; &lt; &gt;')).toBe('&amp; &lt; &gt;');
  });

  it('пустая строка остаётся пустой', () => {
    expect(sanitizeTelegramHtml('')).toBe('');
  });

  it('цитата с expandable сохраняется', () => {
    expect(sanitizeTelegramHtml('<blockquote expandable>ц</blockquote>')).toBe(
      '<blockquote expandable>ц</blockquote>',
    );
  });
});

describe('plainLength', () => {
  it('считает символы без разметки', () => {
    expect(plainLength('<b>абв</b>')).toBe(3);
  });

  it('сущность считается одним символом', () => {
    expect(plainLength('&amp;')).toBe(1);
  });

  it('эмодзи считается по кодовым точкам, а не по UTF-16', () => {
    expect(plainLength('🙂')).toBe(1);
  });
});
