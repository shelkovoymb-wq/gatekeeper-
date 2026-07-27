import { NextResponse } from 'next/server'
import { cabinetGet } from '@/lib/cabinet'

export async function GET() {
  try {
    const data = await cabinetGet('/v1/auth/me')
    return NextResponse.json({ success: true, data })
  } catch {
    return NextResponse.json({ success: false }, { status: 401 })
  }
}
