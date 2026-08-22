import { NextResponse } from 'next/server'
import { backendPublicGet } from '@/lib/cabinet'

/** Какие кнопки внешнего входа показывать. Ключи провайдеров тут не светятся. */
export async function GET() {
  try {
    const data = await backendPublicGet('/v1/auth/oauth/providers')
    return NextResponse.json({ success: true, data })
  } catch {
    // Недоступность бэкенда не должна ломать форму входа по паролю.
    return NextResponse.json({ success: true, data: [] })
  }
}
