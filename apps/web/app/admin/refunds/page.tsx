'use client'

import { useState } from 'react'

export default function RefundsPage() {
  const [refunds] = useState([
    { id: '1', paymentId: '5', amount: 99.99, reason: 'Клиент запросил', status: 'completed', date: new Date().toISOString() },
    { id: '2', paymentId: '8', amount: 49.99, reason: 'Ошибка обработки', status: 'pending', date: new Date().toISOString() },
  ])

  return (
    <div>
      <h1 style={{ color: '#667eea' }}>↩️ Управление возвратами</h1>

      <div style={{ background: 'white', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', marginTop: '20px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f0f0f0' }}>
            <tr>
              <th style={{ padding: '15px', textAlign: 'left', color: '#667eea' }}>ID</th>
              <th style={{ padding: '15px', textAlign: 'left', color: '#667eea' }}>Платеж</th>
              <th style={{ padding: '15px', textAlign: 'left', color: '#667eea' }}>Сумма</th>
              <th style={{ padding: '15px', textAlign: 'left', color: '#667eea' }}>Причина</th>
              <th style={{ padding: '15px', textAlign: 'left', color: '#667eea' }}>Статус</th>
              <th style={{ padding: '15px', textAlign: 'center', color: '#667eea' }}>Действие</th>
            </tr>
          </thead>
          <tbody>
            {refunds.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '15px' }}>{r.id}</td>
                <td style={{ padding: '15px' }}>#{r.paymentId}</td>
                <td style={{ padding: '15px' }}>${r.amount.toFixed(2)}</td>
                <td style={{ padding: '15px' }}>{r.reason}</td>
                <td style={{ padding: '15px' }}>
                  <span style={{
                    padding: '5px 10px',
                    borderRadius: '5px',
                    background: r.status === 'completed' ? '#4CAF50' : '#ff9800',
                    color: 'white',
                    fontSize: '0.9em'
                  }}>
                    {r.status === 'completed' ? '✅ Завершен' : '⏳ В обработке'}
                  </span>
                </td>
                <td style={{ padding: '15px', textAlign: 'center' }}>
                  <button style={{ padding: '5px 10px', background: '#2196F3', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                    Просмотр
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ background: 'white', padding: '30px', borderRadius: '10px', marginTop: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
        <h3 style={{ color: '#667eea', marginTop: 0 }}>📊 Статистика возвратов</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
          <div>
            <div style={{ fontSize: '2em', fontWeight: 'bold', color: '#f44336' }}>$149.98</div>
            <div style={{ color: '#999', marginTop: '5px' }}>Всего возвратов</div>
          </div>
          <div>
            <div style={{ fontSize: '2em', fontWeight: 'bold', color: '#4CAF50' }}>1</div>
            <div style={{ color: '#999', marginTop: '5px' }}>Завершено</div>
          </div>
          <div>
            <div style={{ fontSize: '2em', fontWeight: 'bold', color: '#ff9800' }}>1</div>
            <div style={{ color: '#999', marginTop: '5px' }}>В обработке</div>
          </div>
        </div>
      </div>
    </div>
  )
}
