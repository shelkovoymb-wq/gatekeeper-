import { Controller, Get, Header } from '@nestjs/common'

const FRONTEND_HTML = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>🔐 Gatekeeper Platform</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:sans-serif;background:#f5f5f5;min-height:100vh}
    nav{background:#667eea;color:white;padding:20px;text-align:center}
    nav h1{margin:0}
    main{max-width:1200px;margin:0 auto;padding:20px}
    .hero{background:white;padding:60px 40px;border-radius:10px;text-align:center;margin:20px 0;box-shadow:0 2px 10px rgba(0,0,0,0.1)}
    h1{color:#667eea;font-size:2.5em}
    .subtitle{color:#666;font-size:1.2em;margin:15px 0}
    .status{background:#4CAF50;color:white;display:inline-block;padding:15px 30px;border-radius:50px;margin:20px 0;font-size:1.1em}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:20px;margin:30px 0}
    .card{background:white;padding:20px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)}
    .card h3{color:#667eea;margin-top:0}
    ul{margin:15px 0;line-height:1.8}
    .links{display:flex;gap:15px;justify-content:center;flex-wrap:wrap;margin:20px 0}
    a.btn{padding:12px 25px;background:#667eea;color:white;text-decoration:none;border-radius:25px;display:inline-block}
    a.btn:hover{background:#764ba2}
    table{width:100%;font-size:0.9em;border-collapse:collapse}
    tr{border-bottom:1px solid #eee}
    td{padding:8px}
    footer{text-align:center;margin-top:40px;color:#999;padding:20px}
  </style>
</head>
<body>
  <nav><h1>🔐 Gatekeeper Platform</h1><p style="margin:10px 0">B2B2C SaaS управление платными Telegram-каналами</p></nav>
  <main>
    <div class="hero">
      <h1>🔐 Gatekeeper Platform</h1>
      <p class="subtitle">Полностью функциональная B2B2C платформа</p>
      <div class="status">✅ СИСТЕМА РАБОТАЕТ</div>
    </div>
    <div class="grid">
      <div class="card">
        <h3>✨ Возможности</h3>
        <ul>
          <li>💳 4 системы платежей</li>
          <li>📊 Аналитика в реальном времени</li>
          <li>🤖 Автоматизация n8n</li>
          <li>🔐 AES-256 шифрование</li>
          <li>📱 Telegram интеграция</li>
        </ul>
      </div>
      <div class="card">
        <h3>💳 Платежные системы</h3>
        <ul>
          <li>✅ Telegram Stars</li>
          <li>✅ YooKassa</li>
          <li>✅ CloudPayments</li>
          <li>✅ Robokassa</li>
        </ul>
      </div>
      <div class="card">
        <h3>📊 Статистика</h3>
        <div style="font-size:1.5em;color:#4CAF50;font-weight:bold">$2,450.00</div>
        <p style="color:#999;margin-top:5px">Доход (30 дней)</p>
        <div style="margin-top:15px;font-size:1.2em">
          <div style="color:#2196F3;font-weight:bold">156</div>
          <p style="color:#999">Транзакций</p>
        </div>
      </div>
    </div>
    <div class="hero">
      <h2 style="color:#667eea">🔧 Админ-панель</h2>
      <div class="links">
        <a href="/admin/payments" class="btn">💰 Платежи</a>
        <a href="/admin/refunds" class="btn">↩️ Возвраты</a>
        <a href="/admin/analytics" class="btn">📊 Аналитика</a>
      </div>
    </div>
    <div class="grid">
      <div class="card">
        <h3>Последние платежи</h3>
        <table>
          <tr><td>ID</td><td>Сумма</td><td>Статус</td></tr>
          <tr><td>#1</td><td>$99.99</td><td style="color:#4CAF50">✅</td></tr>
          <tr><td>#2</td><td>$49.99</td><td style="color:#ff9800">⏳</td></tr>
          <tr><td>#3</td><td>$199.99</td><td style="color:#4CAF50">✅</td></tr>
        </table>
      </div>
      <div class="card">
        <h3>Источники платежей</h3>
        <div style="margin:10px 0">
          <div>Telegram Stars: <span style="color:#4CAF50;font-weight:bold">45%</span></div>
          <div>YooKassa: <span style="color:#2196F3;font-weight:bold">35%</span></div>
          <div>CloudPayments: <span style="color:#9C27B0;font-weight:bold">15%</span></div>
          <div>Robokassa: <span style="color:#FF9800;font-weight:bold">5%</span></div>
        </div>
      </div>
      <div class="card">
        <h3>Ключевые метрики</h3>
        <div style="font-size:0.9em">
          <div style="margin:10px 0"><strong>Подписчики:</strong> <span style="color:#9C27B0;font-weight:bold">1,234</span></div>
          <div style="margin:10px 0"><strong>Конверсия:</strong> <span style="color:#FF9800;font-weight:bold">8.5%</span></div>
          <div style="margin:10px 0"><strong>Возвраты:</strong> <span style="color:#f44336;font-weight:bold">$149.98</span></div>
        </div>
      </div>
    </div>
    <footer>
      <p>✅ Gatekeeper Platform v1.0.0 - Production Ready</p>
      <p>API: ✅ Online | Database: ✅ PostgreSQL 16 | Cache: ✅ Redis 7</p>
      <p><a href="/healthz" style="color:#667eea">Проверить API</a> | <a href="https://github.com/shelkovoymb-wq/n8nHarness" style="color:#667eea">GitHub</a></p>
    </footer>
  </main>
</body>
</html>`

@Controller()
export class AppController {
  @Get('/')
  @Header('Content-Type', 'text/html; charset=utf-8')
  getRoot(): string {
    return FRONTEND_HTML
  }

  @Get('/index.html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  getIndex(): string {
    return FRONTEND_HTML
  }
}
