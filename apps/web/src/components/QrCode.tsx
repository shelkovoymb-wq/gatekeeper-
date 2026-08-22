'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/**
 * QR рисуем в браузере: otpauth-URL содержит TOTP-секрет, и незачем гонять его
 * ещё и через генератор картинок — он и так уже пришёл на эту страницу.
 */
export function QrCode({ value, size = 208 }: { value: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    setFailed(false)
    QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#1c1917', light: '#ffffff' },
    })
      .then((url) => {
        if (alive) setDataUrl(url)
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [value, size])

  if (failed) {
    return (
      <div
        className="flex items-center justify-center rounded-sm border border-ledger-ink/15 bg-white p-4 text-center text-xs text-ledger-ink/60"
        style={{ width: size, height: size }}
      >
        Не удалось нарисовать QR — введите ключ вручную
      </div>
    )
  }

  if (!dataUrl) {
    return (
      <div
        className="animate-pulse rounded-sm border border-ledger-ink/15 bg-ledger-pageDark"
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- data: URI, next/image здесь не нужен
    <img
      src={dataUrl}
      alt="QR-код для приложения-аутентификатора"
      width={size}
      height={size}
      className="rounded-sm border border-ledger-ink/15 bg-white"
    />
  )
}
