'use client'

import { Layout } from '@/components/Layout'

export default function AnalyticsPage() {
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Аналитика</h1>
          <p className="text-gray-600">Статистика платежей и доходов</p>
        </div>
      </div>
    </Layout>
  )
}
