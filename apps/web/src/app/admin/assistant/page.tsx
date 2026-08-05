'use client'

import { useEffect, useRef, useState } from 'react'

interface Msg {
  role: 'user' | 'assistant'
  content: string
}

const GREETING: Msg = {
  role: 'assistant',
  content:
    'Привет! Я помогу настроить Gatekeeper по шагам: подключить бота, добавить канал, создать тариф и включить оплату. Пришлите токен вашего бота от @BotFather — с него и начнём.',
}

const HISTORY_PREFIX = 'gk_assistant_chat_'
const MAX_TEXTAREA_HEIGHT = 160

export default function AssistantPage() {
  const [clientId, setClientId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [ready, setReady] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Загружаем историю (в т.ч. перенесённую из диалога на главной после регистрации)
  // из localStorage, по возможности сразу после получения clientId.
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const cid: string | null = d?.data?.clientId ?? null
        setClientId(cid)
        if (cid) {
          try {
            const raw = localStorage.getItem(HISTORY_PREFIX + cid)
            const parsed = raw ? JSON.parse(raw) : null
            if (Array.isArray(parsed) && parsed.length > 0) {
              setMessages(parsed)
              setReady(true)
              return
            }
          } catch {
            /* ignore corrupted storage */
          }
        }
        setMessages([GREETING])
        setReady(true)
      })
      .catch(() => {
        setMessages([GREETING])
        setReady(true)
      })
  }, [])

  // Сохраняем историю при каждом изменении — переживает обновление страницы.
  useEffect(() => {
    if (!ready || !clientId) return
    try {
      localStorage.setItem(HISTORY_PREFIX + clientId, JSON.stringify(messages))
    } catch {
      /* хранилище недоступно — не критично */
    }
  }, [messages, ready, clientId])

  useEffect(() => {
    if (messages.length <= 1) return
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages])

  const send = async () => {
    const text = input.trim()
    if (!text || busy) return
    const next = [...messages, { role: 'user' as const, content: text }]
    setMessages(next)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setBusy(true)
    try {
      const r = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // отправляем без приветствия — только реальный диалог
        body: JSON.stringify({ messages: next.filter((m) => m !== GREETING) }),
      })
      const d = await r.json()
      const reply = d?.data?.reply || d?.error || 'Не удалось получить ответ.'
      setMessages((m) => [...m, { role: 'assistant', content: reply }])
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Ошибка связи с ассистентом.' }])
    } finally {
      setBusy(false)
    }
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void send()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+Enter (Cmd+Enter на Mac) — отправить. Обычный Enter и Shift+Enter — перенос строки.
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      void send()
    }
  }

  const onInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`
  }

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col">
      <header className="mb-4">
        <h1 className="font-display text-2xl text-ledger-page md:text-3xl">Ассистент настройки</h1>
        <p className="mt-1 text-sm text-ledger-page/60">Проведёт по шагам и сам выполнит настройку</p>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto rounded-sm bg-ledger-page/[0.04] p-5">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-sm px-4 py-2.5 text-sm ${
                m.role === 'user'
                  ? 'bg-ledger-stamp text-ledger-page'
                  : 'border border-ledger-page/10 bg-ledger-page text-ledger-ink'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-sm border border-ledger-page/10 bg-ledger-page px-4 py-2.5 text-sm text-ledger-ink/50">
              печатает…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={onSubmit} className="mt-4 flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onInput={onInput}
          onKeyDown={onKeyDown}
          placeholder="Напишите сообщение… (Ctrl+Enter — отправить, Shift+Enter — новая строка)"
          rows={1}
          className="min-w-0 flex-1 resize-none rounded-sm border border-ledger-page/15 bg-ledger-page/[0.06] px-4 py-3 text-sm text-ledger-page placeholder-ledger-page/35 outline-none focus:border-ledger-stamp/60"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="shrink-0 rounded-sm bg-ledger-stamp px-5 py-3 text-sm font-bold text-ledger-page hover:brightness-110 disabled:opacity-50"
        >
          Отправить
        </button>
      </form>
    </div>
  )
}
