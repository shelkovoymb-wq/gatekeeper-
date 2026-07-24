'use client'

export default function AnalyticsPage() {
  return (
    <div>
      <h1 style={{ color: '#667eea' }}>📊 Аналитика</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginTop: '20px' }}>
        {/* Revenue */}
        <div style={{ background: 'white', padding: '30px', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
          <h3 style={{ color: '#667eea', marginTop: 0 }}>💵 Доход (30 дней)</h3>
          <div style={{ fontSize: '2.5em', fontWeight: 'bold', color: '#4CAF50' }}>$2,450.00</div>
          <div style={{ color: '#999', marginTop: '10px' }}>↑ 15% от прошлого месяца</div>
        </div>

        {/* Transactions */}
        <div style={{ background: 'white', padding: '30px', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
          <h3 style={{ color: '#667eea', marginTop: 0 }}>📈 Транзакции</h3>
          <div style={{ fontSize: '2.5em', fontWeight: 'bold', color: '#2196F3' }}>156</div>
          <div style={{ color: '#999', marginTop: '10px' }}>Успешных платежей</div>
        </div>

        {/* Subscribers */}
        <div style={{ background: 'white', padding: '30px', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
          <h3 style={{ color: '#667eea', marginTop: 0 }}>👥 Подписчики</h3>
          <div style={{ fontSize: '2.5em', fontWeight: 'bold', color: '#9C27B0' }}>1,234</div>
          <div style={{ color: '#999', marginTop: '10px' }}>Активных подписок</div>
        </div>

        {/* Conversion */}
        <div style={{ background: 'white', padding: '30px', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
          <h3 style={{ color: '#667eea', marginTop: 0 }}>🎯 Конверсия</h3>
          <div style={{ fontSize: '2.5em', fontWeight: 'bold', color: '#FF9800' }}>8.5%</div>
          <div style={{ color: '#999', marginTop: '10px' }}>От посетителей к подписчикам</div>
        </div>
      </div>

      {/* Payment Methods */}
      <div style={{ background: 'white', padding: '30px', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', marginTop: '20px' }}>
        <h3 style={{ color: '#667eea', marginTop: 0 }}>💳 Источники платежей</h3>
        <div style={{ display: 'grid', gap: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '15px', borderBottom: '1px solid #eee' }}>
            <span>Telegram Stars</span>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <div style={{ width: '200px', height: '20px', background: '#e0e0e0', borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{ width: '45%', height: '100%', background: '#4CAF50' }}></div>
              </div>
              <span style={{ fontWeight: 'bold' }}>$1,102.50 (45%)</span>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '15px', borderBottom: '1px solid #eee' }}>
            <span>YooKassa</span>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <div style={{ width: '200px', height: '20px', background: '#e0e0e0', borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{ width: '35%', height: '100%', background: '#2196F3' }}></div>
              </div>
              <span style={{ fontWeight: 'bold' }}>$857.50 (35%)</span>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '15px', borderBottom: '1px solid #eee' }}>
            <span>CloudPayments</span>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <div style={{ width: '200px', height: '20px', background: '#e0e0e0', borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{ width: '15%', height: '100%', background: '#9C27B0' }}></div>
              </div>
              <span style={{ fontWeight: 'bold' }}>$367.50 (15%)</span>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Robokassa</span>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <div style={{ width: '200px', height: '20px', background: '#e0e0e0', borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{ width: '5%', height: '100%', background: '#FF9800' }}></div>
              </div>
              <span style={{ fontWeight: 'bold' }}>$122.50 (5%)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
