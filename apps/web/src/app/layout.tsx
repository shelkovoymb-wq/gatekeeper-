import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Gatekeeper — Кабинет',
  description: 'Платные Telegram-каналы: кабинет клиента и панель владельца платформы',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru" className="dark">
      <body className="bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  )
}
