'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Msg {
  role: 'user' | 'assistant'
  content: string
}

const GREETING: Msg = {
  role: 'assistant',
  content:
    'Привет! Я помогу собрать платформу платных Telegram-каналов прямо в диалоге: расскажу как это работает, ' +
    'зарегистрирую проект, подключу бота, создам тариф и включу оплату. С чего начнём?',
}

const DRAFT_KEY = 'gk_onboarding_draft'
const ASSISTANT_HISTORY_PREFIX = 'gk_assistant_chat_'
const MAX_TEXTAREA_HEIGHT = 160

const SUGGESTIONS = ['Сколько это стоит?', 'Как это работает?', 'Хочу зарегистрироваться']

export function OnboardingChat() {
  const router = useRouter()
  const [messages, setMessages] = useState<Msg[]>([GREETING])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [registered, setRegistered] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Восстанавливаем черновик диалога, если посетитель обновил страницу до регистрации.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      const parsed = raw ? JSON.parse(raw) : null
      if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed)
    } catch {
      /* ignore corrupted storage */
    }
  }, [])

  // Сохраняем черновик на каждое изменение — переживает обновление страницы.
  useEffect(() => {
    if (registered) return
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(messages))
    } catch {
      /* хранилище недоступно — не критично */
    }
  }, [messages, registered])

  useEffect(() => {
    // Не дёргаем страницу вниз на первой отрисовке — только когда в чате уже есть переписка.
    if (messages.length <= 1) return
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages])

  const send = async (override?: string) => {
    const text = (override ?? input).trim()
    if (!text || busy) return
    const next = [...messages, { role: 'user' as const, content: text }]
    setMessages(next)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setBusy(true)
    try {
      const r = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.filter((m) => m !== GREETING) }),
      })
      const d = await r.json()
      const reply = d?.data?.reply || d?.error || 'Не удалось получить ответ.'
      const withReply = [...next, { role: 'assistant' as const, content: reply }]
      setMessages(withReply)
      if (d?.data?.registered) {
        await finalizeRegistration(withReply)
      }
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Ошибка связи с ассистентом.' }])
    } finally {
      setBusy(false)
      // Textarea включится обратно только после ре-рендера — фокус возвращаем следующим тиком.
      setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }

  // Переносим диалог в историю кабинетного ассистента, чтобы после перехода
  // настройка продолжилась с той же перепиской, а не с чистого листа.
  const finalizeRegistration = async (transcript: Msg[]) => {
    try {
      const r = await fetch('/api/auth/me')
      const d = await r.json()
      const clientId: string | undefined = d?.data?.clientId
      if (clientId) {
        const forCabinet = transcript.filter((m) => m !== GREETING)
        localStorage.setItem(ASSISTANT_HISTORY_PREFIX + clientId, JSON.stringify(forCabinet))
      }
      localStorage.removeItem(DRAFT_KEY)
    } catch {
      /* перенос истории не критичен — кабинет всё равно откроется */
    }
    setRegistered(true)
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
    <div className="relative overflow-hidden rounded-md bg-ledger-page shadow-[0_8px_0_0_rgba(0,0,0,0.25)]">
      <div className="flex items-center gap-3 border-b border-ledger-ink/10 bg-ledger-pageDark/50 px-5 py-4">
        <svg viewBox="0 0 40 40" className="h-8 w-8 shrink-0 text-ledger-stamp" aria-hidden="true">
          <circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="20" cy="20" r="10" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        <div>
          <p className="font-display text-sm text-ledger-ink">Ассистент Gatekeeper</p>
          <p className="font-ledger-mono text-[11px] uppercase tracking-wide text-ledger-ink/50">
            Настроит проект прямо в диалоге
          </p>
        </div>
      </div>

      <div className="flex h-[420px] flex-col gap-3 overflow-y-auto px-5 py-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`gk-fade-in max-w-[85%] rounded-md px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
              m.role === 'user'
                ? 'ml-auto bg-ledger-ink text-ledger-page'
                : 'border border-ledger-ink/10 bg-white/40 text-ledger-ink'
            }`}
          >
            {m.content}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-1.5 rounded-md border border-ledger-ink/10 bg-white/40 px-4 py-3 text-ledger-ink/50">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ledger-ink/50 [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ledger-ink/50 [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ledger-ink/50" />
          </div>
        )}
        <div ref={endRef} />
      </div>

      {messages.length <= 1 && !registered && (
        <div className="flex flex-wrap gap-2 px-5 pb-3">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              onClick={() => void send(s)}
              className="rounded-full border border-ledger-ink/15 bg-white/40 px-3 py-1.5 text-xs font-bold text-ledger-ink transition hover:border-ledger-stamp/50 hover:bg-white/60 disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {registered && (
        <div className="mx-5 mb-4 flex items-center justify-between gap-3 rounded-md border border-ledger-stamp/30 bg-ledger-stamp/10 px-4 py-3">
          <p className="text-sm font-bold text-ledger-stampDark">Проект зарегистрирован — продолжим в кабинете.</p>
          <button
            onClick={() => {
              router.push('/admin/assistant')
              router.refresh()
            }}
            className="shrink-0 rounded-md bg-ledger-stamp px-3 py-1.5 text-xs font-bold text-ledger-page transition hover:brightness-110"
          >
            Продолжить настройку →
          </button>
        </div>
      )}

      <div className="border-t border-ledger-ink/10 p-4">
        <form onSubmit={onSubmit} className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onInput={onInput}
            onKeyDown={onKeyDown}
            placeholder={registered ? 'Продолжите настройку здесь или в кабинете…' : 'Напишите сообщение…'}
            disabled={busy}
            rows={1}
            className="flex-1 resize-none rounded-md border border-ledger-ink/15 bg-white/50 px-4 py-2.5 text-sm text-ledger-ink placeholder-ledger-ink/40 outline-none transition focus:border-ledger-stamp/60 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="shrink-0 rounded-md bg-ledger-stamp px-5 py-2.5 text-sm font-bold text-ledger-page transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            →
          </button>
        </form>
        <p className="mt-1.5 font-ledger-mono text-[10px] uppercase tracking-wide text-ledger-ink/35">
          Ctrl+Enter — отправить · Shift+Enter — новая строка
        </p>
      </div>
    </div>
  )
}
