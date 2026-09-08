/**
 * Autenticación de las rutas de sincronización y monitoreo.
 *
 * FUENTE ÚNICA. Estas rutas están exceptuadas del gate de sesión de `proxy.ts`
 * (las dispara un cron, no una persona) y por dentro escriben con service-role,
 * o sea saltándose la RLS. Su único control de acceso es este chequeo.
 *
 * Por qué existe (auditoría 2026-09-04): hasta ahora bastaba con mandar el
 * encabezado `x-vercel-cron: 1` para pasar. Ese encabezado lo pone el cliente,
 * no Vercel — un `curl -H "x-vercel-cron: 1"` disparaba cualquiera de los 15
 * syncs, incluido `seed-fase3`, que reescribe el catálogo de indicadores.
 * Además `vercel.json` declara `{"crons": []}`: los cron reales viven en
 * `.github/workflows/cron-syncs.yml` y ya usan Bearer, así que ese camino no
 * autenticaba nada y sí abría la puerta.
 *
 * Ahora: solo `Authorization: Bearer <CRON_SECRET>`, comparado en tiempo
 * constante y fallando cerrado si el secreto no está configurado.
 */

import { timingSafeEqual } from 'crypto'

/** Comparación en tiempo constante; false si las longitudes difieren. */
function secretosIguales(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  // timingSafeEqual exige el mismo largo. Comparar largos primero filtra por
  // tamaño, que no es secreto (el token tiene largo fijo).
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * ¿La petición trae el bearer del cron? Fail-closed: sin `CRON_SECRET` en el
 * entorno, nadie pasa (nunca "todos pasan").
 */
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = request.headers.get('authorization') ?? ''
  return secretosIguales(auth, `Bearer ${secret}`)
}
