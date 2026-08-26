import { NextResponse } from 'next/server'
import { cabinetUpload, BackendError } from '@/lib/cabinet'

/** Загрузка вложения: тело пробрасывается на бэкенд как есть, вместе с границей multipart. */
export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') || ''
    if (!contentType.startsWith('multipart/form-data')) {
      return NextResponse.json({ success: false, error: 'ожидается multipart/form-data' }, { status: 400 })
    }
    const body = await req.arrayBuffer()
    const data = await cabinetUpload('/v1/cabinet/posts/media', body, contentType)
    return NextResponse.json({ success: true, data, timestamp: new Date().toISOString() })
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 502
    return NextResponse.json({ success: false, error: (e as Error).message }, { status })
  }
}
