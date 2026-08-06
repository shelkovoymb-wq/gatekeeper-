import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Gatekeeper — доступ к закрытому Telegram-каналу по подписке'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: '#16261E',
          color: '#F2EAD3',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            fontSize: 34,
            color: '#A9834B',
            letterSpacing: 4,
            textTransform: 'uppercase',
          }}
        >
          Gatekeeper
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 28, fontSize: 68, lineHeight: 1.15, fontWeight: 700 }}>
          <span>Ваш канал — закрытая дверь.</span>
          <span style={{ color: '#B43B2F' }}>Вход — по подписке.</span>
        </div>
        <div style={{ display: 'flex', marginTop: 40, fontSize: 30, color: '#F2EAD3CC', maxWidth: 980 }}>
          Оплатил — сразу внутри. Не продлил — бот сам закроет доступ. Без вашего участия.
        </div>
      </div>
    ),
    { ...size },
  )
}
