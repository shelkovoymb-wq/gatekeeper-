import { ReactNode } from 'react'

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f5f5f5' }}>
      <nav style={{ width: '250px', background: '#667eea', color: 'white', padding: '20px', position: 'fixed', height: '100vh' }}>
        <h2 style={{ marginTop: 0 }}>🔐 Gatekeeper</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          <li style={{ marginBottom: '15px' }}><a href="/" style={{ color: 'white', textDecoration: 'none' }}>← На главную</a></li>
          <li style={{ marginBottom: '15px' }}><a href="/admin/payments" style={{ color: 'white', textDecoration: 'none' }}>💰 Платежи</a></li>
          <li style={{ marginBottom: '15px' }}><a href="/admin/refunds" style={{ color: 'white', textDecoration: 'none' }}>↩️ Возвраты</a></li>
          <li style={{ marginBottom: '15px' }}><a href="/admin/analytics" style={{ color: 'white', textDecoration: 'none' }}>📊 Аналитика</a></li>
        </ul>
      </nav>
      <main style={{ marginLeft: '250px', width: 'calc(100% - 250px)', padding: '20px' }}>
        {children}
      </main>
    </div>
  )
}
