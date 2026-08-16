import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dir = path.dirname(fileURLToPath(import.meta.url))

// Заголовки безопасности. Панель авторизуется сессионной кукой, так что цена
// чужого фрейма или утёкшего Referer — чужая сессия.
//
// script-src/style-src с 'unsafe-inline': Next.js встраивает инлайновый скрипт
// гидрации и инлайновые стили. Убрать его можно только переведя всё на nonce
// (нужен middleware, генерирующий nonce на каждый запрос) — это отдельная
// работа, а не строчка в конфиге. Остальные директивы затянуты полностью:
// внешних CDN, шрифтов и аналитики в сборке нет, всё своё.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: CSP },
  // frame-ancestors уже закрывает фрейминг в современных браузерах,
  // X-Frame-Options оставлен для старых.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  // TLS терминируется на Traefik, наружу сайт только по https.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
]

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(dir, '../../'),
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default config
