interface StatsTileProps {
  label: string
  value: string | number
  icon?: React.ReactNode
  hint?: string
  accent?: 'primary' | 'secondary' | 'accent' | 'success'
}

const accentChip: Record<NonNullable<StatsTileProps['accent']>, string> = {
  primary: 'bg-ledger-ink/10 text-ledger-ink',
  secondary: 'bg-ledger-brass/15 text-ledger-brass',
  accent: 'bg-ledger-stamp/15 text-ledger-stamp',
  success: 'bg-success/15 text-emerald-700',
}

export function StatsTile({ label, value, icon, hint, accent = 'primary' }: StatsTileProps) {
  return (
    <div className="rounded-sm bg-ledger-page p-6 text-ledger-ink shadow-[4px_6px_0_0_rgba(0,0,0,0.25)] transition hover:-translate-y-0.5">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-ledger-mono text-xs uppercase tracking-wide text-ledger-ink/50">{label}</p>
          <p className="mt-3 font-display text-3xl tracking-tight text-ledger-ink">{value}</p>
          {hint && <p className="mt-2 text-xs text-ledger-ink/50">{hint}</p>}
        </div>
        {icon && (
          <div className={`flex h-11 w-11 items-center justify-center rounded-sm text-xl ${accentChip[accent]}`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}
