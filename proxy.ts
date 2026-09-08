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

  // Gate del segundo factor. Una sesión que pasó la contraseña (aal1) pero tiene
  // un factor TOTP verificado todavía NO está autenticada del todo: le falta el
  // código. El claim `aal` se lee del token que getUser() ya validó y los
  // factores vienen en el mismo `user`, así que no hay llamadas de red extra.
  //
  // Ojo: esto solo ataja a quien YA configuró el 2FA. A quien no lo ha
  // configurado lo maneja la política de adopción en el cliente
  // (lib/mfaPolicy.ts), que avisa antes de bloquear.
  let faltaSegundoFactor = false
  if (user) {
    const { data: { session } } = await supabase.auth.getSession()
    const tieneFactor = (user.factors ?? []).some(f => f.status === 'verified')
    faltaSegundoFactor = mfaState(decodeAal(session?.access_token), tieneFactor) === 'needs-challenge'
  }

  const { pathname } = request.nextUrl
  const isLoginPage     = pathname.startsWith('/login')
  const isAuthCallback  = pathname.startsWith('/auth/callback')
  // Activación de cuenta: la usa un usuario SIN sesión (define su clave con un
  // código). Debe ser accesible sin redirigir a /login.
  const isPublicAccount = pathname.startsWith('/api/account/activate')
  // Canjear un código de respaldo lo hace, por definición, una sesión a la que
  // le falta el segundo factor (perdió el teléfono). Si el gate de más abajo la
  // bloqueara, la salida de emergencia quedaría tras la puerta que abre.
  const isMfaRecover    = pathname.startsWith('/api/account/mfa/recover')
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
    pathname.startsWith('/api/v2/')          ||
    // /api/health lo llama el cron diario (GitHub Actions) con Bearer y SIN
    // cookie de sesión. Faltaba en esta lista, así que el proxy lo redirigía a
    // /login: devolvía 307, el workflow solo trata como error el >= 400, y el
    // chequeo que debía avisar de syncs caídos pasaba en verde sin ejecutarse.
    // Se auto-protege con isCronAuthorized, igual que los syncs.
    pathname.startsWith('/api/health')

  if (!user && !isLoginPage && !isAuthCallback && !isCronRoute && !isPublicAccount) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Quien tiene el código pendiente SÍ puede quedarse en /login: ahí lo ingresa.
  // Sin esta condición se produce un bucle de redirecciones.
  if (user && isLoginPage && !faltaSegundoFactor) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Con el código pendiente no se entra a ninguna otra parte. Las páginas van a
  // /login a completarlo; las rutas /api devuelven 401 (redirigir un fetch a
  // HTML deja al cliente parseando una página de login como si fuera JSON).
  if (faltaSegundoFactor && !isLoginPage && !isAuthCallback && !isCronRoute && !isPublicAccount && !isMfaRecover) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Verificación en dos pasos requerida', code: 'mfa_required' },
        { status: 401 },
      )
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
