import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { decodeAal, mfaState } from '@/lib/mfa'

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

  // Verificación en dos pasos: una sesión que pasó contraseña (aal1) pero tiene
  // un factor TOTP verificado debe completar el segundo factor antes de usar la
  // app. El claim `aal` se decodifica del token ya validado por getUser() y los
  // factores vienen en el mismo `user` → sin llamadas de red extra.
  let needsChallenge = false
  if (user) {
    const { data: { session } } = await supabase.auth.getSession()
    const hasVerifiedFactor = (user.factors ?? []).some(f => f.status === 'verified')
    needsChallenge = mfaState(decodeAal(session?.access_token), hasVerifiedFactor) === 'needs-challenge'
  }

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

  // Un usuario aal1-con-factor SÍ puede quedarse en /login (ahí completa el
  // segundo factor). Solo lo mandamos a "/" si ya está plenamente verificado.
  if (user && isLoginPage && !needsChallenge) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Gate del segundo factor: fuera de /login (y de las rutas públicas/cron), una
  // sesión con challenge pendiente se bloquea. Páginas → a /login a verificar;
  // rutas /api → 401 (no redirigir un fetch a HTML).
  if (needsChallenge && !isLoginPage && !isAuthCallback && !isCronRoute && !isPublicAccount) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Verificación en dos pasos requerida' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', request.url))
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
