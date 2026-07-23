'use client'

import { useEffect, useState } from 'react'
import { Layout } from '@/components/Layout'
import { PaymentList } from '@/components/payments/PaymentList'
import { PaymentFilters } from '@/components/payments/PaymentFilters'
import { usePayments } from '@/lib/hooks/usePayments'

export default function PaymentsPage() {
  const { payments, loading, error, fetchPayments } = usePayments()
  const [filters, setFilters] = useState({
    status: 'all',
    provider: 'all',
    dateRange: '30d'
  })

  useEffect(() => {
    fetchPayments(filters)
  }, [filters])

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Платежи</h1>
          <p className="text-gray-600">Управление платежами и рефандами</p>
        </div>

        <PaymentFilters filters={filters} onFiltersChange={setFilters} />

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
            {error}
          </div>
        )}

        <PaymentList payments={payments} loading={loading} />
      </div>
    </Layout>
  )
}
