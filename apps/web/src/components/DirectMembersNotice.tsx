'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

/**
 * Напоминание об участниках, заведённых в канал вручную.
 *
 * Платформа берёт с них комиссию в любом случае, и неоформленные уходят в счёт
 * по цене тарифа. Клиент должен узнать об этом до счёта, а не из счёта, —
 * поэтому напоминание висит на первой странице кабинета.
 */
export function DirectMembersNotice() {
  const [pending, setPending] = useState(0)

  useEffect(() => {
    fetch('/api/direct-members')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const rows: { status: string; billedAt: string | null }[] = Array.isArray(d?.data)
          ? d.data
          : []
        setPending(rows.filter((r) => r.status === 'pending' && !r.billedAt).length)
      })
      .catch(() => {})
  }, [])

  if (pending === 0) return null

  return (
    <Link
      href="/admin/direct-members"
      className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 transition hover:bg-amber-500/15"
    >
      <span>
        <b>{pending}</b>{' '}
        {pending === 1 ? 'участник добавлен' : 'участников добавлено'} в канал вручную и ещё не
        оформлен{pending === 1 ? '' : 'ы'}. Неоформленные пойдут в счёт по цене тарифа.
      </span>
      <span className="font-bold underline">Оформить →</span>
    </Link>
  )
}
