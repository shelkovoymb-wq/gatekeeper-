'use client'

interface PaymentFiltersProps {
  filters: {
    status: string
    provider: string
    dateRange: string
  }
  onFiltersChange: (filters: any) => void
}

export function PaymentFilters({ filters, onFiltersChange }: PaymentFiltersProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">Статус</label>
          <select
            value={filters.status}
            onChange={(e) => onFiltersChange({ ...filters, status: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg"
          >
            <option value="all">Все статусы</option>
            <option value="succeeded">Успешно</option>
            <option value="pending">В ожидании</option>
            <option value="failed">Ошибка</option>
            <option value="refunded">Возвращено</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Провайдер</label>
          <select
            value={filters.provider}
            onChange={(e) => onFiltersChange({ ...filters, provider: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg"
          >
            <option value="all">Все провайдеры</option>
            <option value="yookassa">ЮKassa</option>
            <option value="cloudpayments">CloudPayments</option>
            <option value="robokassa">Robokassa</option>
            <option value="stars">Telegram Stars</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Период</label>
          <select
            value={filters.dateRange}
            onChange={(e) => onFiltersChange({ ...filters, dateRange: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg"
          >
            <option value="7d">Последние 7 дней</option>
            <option value="30d">Последние 30 дней</option>
            <option value="90d">Последние 90 дней</option>
            <option value="all">Все время</option>
          </select>
        </div>
      </div>
    </div>
  )
}
