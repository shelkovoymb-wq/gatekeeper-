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

export function OnboardingChat() {
  const router = useRouter()
  const [messages, setMessages] = useState<Msg[]>([GREETING])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [registered, setRegistered] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Не дёргаем страницу вниз на первой отрисовке — только когда в чате уже есть переписка.
    if (messages.length <= 1) return
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages])

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    const next = [...messages, { role: 'user' as const, content: text }]
    setMessages(next)
    setInput('')
    setBusy(true)
    try {
      const r = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.filter((m) => m !== GREETING) }),
      })
      const d = await r.json()
      const reply = d?.data?.reply || d?.error || 'Не удалось получить ответ.'
      setMessages((m) => [...m, { role: 'assistant', content: reply }])
      if (d?.data?.registered) {
        setRegistered(true)
      }
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Ошибка связи с ассистентом.' }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative overflow-hidden rounded-md bg-ledger-page shadow-[0_8px_0_0_rgba(0,0,0,0.25)]">
      <div className="flex items-center gap-3 border-b border-ledger-ink/10 bg-ledger-pageDark/50 px-5 py-4">
        <svg viewBox="0 0 40 40" className="h-8 w-8 shrink-0 text-ledger-stamp" aria-hidden="true">
          <circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="20" cy="20" r="10" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        <div>
          <p className="font-display text-sm text-ledger-ink">Ассистент реестра</p>
          <p className="font-ledger-mono text-[11px] uppercase tracking-wide text-ledger-ink/50">
            Настроит и запишет проект в диалоге
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

      {registered && (
        <div className="mx-5 mb-4 flex items-center justify-between gap-3 rounded-md border border-ledger-stamp/30 bg-ledger-stamp/10 px-4 py-3">
          <p className="text-sm font-bold text-ledger-stampDark">Проект зарегистрирован — можно продолжить в кабинете.</p>
          <button
            onClick={() => {
              router.push('/admin/stats')
              router.refresh()
            }}
            className="shrink-0 rounded-md bg-ledger-stamp px-3 py-1.5 text-xs font-bold text-ledger-page transition hover:brightness-110"
          >
            Открыть кабинет →
          </button>
        </div>
      )}

      <form onSubmit={send} className="flex gap-2 border-t border-ledger-ink/10 p-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={registered ? 'Продолжите настройку здесь или в кабинете…' : 'Напишите сообщение…'}
          disabled={busy}
          className="flex-1 rounded-md border border-ledger-ink/15 bg-white/50 px-4 py-2.5 text-sm text-ledger-ink placeholder-ledger-ink/40 outline-none transition focus:border-ledger-stamp/60 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-md bg-ledger-stamp px-5 py-2.5 text-sm font-bold text-ledger-page transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          →
        </button>
      </form>
    </div>
  )
}
