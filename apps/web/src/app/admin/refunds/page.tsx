'use client'

import { useState } from 'react'
import { Layout } from '@/components/Layout'

export default function RefundsPage() {
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Возвраты</h1>
          <p className="text-gray-600">Управление рефандами платежей</p>
        </div>
      </div>
    </Layout>
  )
}
