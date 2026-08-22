'use client'

import { useCallback, useEffect, useState } from 'react'
import { ProviderCard } from '@/components/ProviderCard'
import { formatDate } from '@/lib/format'
import {
  ACCOUNT_FORMS,
  describeAccount,
  formOf,
  verificationBadge,
  verificationLabel,
  type PaymentAccount,
} from '@/lib/payment-accounts'
import { type PayCfg } from '@/lib/payment-providers'

/**
 * Приём денег — один экран на оба способа получения.
 *
 * Платёжная система и собственные реквизиты для клиента — одно и то же:
 * «куда мне приходят деньги». Раньше это были два разных экрана (провайдеры
 * жили в «Настройке»), и связь между ними приходилось додумывать.
 */
export default function PaymentMethodsPage() {
  const [providers, setProviders] = useState<PayCfg[]>([])
  const [accounts, setAccounts] = useState<PaymentAccount[]>([])
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [formType, setFormType] = useState('sbp')
  const [values, setValues] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/payment-methods').then((x) => x.json())
      if (r.success) {
        setProviders(r.data.providers ?? [])
        setAccounts(r.data.accounts ?? [])
      } else {
        setMsg({ type: 'err', text: r.error || 'Не удалось загрузить способы приёма' })
      }
    } catch (e) {
      setMsg({ type: 'err', text: String(e) })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const activeForm = ACCOUNT_FORMS.find((f) => f.type === formType) ?? ACCOUNT_FORMS[0]

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setMsg(null)
    try {
      await action()
      await load()
    } catch (e) {
      setMsg({ type: 'err', text: String(e) })
    } finally {
      setBusy(false)
    }
  }

  const addAccount = () =>
    run(async () => {
      const payload: Record<string, string> = { accountType: formType }
      for (const f of activeForm.fields) {
        const v = values[f.key]?.trim()
        if (v) payload[f.key] = v
      }
      const r = await fetch('/api/payment-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then((x) => x.json())
      if (!r.success) setMsg({ type: 'err', text: r.error || 'Не удалось добавить реквизиты' })
      else {
        setValues({})
        setMsg({ type: 'ok', text: 'Реквизиты добавлены, отправлены на проверку' })
      }
    })

  const deactivate = (id: string) =>
    run(async () => {
      await fetch(`/api/payment-accounts/${id}`, { method: 'DELETE' })
    })

  const activeCount =
    providers.filter((p) => p.configured && p.isActive).length +
    accounts.filter((a) => a.isActive && a.verificationStatus === 'verified').length

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-2xl text-ledger-page md:text-3xl">Приём денег</h1>
        <p className="mt-1 text-sm text-ledger-page/60">
          Всё, куда подписчики могут заплатить: платёжные системы и ваши собственные реквизиты.
          {activeCount === 0
            ? ' Сейчас не подключено ничего — подписчик не сможет оплатить.'
            : ` Работающих способов: ${activeCount}.`}
        </p>
      </header>

      {msg && (
        <div
          className={`rounded-sm px-4 py-2.5 text-sm ${
            msg.type === 'ok'
              ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
              : 'border border-danger/40 bg-danger/10 text-red-300'
          }`}
        >
          {msg.text}
        </div>
      )}

      <section>
        <h2 className="mb-1 text-lg font-bold text-ledger-page">Платёжные системы</h2>
        <p className="mb-4 text-sm text-ledger-page/55">
          Деньги приходят на ваш счёт в системе, платёж закрывается автоматически по её ответу.
        </p>
        {loading ? (
          <div className="h-40 animate-pulse rounded-sm bg-ledger-page/10" />
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {providers.map((c) => (
              <ProviderCard key={c.provider} cfg={c} onSaved={load} setMsg={setMsg} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-lg font-bold text-ledger-page">Свои реквизиты</h2>
        <p className="mb-4 text-sm text-ledger-page/55">
          Подписчик переводит напрямую — на карту, по СБП или на счёт. Банк о переводе платформе
          не сообщает, поэтому такой платёж вы отмечаете сами на странице «Платежи», и он попадает
          в оборот.
        </p>

        <div className="rounded-sm bg-ledger-page p-6 text-ledger-ink shadow-[4px_6px_0_0_rgba(0,0,0,0.25)]">
          <h3 className="font-display text-base">Добавить реквизиты</h3>
          <p className="mt-1 text-sm text-ledger-ink/55">
            Номер карты целиком не принимаем — только последние 4 цифры. Новые реквизиты уходят на
            проверку платформой; принимать переводы на них можно после подтверждения.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {ACCOUNT_FORMS.map((f) => (
              <button
                key={f.type}
                onClick={() => {
                  setFormType(f.type)
                  setValues({})
                }}
                className={`rounded-sm px-3 py-1.5 text-sm font-medium transition ${
                  formType === f.type
                    ? 'bg-ledger-stamp text-ledger-page'
                    : 'border border-ledger-ink/15 text-ledger-ink hover:bg-ledger-ink/5'
                }`}
              >
                {f.icon} {f.label}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {activeForm.fields.map((f) => (
              <input
                key={f.key}
                placeholder={f.label}
                value={values[f.key] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                className="w-full rounded-sm border border-ledger-ink/15 bg-white/50 px-3 py-2 text-sm text-ledger-ink placeholder-ledger-ink/35 outline-none focus:border-ledger-stamp/60"
              />
            ))}
          </div>

          <button
            onClick={addAccount}
            disabled={busy}
            className="mt-4 rounded-sm bg-ledger-stamp px-5 py-2.5 text-sm font-bold text-ledger-page transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? 'Сохранение…' : 'Добавить'}
          </button>
        </div>

        {loading ? (
          <div className="mt-5 h-32 animate-pulse rounded-sm bg-ledger-page/10" />
        ) : accounts.length === 0 ? (
          <p className="mt-5 text-ledger-page/45">Реквизитов пока нет — добавьте первые выше.</p>
        ) : (
          <div className="mt-5 overflow-x-auto rounded-sm border border-ledger-page/15">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-ledger-page/15 bg-ledger-cover font-ledger-mono text-xs uppercase tracking-wide text-ledger-brass">
                  <th className="px-5 py-3 font-medium">Тип</th>
                  <th className="px-5 py-3 font-medium">Реквизиты</th>
                  <th className="px-5 py-3 font-medium">Проверка</th>
                  <th className="px-5 py-3 font-medium">Добавлены</th>
                  <th className="px-5 py-3 font-medium">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ledger-ink/10 bg-ledger-page">
                {accounts.map((a) => {
                  const meta = formOf(a.accountType)
                  return (
                    <tr
                      key={a.id}
                      className={`transition-colors hover:bg-ledger-ink/5 ${a.isActive ? '' : 'opacity-45'}`}
                    >
                      <td className="px-5 py-3 font-bold text-ledger-ink">
                        {meta ? `${meta.icon} ${meta.label}` : a.accountType}
                      </td>
                      <td className="px-5 py-3 font-ledger-mono text-ledger-ink/70">
                        {describeAccount(a)}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`rounded-sm px-2 py-1 font-ledger-mono text-xs font-medium ${
                            verificationBadge[a.verificationStatus] ??
                            'bg-ledger-ink/10 text-ledger-ink/60'
                          }`}
                        >
                          {verificationLabel[a.verificationStatus] ?? a.verificationStatus}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-ledger-ink/60">{formatDate(a.createdAt)}</td>
                      <td className="px-5 py-3">
                        {!a.isActive ? (
                          <span className="text-xs text-ledger-ink/40">отключены</span>
                        ) : (
                          <button
                            onClick={() => deactivate(a.id)}
                            disabled={busy}
                            className="rounded-sm border border-ledger-ink/20 px-2.5 py-1 text-xs font-medium text-ledger-ink hover:bg-ledger-ink/5 disabled:opacity-50"
                          >
                            Отключить
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
