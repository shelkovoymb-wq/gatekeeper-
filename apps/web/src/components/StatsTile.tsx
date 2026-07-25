interface StatsTileProps {
  label: string
  value: string | number
  icon?: React.ReactNode
  hint?: string
  accent?: 'primary' | 'secondary' | 'accent' | 'success'
}

const accentRing: Record<NonNullable<StatsTileProps['accent']>, string> = {
  primary: 'from-primary-500/20 to-primary-500/0 text-primary-300',
  secondary: 'from-secondary-500/20 to-secondary-500/0 text-secondary-300',
  accent: 'from-accent-500/20 to-accent-500/0 text-accent-300',
  success: 'from-emerald-500/20 to-emerald-500/0 text-emerald-300',
}

export function StatsTile({ label, value, icon, hint, accent = 'primary' }: StatsTileProps) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg transition-all duration-standard hover:border-slate-700 hover:shadow-xl">
      <div
        className={`pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br blur-2xl ${accentRing[accent]}`}
      />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-400">{label}</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-white">{value}</p>
          {hint && <p className="mt-2 text-xs text-slate-500">{hint}</p>}
        </div>
        {icon && (
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-xl ${accentRing[accent]}`}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}
