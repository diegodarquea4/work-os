/**
 * Verificación en dos pasos (2FA / TOTP) — lógica pura de nivel de garantía.
 *
 * Supabase codifica el "Authenticator Assurance Level" en el claim `aal` del
 * JWT de sesión: `aal1` = pasó solo contraseña; `aal2` = completó también el
 * segundo factor. Con eso + si el usuario tiene un factor TOTP verificado se
 * deriva qué le toca hacer. Este módulo NO llama a la red ni a Supabase — solo
 * decodifica el token y clasifica el estado, así es testeable y sirve tanto en
 * el proxy (Edge) como en el cliente.
 *
 * Alcance vigente (decisión Diego 2026-08-06): 2FA obligatorio para todos.
 */

export type MfaState = 'aal2' | 'needs-challenge' | 'needs-enroll'

/**
 * Estado de MFA de una sesión ya autenticada (contraseña OK):
 *  - `aal2`            → segundo factor completado, acceso pleno.
 *  - `needs-challenge` → tiene factor verificado pero la sesión sigue en aal1
 *                        (debe ingresar el código del autenticador).
 *  - `needs-enroll`    → no tiene factor (debe configurar 2FA — overlay).
 *
 * Fail-closed: un `aal` nulo/desconocido se trata como aal1, así ante cualquier
 * duda se exige el segundo factor en vez de dejar pasar.
 */
export function mfaState(aal: string | null, hasVerifiedFactor: boolean): MfaState {
  if (aal === 'aal2') return 'aal2'
  return hasVerifiedFactor ? 'needs-challenge' : 'needs-enroll'
}

/**
 * Decodifica el claim `aal` del access token (JWT) sin verificar la firma —
 * el token ya fue validado por `supabase.auth.getUser()` antes de llegar acá;
 * acá solo se lee un claim. Devuelve null si el token falta o no parsea.
 * Usa APIs disponibles en Edge/browser/Node ≥18 (atob, TextDecoder).
 */
export function decodeAal(accessToken: string | null | undefined): string | null {
  if (!accessToken) return null
  const parts = accessToken.split('.')
  if (parts.length < 2) return null
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1])) as { aal?: unknown }
    return typeof payload.aal === 'string' ? payload.aal : null
  } catch {
    return null
  }
}

function base64UrlDecode(seg: string): string {
  const pad = seg.length % 4 === 0 ? '' : '='.repeat(4 - (seg.length % 4))
  const b64 = seg.replace(/-/g, '+').replace(/_/g, '/') + pad
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}
