import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isLoginPage     = pathname.startsWith('/login')
  const isAuthCallback  = pathname.startsWith('/auth/callback')
  const isCronRoute     =
    pathname.startsWith('/api/ine-sync')      ||
    pathname.startsWith('/api/ine-discover')  ||
    pathname.startsWith('/api/seia-sync')     ||
    pathname.startsWith('/api/mop-sync')      ||
    pathname.startsWith('/api/pib-sync')      ||
    pathname.startsWith('/api/pib-discover')  ||
    pathname.startsWith('/api/stop-sync')     ||
    pathname.startsWith('/api/external-sync')

  if (!user && !isLoginPage && !isAuthCallback && !isCronRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|geojson)$).*)',
  ],
}
