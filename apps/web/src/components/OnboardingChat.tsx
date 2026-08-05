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
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
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
      if (d?.data?.token) {
        setRegistered(true)
      }
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Ошибка связи с ассистентом.' }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60 shadow-2xl shadow-primary-950/40 backdrop-blur-xl">
      <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.03] px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 via-secondary-500 to-accent-500 shadow-lg shadow-secondary-600/30">
          <span className="text-base">🤖</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Ассистент настройки</p>
          <p className="text-xs text-slate-400">Настроит и зарегистрирует проект в диалоге</p>
        </div>
      </div>

      <div className="flex h-[420px] flex-col gap-3 overflow-y-auto px-5 py-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`gk-fade-in max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
              m.role === 'user'
                ? 'ml-auto bg-gradient-to-br from-primary-600 to-secondary-600 text-white'
                : 'bg-white/5 text-slate-200'
            }`}
          >
            {m.content}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-1.5 rounded-2xl bg-white/5 px-4 py-3 text-slate-400">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
          </div>
        )}
        <div ref={endRef} />
      </div>

      {registered && (
        <div className="mx-5 mb-4 flex items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/10 px-4 py-3">
          <p className="text-sm text-emerald-300">Проект зарегистрирован — можно продолжить в кабинете.</p>
          <button
            onClick={() => {
              router.push('/admin/stats')
              router.refresh()
            }}
            className="shrink-0 rounded-lg bg-success px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:brightness-110"
          >
            Открыть кабинет →
          </button>
        </div>
      )}

      <form onSubmit={send} className="flex gap-2 border-t border-white/10 p-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={registered ? 'Продолжите настройку здесь или в кабинете…' : 'Напишите сообщение…'}
          disabled={busy}
          className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition focus:border-primary-500/60 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-xl bg-gradient-to-br from-primary-500 to-secondary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary-600/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          →
        </button>
      </form>
    </div>
  )
}
