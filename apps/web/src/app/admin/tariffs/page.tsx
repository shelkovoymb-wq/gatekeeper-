'use client'

import { useCallback, useEffect, useState } from 'react'
import { formatMoney } from '@/lib/format'

interface Plan {
  id: string
  name: string
  price: number
  currency: string
  periodDays: number
  trialDays: number
  channelIds: string[]
}
interface Channel {
  id: string
  name: string
}

const periods = [
  { v: 7, label: '7 дней' },
  { v: 30, label: '30 дней' },
  { v: 90, label: '90 дней' },
  { v: 365, label: '365 дней' },
  { v: 0, label: 'Навсегда' },
]

export default function TariffsPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [periodDays, setPeriodDays] = useState(30)
  const [trialDays, setTrialDays] = useState('')
  const [selChannels, setSelChannels] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([
        fetch('/api/tariffs').then((r) => r.json()),
        fetch('/api/channels').then((r) => r.json()),
      ])
      setPlans(Array.isArray(p?.data) ? p.data : [])
      setChannels(Array.isArray(c?.data) ? c.data : [])
      setError(null)
    } catch {
      setError('Не удалось загрузить тарифы')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await fetch('/api/tariffs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          price: Number(price),
          periodDays,
          trialDays: trialDays ? Number(trialDays) : 0,
          channelIds: selChannels,
        }),
      })
      const d = await r.json()
      if (!r.ok || !d.success) throw new Error(d.error || 'Ошибка создания тарифа')
      setName('')
      setPrice('')
      setTrialDays('')
      setSelChannels([])
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Удалить тариф?')) return
    await fetch(`/api/tariffs/${id}`, { method: 'DELETE' })
    await load()
  }

  const toggleChannel = (id: string) =>
    setSelChannels((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-white md:text-3xl">Тарифы</h1>
        <p className="mt-1 text-sm text-slate-400">Планы подписки для ваших каналов</p>
      </header>

      {error && (
        <div className="mb-6 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Форма создания */}
        <form
          onSubmit={create}
          className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 lg:col-span-1"
        >
          <h2 className="mb-4 text-lg font-semibold text-white">Новый тариф</h2>
          <div className="space-y-4">
            <Input label="Название" value={name} onChange={setName} placeholder="Базовый" required />
            <Input
              label="Цена, ₽"
              type="number"
              value={price}
              onChange={setPrice}
              placeholder="490"
              required
            />
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-300">Период</span>
              <select
                value={periodDays}
                onChange={(e) => setPeriodDays(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2.5 text-sm text-white outline-none focus:border-primary-500"
              >
                {periods.map((p) => (
                  <option key={p.v} value={p.v}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Триал, дней (необязательно)"
              type="number"
              value={trialDays}
              onChange={setTrialDays}
              placeholder="0"
            />
            {channels.length > 0 && (
              <div>
                <span className="mb-1.5 block text-sm font-medium text-slate-300">Каналы</span>
                <div className="space-y-2">
                  {channels.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={selChannels.includes(c.id)}
                        onChange={() => toggleChannel(c.id)}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-800"
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-gradient-to-r from-primary-600 to-secondary-600 px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
            >
              {busy ? 'Создаём…' : 'Создать тариф'}
            </button>
          </div>
        </form>

        {/* Список */}
        <div className="lg:col-span-2">
          {loading ? (
            <div className="h-40 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60" />
          ) : plans.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center">
              <div className="mb-3 text-4xl">🏷️</div>
              <p className="text-slate-300">Тарифов пока нет</p>
              <p className="mt-1 text-sm text-slate-500">Создайте первый тариф слева</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {plans.map((p) => (
                <div key={p.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold text-white">{p.name}</h3>
                    <button
                      onClick={() => remove(p.id)}
                      className="text-xs text-slate-500 hover:text-red-400"
                    >
                      Удалить
                    </button>
                  </div>
                  <p className="mt-2 text-2xl font-bold text-primary-300">
                    {formatMoney(p.price, p.currency)}
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    {p.periodDays === 0 ? 'навсегда' : `на ${p.periodDays} дн.`}
                    {p.trialDays > 0 && ` · триал ${p.trialDays} дн.`}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    Каналов: {p.channelIds.length || '—'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Input(props: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  required?: boolean
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-300">{props.label}</span>
      <input
        type={props.type ?? 'text'}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        required={props.required}
        className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-primary-500"
      />
    </label>
  )
}
