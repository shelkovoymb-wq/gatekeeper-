import type { MetadataRoute } from 'next'

const SITE_URL = 'https://gatekeeper.skud24.ru'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/login', '/register'],
        // Личные кабинеты — за авторизацией, индексировать нечего и не нужно.
        disallow: ['/admin/', '/owner/', '/api/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
