'use client'

import { Payment } from '@/types/payment'
import clsx from 'clsx'

interface PaymentListProps {
  payments: Payment[]
  loading?: boolean
}

const statusColors = {
  succeeded: 'bg-green-50 text-green-700 border-green-200',
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
  refunded: 'bg-blue-50 text-blue-700 border-blue-200'
}

export function PaymentList({ payments, loading }: PaymentListProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  if (payments.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
        <p className="text-gray-600">Платежей не найдено</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="px-4 py-3 text-left text-sm font-semibold">ID</th>
            <th className="px-4 py-3 text-left text-sm font-semibold">Сумма</th>
            <th className="px-4 py-3 text-left text-sm font-semibold">Статус</th>
            <th className="px-4 py-3 text-left text-sm font-semibold">Дата</th>
            <th className="px-4 py-3 text-left text-sm font-semibold">Действие</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {payments.map((payment) => (
            <tr key={payment.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm font-mono">{payment.id.slice(0, 8)}</td>
              <td className="px-4 py-3 text-sm font-semibold">
                {(payment.amount / 100).toFixed(2)} {payment.currency}
              </td>
              <td className="px-4 py-3 text-sm">
                <span className={clsx(
                  'inline-block px-2 py-1 rounded border text-xs font-semibold',
                  statusColors[payment.status as keyof typeof statusColors]
                )}>
                  {payment.status}
                </span>
              </td>
              <td className="px-4 py-3 text-sm">
                {new Date(payment.createdAt).toLocaleDateString()}
              </td>
              <td className="px-4 py-3 text-sm">
                <button className="text-blue-600 hover:underline">Детали</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
