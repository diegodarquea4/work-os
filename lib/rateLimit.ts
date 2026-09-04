/**
 * Límite de intentos por clave, en memoria del proceso.
 *
 * Para qué: `/api/account/activate` es la única ruta pública sin sesión y
 * escribe con service-role. Su único freno era el contador de 8 intentos por
 * código, que además es global por correo — o sea, un tercero podía quemarle
 * los intentos a alguien y dejarlo sin poder activar su cuenta. No había ningún
 * límite por IP.
 *
 * LIMITACIÓN CONOCIDA Y ACEPTADA: el estado vive en memoria de cada instancia
 * serverless, así que el límite es por instancia y se pierde en cada arranque en
 * frío. No sirve contra un atacante distribuido; sí contra el caso real (un
 * script desde una IP). El límite de verdad, por borde, requiere el firewall de
 * Vercel, que es de plan Pro — decisión tomada de quedarse en Hobby por ahora.
 */

type Registro = { conteo: number; expira: number }

const registros = new Map<string, Registro>()

/** Evita que el Map crezca sin control si llegan muchas claves distintas. */
const MAX_CLAVES = 5000

function limpiarVencidos(ahora: number): void {
  for (const [clave, r] of registros) {
    if (r.expira <= ahora) registros.delete(clave)
  }
}

export type ResultadoLimite = {
  /** true → la petición pasa. false → hay que responder 429. */
  permitido: boolean
  /** Segundos hasta que se libere el cupo (para el header Retry-After). */
  reintentarEn: number
}

/**
 * Registra un intento para `clave` y dice si se pasó del máximo.
 *
 * Ventana deslizante simple: el primer intento fija el vencimiento y los
 * siguientes suman dentro de esa ventana.
 */
export function registrarIntento(
  clave: string,
  maxIntentos: number,
  ventanaSegundos: number,
): ResultadoLimite {
  const ahora = Date.now()
  if (registros.size > MAX_CLAVES) limpiarVencidos(ahora)

  const actual = registros.get(clave)
  if (!actual || actual.expira <= ahora) {
    registros.set(clave, { conteo: 1, expira: ahora + ventanaSegundos * 1000 })
    return { permitido: true, reintentarEn: 0 }
  }

  actual.conteo += 1
  const reintentarEn = Math.max(1, Math.ceil((actual.expira - ahora) / 1000))
  return { permitido: actual.conteo <= maxIntentos, reintentarEn }
}

/**
 * IP del cliente según los encabezados que pone el borde de Vercel. Si no
 * viene ninguno, devuelve 'desconocida' — todas esas peticiones comparten cupo,
 * que es el comportamiento conservador correcto.
 */
export function ipDeLaPeticion(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return request.headers.get('x-real-ip')?.trim() || 'desconocida'
}

/** Solo para los tests: vacía el estado entre casos. */
export function _resetRateLimit(): void {
  registros.clear()
}
