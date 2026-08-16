'use client'

import { useCallback, useEffect, useState } from 'react'
import { QrCode } from '@/components/QrCode'

interface Status {
  enabled: boolean
  pendingSetup: boolean
  backupCodesLeft: number
}

interface SetupData {
  secret: string
  otpauthUrl: string
  issuer: string
}

const inputCls =
  'w-full rounded-sm border border-ledger-ink/15 bg-white/50 px-4 py-2.5 text-sm text-ledger-ink placeholder-ledger-ink/35 outline-none focus:border-ledger-stamp/60'

/** Подключение и отключение двухфакторной защиты входа в кабинет. */
export function TwoFactorSettings({ hasPassword = true }: { hasPassword?: boolean }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [setup, setSetup] = useState<SetupData | null>(null)
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null)
  const [code, setCode] = useState('')
  const [secretConfirm, setSecretConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/auth/2fa')
      const d = await r.json()
      if (d?.success) setStatus(d.data as Status)
    } catch {
      /* блок настроек просто не покажет состояние */
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const call = async (url: string, init: RequestInit) => {
    const r = await fetch(url, init)
    const d = await r.json()
    if (!r.ok || !d.success) throw new Error(d.error || 'Ошибка')
    return d.data
  }

  const startSetup = async () => {
    setBusy(true)
    setMsg(null)
    try {
      setSetup(await call('/api/auth/2fa/setup', { method: 'POST' }))
      setBackupCodes(null)
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Ошибка' })
    } finally {
      setBusy(false)
    }
  }

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      const data = await call('/api/auth/2fa/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      })
      setBackupCodes(data.backupCodes as string[])
      setSetup(null)
      setCode('')
      setMsg({ type: 'ok', text: 'Двухфакторная защита включена' })
      await load()
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Ошибка' })
    } finally {
      setBusy(false)
    }
  }

  const disable = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      await call('/api/auth/2fa', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          hasPassword ? { password: secretConfirm } : { code: secretConfirm.trim() },
        ),
      })
      setSecretConfirm('')
      setBackupCodes(null)
      setMsg({ type: 'ok', text: 'Двухфакторная защита выключена' })
      await load()
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Ошибка' })
    } finally {
      setBusy(false)
    }
  }

  const regenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      const data = await call('/api/auth/2fa/backup-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      })
      setBackupCodes(data.backupCodes as string[])
      setCode('')
      setMsg({ type: 'ok', text: 'Новые резервные коды выпущены — старые больше не работают' })
      await load()
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Ошибка' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-sm bg-ledger-page p-6 text-ledger-ink shadow-[4px_6px_0_0_rgba(0,0,0,0.25)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg text-ledger-ink">Двухфакторная защита</h2>
        <span
          className={`rounded-sm px-2.5 py-1 text-xs ${
            status?.enabled
              ? 'bg-emerald-500/10 text-emerald-700'
              : 'bg-ledger-ink/10 text-ledger-ink/50'
          }`}
        >
          {status?.enabled ? 'включена' : 'выключена'}
        </span>
      </div>

      {msg && (
        <div
          className={`mb-4 rounded-sm px-4 py-2.5 text-sm ${
            msg.type === 'ok'
              ? 'border border-success/40 bg-success/10 text-emerald-700'
              : 'border border-danger/40 bg-danger/10 text-red-700'
          }`}
        >
          {msg.text}
        </div>
      )}

      {backupCodes && <BackupCodes codes={backupCodes} />}

      {/* Выключена и не начата настройка */}
      {status && !status.enabled && !setup && (
        <div className="max-w-xl space-y-3">
          <p className="text-sm text-ledger-ink/65">
            Второй фактор — одноразовый код из приложения (Google Authenticator, Яндекс.Ключ,
            1Password). Пароля одного будет уже недостаточно, чтобы войти в кабинет.
          </p>
          <button
            onClick={startSetup}
            disabled={busy}
            className="rounded-sm bg-ledger-stamp px-5 py-2.5 text-sm font-bold text-ledger-page hover:brightness-110 disabled:opacity-50"
          >
            {busy ? '…' : status.pendingSetup ? 'Настроить заново' : 'Подключить'}
          </button>
        </div>
      )}

      {/* Шаг подключения: QR + подтверждение кодом */}
      {setup && (
        <form onSubmit={confirm} className="space-y-4">
          <p className="text-sm text-ledger-ink/65">
            Отсканируйте код в приложении-аутентификаторе и введите шесть цифр, которые оно покажет.
          </p>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <QrCode value={setup.otpauthUrl} />
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <span className="mb-1 block text-xs uppercase tracking-wide text-ledger-ink/50">
                  Если сканировать нечем — введите ключ вручную
                </span>
                <code className="block break-all rounded-sm border border-ledger-ink/15 bg-ledger-pageDark px-3 py-2 font-ledger-mono text-sm">
                  {setup.secret}
                </code>
              </div>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Код из приложения"
                inputMode="numeric"
                autoComplete="one-time-code"
                className={inputCls}
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={busy || code.trim().length < 6}
                  className="rounded-sm bg-ledger-stamp px-5 py-2.5 text-sm font-bold text-ledger-page hover:brightness-110 disabled:opacity-50"
                >
                  {busy ? '…' : 'Включить'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSetup(null)
                    setCode('')
                  }}
                  className="rounded-sm border border-ledger-ink/20 px-4 py-2.5 text-sm text-ledger-ink hover:bg-ledger-ink/5"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* Включена: перевыпуск кодов и отключение */}
      {status?.enabled && (
        <div className="grid max-w-3xl gap-6 md:grid-cols-2">
          <form onSubmit={regenerate} className="space-y-2">
            <h3 className="text-sm font-bold text-ledger-ink/80">Резервные коды</h3>
            <p className="text-xs text-ledger-ink/55">
              Осталось неиспользованных: {status.backupCodesLeft}. Перевыпуск подтверждается кодом из
              приложения; старые коды сразу перестают работать.
            </p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Код из приложения"
              inputMode="numeric"
              autoComplete="one-time-code"
              className={inputCls}
            />
            <button
              type="submit"
              disabled={busy || code.trim().length < 6}
              className="rounded-sm border border-ledger-ink/20 px-4 py-2.5 text-sm text-ledger-ink hover:bg-ledger-ink/5 disabled:opacity-50"
            >
              Выпустить новые
            </button>
          </form>

          <form onSubmit={disable} className="space-y-2">
            <h3 className="text-sm font-bold text-ledger-ink/80">Отключение</h3>
            <p className="text-xs text-ledger-ink/55">
              {hasPassword
                ? 'Подтвердите паролем от кабинета.'
                : 'У аккаунта нет пароля — подтвердите кодом из приложения.'}
            </p>
            <input
              type={hasPassword ? 'password' : 'text'}
              value={secretConfirm}
              onChange={(e) => setSecretConfirm(e.target.value)}
              placeholder={hasPassword ? 'Пароль' : 'Код из приложения'}
              autoComplete={hasPassword ? 'current-password' : 'one-time-code'}
              className={inputCls}
            />
            <button
              type="submit"
              disabled={busy || !secretConfirm}
              className="rounded-sm border border-danger/40 px-4 py-2.5 text-sm text-red-700 hover:bg-danger/10 disabled:opacity-50"
            >
              Выключить 2FA
            </button>
          </form>
        </div>
      )}
    </section>
  )
}

function BackupCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* без буфера обмена коды всё равно видно на экране */
    }
  }

  return (
    <div className="mb-5 rounded-sm border border-ledger-brass/50 bg-ledger-brass/10 p-4">
      <h3 className="mb-1 text-sm font-bold text-ledger-ink">Сохраните резервные коды</h3>
      <p className="mb-3 text-xs text-ledger-ink/65">
        Каждый код срабатывает один раз и заменяет код из приложения, если телефон недоступен.
        Показываем их только сейчас — потом можно будет лишь выпустить новые.
      </p>
      <ul className="mb-3 grid grid-cols-2 gap-1.5 font-ledger-mono text-sm sm:grid-cols-3">
        {codes.map((c) => (
          <li key={c} className="rounded-sm bg-ledger-page px-2.5 py-1.5 text-center">
            {c}
          </li>
        ))}
      </ul>
      <button
        onClick={copy}
        type="button"
        className="rounded-sm border border-ledger-ink/20 px-4 py-2 text-xs text-ledger-ink hover:bg-ledger-ink/5"
      >
        {copied ? 'Скопировано' : 'Скопировать все'}
      </button>
    </div>
  )
}
