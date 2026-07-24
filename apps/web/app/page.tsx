'use client'

import { useEffect, useState } from 'react'

export default function Home() {
  const [health, setHealth] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/healthz')
      .then(r => r.json())
      .then(setHealth)
      .catch(e => console.error(e))
      .finally(() => setLoading(false))
  }, [])

  return (
    <main style={{ fontFamily: 'sans-serif', background: '#f5f5f5', minHeight: '100vh', padding: '20px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <h1 style={{ color: '#667eea', textAlign: 'center' }}>🔐 Gatekeeper Platform</h1>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginTop: '40px' }}>

          {/* API Status Card */}
          <div style={{ background: 'white', padding: '30px', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
            <h2 style={{ color: '#667eea', marginTop: 0 }}>📡 API Status</h2>
            {loading ? (
              <p>Загрузка...</p>
            ) : health ? (
              <div style={{ color: '#4CAF50', fontSize: '1.1em' }}>
                <p>✅ Status: {health.status}</p>
                <p>Service: {health.service}</p>
                <p>DB: {health.db ? '✅ Connected' : '❌ Offline'}</p>
                <small style={{ color: '#999' }}>{new Date(health.ts).toLocaleString('ru-RU')}</small>
              </div>
            ) : (
              <p style={{ color: '#f44336' }}>❌ API недоступен</p>
            )}
          </div>

          {/* Features Card */}
          <div style={{ background: 'white', padding: '30px', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
            <h2 style={{ color: '#667eea', marginTop: 0 }}>✨ Возможности</h2>
            <ul style={{ lineHeight: '2', color: '#666' }}>
              <li>💳 4 системы платежей</li>
              <li>📊 Аналитика в реальном времени</li>
              <li>🤖 Автоматизация n8n</li>
              <li>🔐 Шифрование AES-256</li>
              <li>📱 Telegram интеграция</li>
            </ul>
          </div>

          {/* Payments Card */}
          <div style={{ background: 'white', padding: '30px', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
            <h2 style={{ color: '#667eea', marginTop: 0 }}>💳 Платежи</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', color: '#666' }}>
              <span>✅ Telegram Stars</span>
              <span>✅ YooKassa</span>
              <span>✅ CloudPayments</span>
              <span>✅ Robokassa</span>
            </div>
          </div>
        </div>

        {/* Admin Links */}
        <div style={{ marginTop: '40px', textAlign: 'center', background: 'white', padding: '40px', borderRadius: '10px' }}>
          <h2 style={{ color: '#667eea' }}>🔧 Админ-панель</h2>
          <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '20px' }}>
            <a href="/admin/payments" style={{ padding: '12px 25px', background: '#667eea', color: 'white', textDecoration: 'none', borderRadius: '5px' }}>
              💰 Платежи
            </a>
            <a href="/admin/refunds" style={{ padding: '12px 25px', background: '#667eea', color: 'white', textDecoration: 'none', borderRadius: '5px' }}>
              ↩️ Возвраты
            </a>
            <a href="/admin/analytics" style={{ padding: '12px 25px', background: '#667eea', color: 'white', textDecoration: 'none', borderRadius: '5px' }}>
              📊 Аналитика
            </a>
            <a href="/portal/subscriptions" style={{ padding: '12px 25px', background: '#764ba2', color: 'white', textDecoration: 'none', borderRadius: '5px' }}>
              👤 Кабинет
            </a>
          </div>
        </div>

        {/* Footer */}
        <footer style={{ textAlign: 'center', marginTop: '60px', color: '#999', fontSize: '0.9em' }}>
          <p>Gatekeeper Platform v1.0.0 | Production Ready 🚀</p>
          <p>© 2026 | <a href="https://github.com/shelkovoymb-wq/n8nHarness" style={{ color: '#667eea' }}>GitHub</a></p>
        </footer>
      </div>
    </main>
  )
}
