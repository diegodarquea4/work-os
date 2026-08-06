import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

const SECURITY_HEADERS: [string, string][] = [
  // SAMEORIGIN (no DENY) porque embebemos /tour/explainer.html en iframe
  // dentro del propio panel (Centro de Ayuda). DENY rompía esa carga.
  ['X-Frame-Options',        'SAMEORIGIN'],
  ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy',        'strict-origin-when-cross-origin'],
  ['Permissions-Policy',     'camera=(), microphone=(), geolocation=()'],
]

export async function proxy(request: NextRequest) {
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
  // Activación de cuenta: la usa un usuario SIN sesión (define su clave con un
  // código). Debe ser accesible sin redirigir a /login.
  const isPublicAccount = pathname.startsWith('/api/account/activate')
  const isCronRoute     =
    pathname.startsWith('/api/ine-sync')      ||
    pathname.startsWith('/api/ine-discover')  ||
    pathname.startsWith('/api/seia-sync')     ||
    pathname.startsWith('/api/mop-sync')      ||
    pathname.startsWith('/api/pib-sync')      ||
    pathname.startsWith('/api/pib-discover')  ||
    pathname.startsWith('/api/stop-sync')     ||
    pathname.startsWith('/api/external-sync') ||
    pathname.startsWith('/api/sinca-sync')   ||
    pathname.startsWith('/api/cne-sync')     ||
    pathname.startsWith('/api/deis-sync')    ||
    pathname.startsWith('/api/dipres-sync')  ||
    pathname.startsWith('/api/mineduc-sync') ||
    pathname.startsWith('/api/subtel-sync')  ||
    pathname.startsWith('/api/mercadopublico-sync') ||
    pathname.startsWith('/api/seed-fase3')   ||
    pathname.startsWith('/api/v2/')

  if (!user && !isLoginPage && !isAuthCallback && !isCronRoute && !isPublicAccount) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Attach security headers to every response
  for (const [key, value] of SECURITY_HEADERS) {
    response.headers.set(key, value)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|geojson|html)$).*)',
  ],
}
