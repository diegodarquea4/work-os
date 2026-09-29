import type { AccionCartera, Comite } from '@/lib/comitesCartera'

/**
 * Llama a /api/comites/cartera para sumar o sacar una iniciativa de la cartera
 * pública de un comité. Devuelve el arreglo `tags` ya guardado.
 *
 * Por qué no `safeWrite`: ese helper existe porque la RLS responde 200 con cero
 * filas y el cliente cree que guardó. Acá el camino es otro — la escritura la
 * hace el servidor y el fracaso llega como status HTTP, así que el patrón de
 * call-site cambia: se lanza el mensaje del servidor y quien llama revierte su
 * update optimista y lo muestra con `window.alert`, igual que en el resto del
 * panel.
 *
 * `tags` vuelve del servidor en vez de reconstruirse acá a propósito: la forma
 * canónica de la etiqueta la decide el comité, no el navegador.
 */
export async function moverEnCartera(params: {
  comite: Comite
  prioridadId: number
  accion: AccionCartera
  tag?: string
}): Promise<string[]> {
  const res = await fetch('/api/comites/cartera', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })

  let payload: { tags?: string[]; error?: string } = {}
  try { payload = await res.json() } catch { /* respuesta sin JSON: cae al genérico */ }

  if (!res.ok) {
    throw new Error(payload.error ?? 'No se pudo actualizar la cartera del comité')
  }
  return payload.tags ?? []
}
