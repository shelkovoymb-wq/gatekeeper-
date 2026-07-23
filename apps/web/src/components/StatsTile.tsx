interface StatsTileProps {
  label: string
  value: string | number
  icon?: React.ReactNode
  trend?: 'up' | 'down' | 'neutral'
}

export function StatsTile({ label, value, icon, trend }: StatsTileProps) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-md hover:shadow-lg transition-shadow duration-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{label}</p>
          <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-slate-50">{value}</p>
        </div>
        {icon && <div className="text-3xl opacity-80">{icon}</div>}
      </div>

      {trend && (
        <div className="mt-4 inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-700 px-3 py-1">
          <span
            className={`text-xs font-medium ${
              trend === 'up'
                ? 'text-success'
                : trend === 'down'
                  ? 'text-danger'
                  : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {trend === 'up' ? '↑ ' : trend === 'down' ? '↓ ' : '→ '}
            {trend !== 'neutral' ? 'vs previous' : 'stable'}
          </span>
        </div>
      )}
    </div>
  )
}
