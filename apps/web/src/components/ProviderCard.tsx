'use client'

import { useState } from 'react'
import { providerMeta, type PayCfg } from '@/lib/payment-providers'

export function ProviderCard({
  cfg,
  onSaved,
  setMsg,
}: {
  cfg: PayCfg
  onSaved: () => void
  setMsg: (m: { type: 'ok' | 'err'; text: string }) => void
}) {
  const meta = providerMeta[cfg.provider]
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  if (!meta) return null

  const save = async (enable: boolean) => {
    setBusy(true)
    try {
      const credentials = cfg.needsKeys ? values : null
      const r = await fetch(`/api/pay-config/${cfg.provider}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials, isActive: enable }),
      })
      const d = await r.json()
      if (!r.ok || !d.success) throw new Error(d.error || 'Ошибка')
      setMsg({ type: 'ok', text: `${meta.label}: сохранено` })
      onSaved()
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Ошибка' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-sm bg-ledger-page p-5 text-ledger-ink shadow-[4px_6px_0_0_rgba(0,0,0,0.25)]">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-bold text-ledger-ink">
          {meta.icon} {meta.label}
        </h3>
        <span
          className={`rounded-sm px-2.5 py-1 text-xs ${
            cfg.configured && cfg.isActive
              ? 'bg-emerald-500/10 text-emerald-700'
              : 'bg-ledger-ink/10 text-ledger-ink/50'
          }`}
        >
          {cfg.configured && cfg.isActive ? 'подключён' : 'выключен'}
        </span>
      </div>

      {cfg.needsKeys ? (
        <div className="space-y-2">
          {meta.fields.map((f) => (
            <input
              key={f.key}
              placeholder={f.label}
              value={values[f.key] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              className="w-full rounded-sm border border-ledger-ink/15 bg-white/50 px-3 py-2 text-sm text-ledger-ink placeholder-ledger-ink/35 outline-none focus:border-ledger-stamp/60"
            />
          ))}
          <button
            onClick={() => save(true)}
            disabled={busy}
            className="mt-1 w-full rounded-sm bg-ledger-stamp px-4 py-2 text-sm font-bold text-ledger-page hover:brightness-110 disabled:opacity-50"
          >
            {busy ? '…' : 'Сохранить и включить'}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-ledger-ink/55">
            Ключи не требуются — оплата звёздами Telegram.
          </p>
          <button
            onClick={() => save(!cfg.isActive)}
            disabled={busy}
            className={`w-full rounded-sm px-4 py-2 text-sm font-medium disabled:opacity-50 ${
              cfg.isActive
                ? 'border border-ledger-ink/20 text-ledger-ink hover:bg-ledger-ink/5'
                : 'bg-ledger-stamp font-bold text-ledger-page hover:brightness-110'
            }`}
          >
            {cfg.isActive ? 'Выключить' : 'Включить'}
          </button>
        </div>
      )}
    </div>
  )
}
