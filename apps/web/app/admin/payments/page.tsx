'use client'

import { useEffect, useState } from 'react'

interface Payment {
  id: string
  status: 'pending' | 'succeeded' | 'failed'
  amount: number
  provider: string
  createdAt: string
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Mock data for demo
    setPayments([
      { id: '1', status: 'succeeded', amount: 99.99, provider: 'yookassa', createdAt: new Date().toISOString() },
      { id: '2', status: 'pending', amount: 49.99, provider: 'telegram_stars', createdAt: new Date().toISOString() },
      { id: '3', status: 'succeeded', amount: 199.99, provider: 'cloudpayments', createdAt: new Date().toISOString() },
    ])
    setLoading(false)
  }, [])

  return (
    <main style={{ fontFamily: 'sans-serif', background: '#f5f5f5', minHeight: '100vh', padding: '20px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <h1 style={{ color: '#667eea' }}>💰 Управление платежами</h1>

        <div style={{ background: 'white', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f0f0f0' }}>
              <tr>
                <th style={{ padding: '15px', textAlign: 'left', color: '#667eea' }}>ID</th>
                <th style={{ padding: '15px', textAlign: 'left', color: '#667eea' }}>Статус</th>
                <th style={{ padding: '15px', textAlign: 'left', color: '#667eea' }}>Сумма</th>
                <th style={{ padding: '15px', textAlign: 'left', color: '#667eea' }}>Провайдер</th>
                <th style={{ padding: '15px', textAlign: 'left', color: '#667eea' }}>Дата</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '15px' }}>{p.id}</td>
                  <td style={{ padding: '15px' }}>
                    <span style={{
                      padding: '5px 10px',
                      borderRadius: '5px',
                      background: p.status === 'succeeded' ? '#4CAF50' : p.status === 'failed' ? '#f44336' : '#ff9800',
                      color: 'white',
                      fontSize: '0.9em'
                    }}>
                      {p.status === 'succeeded' ? '✅ Успешно' : p.status === 'failed' ? '❌ Ошибка' : '⏳ Ожидание'}
                    </span>
                  </td>
                  <td style={{ padding: '15px' }}>${p.amount.toFixed(2)}</td>
                  <td style={{ padding: '15px' }}>{p.provider}</td>
                  <td style={{ padding: '15px' }}>{new Date(p.createdAt).toLocaleString('ru-RU')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginTop: '40px' }}>
          <div style={{ background: 'white', padding: '20px', borderRadius: '10px', textAlign: 'center' }}>
            <div style={{ color: '#667eea', fontSize: '2em', fontWeight: 'bold' }}>$349.97</div>
            <div style={{ color: '#999', marginTop: '5px' }}>Всего доход</div>
          </div>
          <div style={{ background: 'white', padding: '20px', borderRadius: '10px', textAlign: 'center' }}>
            <div style={{ color: '#4CAF50', fontSize: '2em', fontWeight: 'bold' }}>2</div>
            <div style={{ color: '#999', marginTop: '5px' }}>Успешных</div>
          </div>
          <div style={{ background: 'white', padding: '20px', borderRadius: '10px', textAlign: 'center' }}>
            <div style={{ color: '#ff9800', fontSize: '2em', fontWeight: 'bold' }}>1</div>
            <div style={{ color: '#999', marginTop: '5px' }}>В ожидании</div>
          </div>
        </div>

        <div style={{ marginTop: '30px' }}>
          <a href="/" style={{ color: '#667eea', textDecoration: 'none' }}>← Назад на главную</a>
        </div>
      </div>
    </main>
  )
}
