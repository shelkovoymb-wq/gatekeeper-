'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface Channel {
  id: string
  name: string
}

interface PostMedia {
  mediaType: string
  fileId: string | null
  storagePath: string | null
  fileName: string | null
  fileSize: number | null
}

interface PostTarget {
  channelId: string
  messageId: number | null
  error: string | null
}

interface Post {
  id: string
  bodyHtml: string
  status: 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed'
  publishAt: string | null
  publishedAt: string | null
  error: string | null
  disablePreview: boolean
  channelIds: string[]
  targets: PostTarget[]
  media: PostMedia[]
}

interface AddonStatus {
  code: string
  name: string
  description: string | null
  priceMonth: number
  currency: string
  periodDays: number
  status: string
  expiresAt: string | null
  daysLeft: number | null
  hasAccess: boolean
  paymentUrl: string | null
}

const statusLabels: Record<Post['status'], { label: string; tone: string }> = {
  draft: { label: 'Черновик', tone: 'bg-ledger-ink/10 text-ledger-ink/70' },
  scheduled: { label: 'Запланирован', tone: 'bg-blue-500/15 text-blue-700' },
  publishing: { label: 'Публикуется', tone: 'bg-amber-500/15 text-amber-700' },
  published: { label: 'Опубликован', tone: 'bg-emerald-500/15 text-emerald-700' },
  failed: { label: 'Ошибка', tone: 'bg-danger/15 text-red-700' },
}

/** Кнопки разметки вставляют ровно те теги, которые понимает Telegram. */
const markupButtons = [
  { label: 'Ж', title: 'Жирный', open: '<b>', close: '</b>' },
  { label: 'К', title: 'Курсив', open: '<i>', close: '</i>' },
  { label: 'П', title: 'Подчёркнутый', open: '<u>', close: '</u>' },
  { label: 'З', title: 'Зачёркнутый', open: '<s>', close: '</s>' },
  { label: '{}', title: 'Моноширинный', open: '<code>', close: '</code>' },
  { label: '👁', title: 'Спойлер', open: '<tg-spoiler>', close: '</tg-spoiler>' },
  { label: '❝', title: 'Цитата', open: '<blockquote>', close: '</blockquote>' },
]

export default function PostsPage() {
  const [addon, setAddon] = useState<AddonStatus | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [editing, setEditing] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [selChannels, setSelChannels] = useState<string[]>([])
  const [publishAt, setPublishAt] = useState('')
  const [disablePreview, setDisablePreview] = useState(false)
  const [media, setMedia] = useState<PostMedia[]>([])
  const textarea = useRef<HTMLTextAreaElement>(null)

  const load = useCallback(async () => {
    try {
      const [a, p, c] = await Promise.all([
        fetch('/api/addons/posting').then((r) => r.json()),
        fetch('/api/posts').then((r) => r.json()),
        fetch('/api/channels').then((r) => r.json()),
      ])
      setAddon(a?.data ?? null)
      setPosts(Array.isArray(p?.data) ? p.data : [])
      setChannels(Array.isArray(c?.data) ? c.data : [])
      setError(null)
    } catch {
      setError('Не удалось загрузить посты')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Часовой пояс берём у браузера: «опубликовать в 10:00» должно означать
  // десять утра у клиента, а не у сервера.
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!tz) return
    fetch('/api/profile/timezone', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone: tz }),
    }).catch(() => {})
  }, [])

  const reset = () => {
    setEditing(null)
    setBody('')
    setSelChannels([])
    setPublishAt('')
    setDisablePreview(false)
    setMedia([])
  }

  const wrap = (open: string, close: string) => {
    const el = textarea.current
    if (!el) return
    const { selectionStart: from, selectionEnd: to } = el
    setBody((prev) => `${prev.slice(0, from)}${open}${prev.slice(from, to)}${close}${prev.slice(to)}`)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(from + open.length, to + open.length)
    })
  }

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    setError(null)
    try {
      for (const file of Array.from(files)) {
        const form = new FormData()
        form.append('file', file)
        const r = await fetch('/api/posts/media', { method: 'POST', body: form })
        const d = await r.json()
        if (!r.ok || !d.success) throw new Error(d.error || 'Не удалось загрузить файл')
        setMedia((prev) => [...prev, { ...d.data, fileId: null }])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки')
    } finally {
      setBusy(false)
    }
  }

  const save = async (thenPublish: boolean) => {
    setBusy(true)
    setError(null)
    try {
      const payload = {
        bodyHtml: body,
        channelIds: selChannels,
        // datetime-local — это местное время браузера; в UTC переводим здесь,
        // на сервере хранится и считается только UTC.
        publishAt: publishAt ? new Date(publishAt).toISOString() : null,
        disablePreview,
        media: media.map((m) => ({
          mediaType: m.mediaType,
          storagePath: m.storagePath,
          fileId: m.fileId,
          fileName: m.fileName,
          fileSize: m.fileSize,
        })),
      }
      const r = await fetch(editing ? `/api/posts/${editing}` : '/api/posts', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await r.json()
      if (!r.ok || !d.success) throw new Error(d.error || 'Не удалось сохранить пост')

      if (thenPublish) {
        const id = editing ?? d.data.id
        const s = await fetch(`/api/posts/${id}/schedule`, { method: 'POST' })
        const sd = await s.json()
        if (!s.ok || !sd.success) throw new Error(sd.error || 'Не удалось поставить в очередь')
      }
      reset()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  const act = async (id: string, action: 'schedule' | 'unschedule') => {
    setBusy(true)
    try {
      const r = await fetch(`/api/posts/${id}/${action}`, { method: 'POST' })
      const d = await r.json()
      if (!r.ok || !d.success) throw new Error(d.error || 'Ошибка')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Удалить пост?')) return
    await fetch(`/api/posts/${id}`, { method: 'DELETE' })
    if (editing === id) reset()
    await load()
  }

  const edit = (p: Post) => {
    setEditing(p.id)
    setBody(p.bodyHtml)
    setSelChannels(p.channelIds)
    setDisablePreview(p.disablePreview)
    setMedia(p.media)
    setPublishAt(p.publishAt ? toLocalInput(p.publishAt) : '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (loading) {
    return <div className="h-40 animate-pulse rounded-sm bg-ledger-page/10" />
  }

  if (addon && !addon.hasAccess) {
    return <Paywall addon={addon} />
  }

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ledger-page md:text-3xl">Посты</h1>
          <p className="mt-1 text-sm text-ledger-page/60">
            Публикация в ваши каналы — сразу или по расписанию
          </p>
        </div>
        {addon && (
          <p className="font-ledger-mono text-xs uppercase tracking-wide text-ledger-page/50">
            {addon.status === 'free'
              ? 'Опция подключена владельцем'
              : addon.daysLeft != null
                ? `Опция оплачена, осталось ${addon.daysLeft} дн.`
                : 'Опция подключена'}
          </p>
        )}
      </header>

      {error && (
        <div className="mb-6 rounded-sm border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="rounded-sm bg-ledger-page p-6 text-ledger-ink shadow-[4px_6px_0_0_rgba(0,0,0,0.25)] lg:col-span-2">
          <h2 className="mb-4 text-lg font-bold text-ledger-ink">
            {editing ? 'Правка поста' : 'Новый пост'}
          </h2>

          <div className="mb-2 flex flex-wrap gap-1">
            {markupButtons.map((b) => (
              <button
                key={b.label}
                type="button"
                title={b.title}
                onClick={() => wrap(b.open, b.close)}
                className="rounded-sm border border-ledger-ink/15 px-2 py-1 text-xs text-ledger-ink/70 hover:border-ledger-stamp/60 hover:text-ledger-ink"
              >
                {b.label}
              </button>
            ))}
            <button
              type="button"
              title="Ссылка"
              onClick={() => {
                const href = prompt('Адрес ссылки', 'https://')
                if (href) wrap(`<a href="${href}">`, '</a>')
              }}
              className="rounded-sm border border-ledger-ink/15 px-2 py-1 text-xs text-ledger-ink/70 hover:border-ledger-stamp/60 hover:text-ledger-ink"
            >
              🔗
            </button>
          </div>

          <textarea
            ref={textarea}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            placeholder="Текст поста. Разметка — как в Telegram."
            className="w-full rounded-sm border border-ledger-ink/15 bg-white/50 px-4 py-2.5 font-ledger-mono text-sm text-ledger-ink placeholder-ledger-ink/35 outline-none focus:border-ledger-stamp/60"
          />

          <div className="mt-4">
            <span className="mb-1.5 block text-sm font-medium text-ledger-ink/60">Вложения</span>
            <input
              type="file"
              multiple
              onChange={(e) => {
                upload(e.target.files)
                e.target.value = ''
              }}
              className="block w-full text-xs text-ledger-ink/60 file:mr-3 file:rounded-sm file:border-0 file:bg-ledger-ink/10 file:px-3 file:py-1.5 file:text-xs file:text-ledger-ink"
            />
            {media.length > 0 && (
              <ul className="mt-2 space-y-1">
                {media.map((m, i) => (
                  <li
                    key={`${m.storagePath ?? m.fileId}-${i}`}
                    className="flex items-center justify-between gap-2 text-xs text-ledger-ink/70"
                  >
                    <span className="truncate">
                      {m.mediaType === 'photo' ? '🖼' : m.mediaType === 'video' ? '🎬' : '📎'}{' '}
                      {m.fileName || 'файл'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setMedia((prev) => prev.filter((_, j) => j !== i))}
                      className="text-ledger-ink/45 hover:text-ledger-stampDark"
                    >
                      убрать
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-xs text-ledger-ink/45">
              До 10 вложений. Документы нельзя смешивать с фото и видео в одном альбоме.
            </p>
          </div>

          <div className="mt-4">
            <span className="mb-1.5 block text-sm font-medium text-ledger-ink/60">Каналы</span>
            {channels.length === 0 ? (
              <p className="text-xs text-ledger-ink/45">Сначала подключите канал</p>
            ) : (
              <div className="space-y-2">
                {channels.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm text-ledger-ink/60">
                    <input
                      type="checkbox"
                      checked={selChannels.includes(c.id)}
                      onChange={() =>
                        setSelChannels((prev) =>
                          prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id],
                        )
                      }
                      className="h-4 w-4 rounded border-ledger-ink/25 bg-white/50 accent-ledger-stamp"
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium text-ledger-ink/60">
              Время публикации (ваше местное; пусто — сразу)
            </span>
            <input
              type="datetime-local"
              value={publishAt}
              onChange={(e) => setPublishAt(e.target.value)}
              className="w-full rounded-sm border border-ledger-ink/15 bg-white/50 px-4 py-2.5 text-sm text-ledger-ink outline-none focus:border-ledger-stamp/60"
            />
          </label>

          <label className="mt-3 flex items-center gap-2 text-sm text-ledger-ink/60">
            <input
              type="checkbox"
              checked={disablePreview}
              onChange={(e) => setDisablePreview(e.target.checked)}
              className="h-4 w-4 rounded border-ledger-ink/25 bg-white/50 accent-ledger-stamp"
            />
            Не показывать превью ссылок
          </label>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => save(false)}
              className="rounded-sm border border-ledger-ink/20 px-4 py-2.5 text-sm font-bold text-ledger-ink hover:border-ledger-stamp/60 disabled:opacity-50"
            >
              Сохранить черновик
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => save(true)}
              className="rounded-sm bg-ledger-stamp px-4 py-2.5 text-sm font-bold text-ledger-page hover:brightness-110 disabled:opacity-50"
            >
              {publishAt ? 'Запланировать' : 'Опубликовать сейчас'}
            </button>
            {editing && (
              <button
                type="button"
                onClick={reset}
                className="px-2 py-2.5 text-sm text-ledger-ink/50 hover:text-ledger-ink"
              >
                Отмена
              </button>
            )}
          </div>
        </div>

        <div className="lg:col-span-3">
          {posts.length === 0 ? (
            <div className="rounded-sm border border-dashed border-ledger-page/20 p-12 text-center">
              <div className="mb-3 text-4xl">📝</div>
              <p className="text-ledger-page/70">Постов пока нет</p>
              <p className="mt-1 text-sm text-ledger-page/45">Напишите первый слева</p>
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map((p) => (
                <article
                  key={p.id}
                  className="rounded-sm bg-ledger-page p-5 text-ledger-ink shadow-[4px_6px_0_0_rgba(0,0,0,0.25)]"
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`rounded-sm px-2 py-0.5 text-xs font-bold ${statusLabels[p.status].tone}`}
                    >
                      {statusLabels[p.status].label}
                    </span>
                    <span className="font-ledger-mono text-xs text-ledger-ink/50">
                      {p.publishedAt
                        ? `вышел ${formatDate(p.publishedAt)}`
                        : p.publishAt
                          ? `на ${formatDate(p.publishAt)}`
                          : 'без расписания'}
                    </span>
                  </div>

                  <div
                    className="max-h-32 overflow-hidden whitespace-pre-wrap text-sm text-ledger-ink/80"
                    // Текст уже вычищен на сервере до подмножества тегов Telegram:
                    // чужие теги и javascript:-ссылки туда не проходят.
                    dangerouslySetInnerHTML={{ __html: p.bodyHtml }}
                  />

                  {p.media.length > 0 && (
                    <p className="mt-2 text-xs text-ledger-ink/50">Вложений: {p.media.length}</p>
                  )}
                  <p className="mt-1 text-xs text-ledger-ink/50">
                    Каналов: {p.channelIds.length}
                    {p.targets.some((t) => t.messageId) &&
                      ` · доставлено: ${p.targets.filter((t) => t.messageId).length}`}
                  </p>
                  {p.error && <p className="mt-2 text-xs text-red-700">{p.error}</p>}

                  <div className="mt-3 flex flex-wrap gap-3 text-xs">
                    {p.status !== 'published' && p.status !== 'publishing' && (
                      <button onClick={() => edit(p)} className="text-ledger-ink/60 hover:text-ledger-ink">
                        Править
                      </button>
                    )}
                    {(p.status === 'draft' || p.status === 'failed') && (
                      <button
                        disabled={busy}
                        onClick={() => act(p.id, 'schedule')}
                        className="text-ledger-stamp hover:brightness-110"
                      >
                        {p.publishAt ? 'Запланировать' : 'Опубликовать'}
                      </button>
                    )}
                    {p.status === 'scheduled' && (
                      <button
                        disabled={busy}
                        onClick={() => act(p.id, 'unschedule')}
                        className="text-ledger-ink/60 hover:text-ledger-ink"
                      >
                        Снять
                      </button>
                    )}
                    {p.status !== 'publishing' && (
                      <button
                        onClick={() => remove(p.id)}
                        className="text-ledger-ink/45 hover:text-ledger-stampDark"
                      >
                        Удалить
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Экран оплаты вместо пустой страницы: человеку видно, что и почём. */
function Paywall({ addon }: { addon: AddonStatus }) {
  return (
    <div className="mx-auto max-w-xl">
      <header className="mb-8">
        <h1 className="font-display text-2xl text-ledger-page md:text-3xl">Посты</h1>
        <p className="mt-1 text-sm text-ledger-page/60">Отдельная платная опция</p>
      </header>

      <div className="rounded-sm bg-ledger-page p-8 text-ledger-ink shadow-[4px_6px_0_0_rgba(0,0,0,0.25)]">
        <div className="mb-4 text-4xl">📝</div>
        <h2 className="text-xl font-bold">{addon.name}</h2>
        <p className="mt-2 text-sm text-ledger-ink/70">{addon.description}</p>
        <p className="mt-6 text-3xl font-bold text-ledger-stamp">
          {addon.priceMonth} ₽
          <span className="ml-2 text-sm font-normal text-ledger-ink/55">
            за {addon.periodDays} дн.
          </span>
        </p>

        {addon.status === 'past_due' && (
          <p className="mt-4 rounded-sm bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
            Последнее списание не прошло. Доступ работает до конца оплаченного периода.
          </p>
        )}

        {addon.paymentUrl ? (
          <a
            href={addon.paymentUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-block rounded-sm bg-ledger-stamp px-6 py-3 text-sm font-bold text-ledger-page hover:brightness-110"
          >
            Подключить опцию
          </a>
        ) : (
          <p className="mt-6 text-sm text-ledger-ink/55">
            Оплата пока не настроена — напишите владельцу платформы.
          </p>
        )}
      </div>
    </div>
  )
}

/** ISO из базы → значение для datetime-local в местном времени браузера. */
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
