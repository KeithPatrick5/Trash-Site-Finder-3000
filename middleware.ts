import { NextRequest, NextResponse } from 'next/server'

function unauthorized() {
  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Trash Site Finder 3000"' }
  })
}

export function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD
  if (!password) return NextResponse.next()

  const { pathname } = req.nextUrl
  if (pathname.startsWith('/_next') || pathname === '/favicon.ico') return NextResponse.next()

  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Basic ')) return unauthorized()

  try {
    const decoded = atob(auth.slice(6))
    const supplied = decoded.includes(':') ? decoded.split(':').slice(1).join(':') : decoded
    if (supplied === password) return NextResponse.next()
  } catch {}

  return unauthorized()
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
