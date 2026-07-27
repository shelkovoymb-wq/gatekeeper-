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

export default function AssistantPage() {
  const [messages, setMessages] = useState<Msg[]>([GREETING])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
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

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-white md:text-3xl">Ассистент настройки</h1>
        <p className="mt-1 text-sm text-slate-400">
          Проведёт по шагам и сам выполнит настройку
        </p>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                m.role === 'user'
                  ? 'bg-gradient-to-r from-primary-600 to-secondary-600 text-white'
                  : 'border border-slate-800 bg-slate-950/60 text-slate-200'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-2.5 text-sm text-slate-400">
              печатает…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Напишите сообщение…"
          className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-white placeholder-slate-600 outline-none focus:border-primary-500"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="shrink-0 rounded-xl bg-gradient-to-r from-primary-600 to-secondary-600 px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
        >
          Отправить
        </button>
      </form>
    </div>
  )
}
