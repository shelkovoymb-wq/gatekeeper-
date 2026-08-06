import type { Metadata } from 'next'
import { Yeseva_One, PT_Sans, PT_Mono } from 'next/font/google'
import './globals.css'

const SITE_URL = 'https://gatekeeper.skud24.ru'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Gatekeeper — Кабинет',
    template: '%s · Gatekeeper',
  },
  description: 'Платные Telegram-каналы: кабинет клиента и панель владельца платформы',
  openGraph: {
    siteName: 'Gatekeeper',
    locale: 'ru_RU',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
  },
  robots: { index: true, follow: true },
}

// Шрифты лендинга (реестр/тикет-эстетика) — подключены здесь как CSS-переменные,
// используются только классами font-display/font-ledger-body/font-ledger-mono на '/'.
const displayFont = Yeseva_One({
  weight: '400',
  subsets: ['cyrillic', 'latin'],
  variable: '--font-display',
  display: 'swap',
})
const bodyFont = PT_Sans({
  weight: ['400', '700'],
  subsets: ['cyrillic', 'latin'],
  variable: '--font-ledger-body',
  display: 'swap',
})
const monoFont = PT_Mono({
  weight: '400',
  subsets: ['cyrillic', 'latin'],
  variable: '--font-ledger-mono',
  display: 'swap',
})

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="ru"
      className={`dark ${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}
    >
      <body className="bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  )
}
