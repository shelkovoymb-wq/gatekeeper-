'use client'

import { useState, useCallback } from 'react'
import { Payment } from '@/types/payment'
import { api } from '@/lib/api'

export function usePayments() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPayments = useCallback(async (filters?: any) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (filters?.status && filters.status !== 'all') {
        params.append('status', filters.status)
      }
      if (filters?.provider && filters.provider !== 'all') {
        params.append('provider', filters.provider)
      }
      if (filters?.dateRange && filters.dateRange !== 'all') {
        params.append('dateRange', filters.dateRange)
      }

      const response = await api.get(`/payments?${params.toString()}`)
      setPayments(response.data || [])
    } catch (err: any) {
      setError(err.message || 'Failed to fetch payments')
    } finally {
      setLoading(false)
    }
  }, [])

  const refundPayment = useCallback(async (paymentId: string, amount?: number) => {
    try {
      await api.post(`/payments/${paymentId}/refund`, { amount })
      await fetchPayments()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refund payment')
      return false
    }
  }, [fetchPayments])

  return { payments, loading, error, fetchPayments, refundPayment }
}
