import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Gatekeeper — Панель управления',
  description: 'Управление платными Telegram-каналами: каналы, подписчики, платежи',
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
