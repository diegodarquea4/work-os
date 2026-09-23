/**
 * Reglas de la cartera del Comité de Infraestructura: quién puede sumar o sacar
 * una iniciativa, qué etiquetas se pueden tocar, y cómo se modifica el arreglo
 * `tags` sin pisar lo que no se vino a cambiar.
 *
 * ── Por qué esto vive acá, puro y aparte de la ruta ─────────────────────────
 *
 * La ruta `/api/comite-infraestructura/cartera` escribe con SERVICE ROLE, y el
 * service role se salta dos barreras a la vez:
 *
 *   · la RLS de `prioridades_territoriales` (mig 087: un SEREMI solo ve las de
 *     su ministerio), y
 *   · el trigger de columnas `prioridades_check_update()`, que trata `tags`
 *     como campo DEFINICIONAL — su primera línea es
 *     `IF auth.uid() IS NULL THEN RETURN NEW` (mig 028, decisión explícita para
 *     que /api/import y /api/proposals puedan escribir la cartera).
 *
 * O sea que entre un POST y la columna `tags` no queda nada más que estas
 * funciones. Si `puedeMoverEtiquetaCartera` devuelve `true` de más, un SEREMI
 * puede etiquetar una iniciativa que ni siquiera tiene permitido LEER. Por eso
 * están puras y testeadas aparte del handler HTTP.
 *
 * ── Por qué una ruta y no un UPDATE desde el navegador ──────────────────────
 *
 * Porque `tags` es definicional: hoy solo admin y editor pueden moverla. La
 * delegación que lleva el comité no puede armar su propia cartera, y por eso
 * en producción hay UNA sola iniciativa etiquetada. Abrir la columna entera en
 * el trigger sería tocar la autorización de `prioridades_territoriales`, que
 * está fuera de alcance por ahora; la ruta acotada logra lo mismo sin migración.
 */

import { ministerioCalza } from '@/lib/ministerios'

export type AccionCartera = 'sumar' | 'quitar'

/**
 * Tag del comité cuando `region_config` no trae uno. La mig 060 lo sembró con
 * este valor en las 16 regiones, así que en la práctica el fallback no se usa —
 * está para que la ruta no escriba `null` si alguien borra la fila de config.
 *
 * OJO: el valor REAL se lee siempre de `region_config.infraestructura_tag`.
 * Esta constante no es la fuente de verdad; una región puede tener el suyo.
 */
export const TAG_INFRAESTRUCTURA_DEFAULT = 'CRI'

/** Igualdad de etiquetas: sin espacios alrededor y sin distinguir mayúsculas.
 *  'CRI', 'cri' y ' Cri ' son la misma etiqueta para efectos de la cartera. */
function mismaEtiqueta(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase('es') === b.trim().toLocaleLowerCase('es')
}

/**
 * ¿Este usuario puede mover la etiqueta del comité en ESTA iniciativa?
 *
 * Presupone que la capacidad `comite.infraestructura.operar` en la región de la
 * iniciativa ya se verificó — acá solo se resuelve el corte por ministerio.
 *
 *   · Delegación (admin / editor / regional): cualquier iniciativa de la región.
 *     Es quien arma la cartera del comité.
 *   · SEREMI: solo las de su propio ministerio. La columna `ministerio` es
 *     multi-valor (';'), así que basta con que el suyo esté entre los de la
 *     iniciativa — el SEREMI de MOP alcanza una "Vivienda;Obras Públicas".
 *
 * Fail-closed: un SEREMI sin ministerio declarado no mueve nada. Se recupera
 * completando el perfil, que es mejor que dejarlo etiquetar cartera ajena.
 *
 * Espeja `current_user_sees_ministerio()` de la mig 087 vía `ministerioCalza`,
 * que es la misma función que usa el filtro de UI. Acá NO es "solo UI": es la
 * autorización, porque la barrera de la base no corre para el service role.
 */
export function puedeMoverEtiquetaCartera(
  role: string | null | undefined,
  ministerioUsuario: string | null | undefined,
  ministerioIniciativa: string | null | undefined,
): boolean {
  if (role !== 'seremi') return true
  return ministerioCalza(ministerioUsuario, ministerioIniciativa)
}

/**
 * Lista blanca de etiquetas que la ruta puede tocar en una región: la del
 * comité y sus megaproyectos curados (mig 061). Nada más.
 *
 * La ruta NO es un editor genérico de `tags` — si lo fuera, cualquiera con la
 * capacidad del comité podría reescribir etiquetas que no tienen nada que ver
 * con él, saltándose el trigger que justamente las protege.
 */
export function etiquetasGestionables(
  tagComite: string | null | undefined,
  megaproyectos: string[] | null | undefined,
): string[] {
  const tag = (tagComite ?? '').trim() || TAG_INFRAESTRUCTURA_DEFAULT
  const lista = [tag]
  for (const m of megaproyectos ?? []) {
    const limpio = (m ?? '').trim()
    if (limpio && !lista.some(x => mismaEtiqueta(x, limpio))) lista.push(limpio)
  }
  return lista
}

/** ¿`tag` está en la lista blanca de la región? Devuelve la forma CANÓNICA
 *  (la de `region_config`), no la que mandó el cliente, o `null` si no aplica. */
export function etiquetaCanonica(
  tag: string | null | undefined,
  gestionables: string[],
): string | null {
  const pedido = (tag ?? '').trim()
  if (!pedido) return null
  return gestionables.find(g => mismaEtiqueta(g, pedido)) ?? null
}

/**
 * Suma o saca `tag` del arreglo, dejando el resto EXACTAMENTE como estaba.
 *
 * Detalles que importan:
 *   · Si no hay nada que cambiar devuelve la MISMA referencia, para que el
 *     llamador detecte el no-op con `===` y se ahorre el UPDATE (mismo criterio
 *     que `filtrarPorCapas` en lib/capas.ts).
 *   · `sumar` deja la etiqueta en su forma canónica y borra las variantes de
 *     mayúsculas que hubiera. Es a propósito: el resto del módulo compara con
 *     `tags.includes(tag)` —comparación exacta—, así que una iniciativa con
 *     'cri' quedaría fuera del comité aunque "tenga la etiqueta". Después de
 *     `sumar`, `tags.includes(canonica)` es siempre verdadero.
 *   · `quitar` saca todas las variantes, por lo mismo.
 */
export function aplicarEtiqueta(
  tags: string[] | null | undefined,
  tag: string,
  accion: AccionCartera,
): string[] {
  const actuales = tags ?? []
  const canonica = tag.trim()
  const coincidencias = actuales.filter(t => mismaEtiqueta(t, canonica))

  if (accion === 'quitar') {
    if (coincidencias.length === 0) return actuales
    return actuales.filter(t => !mismaEtiqueta(t, canonica))
  }

  // sumar: ya está en forma canónica y una sola vez → nada que hacer.
  if (coincidencias.length === 1 && coincidencias[0] === canonica) return actuales
  return [...actuales.filter(t => !mismaEtiqueta(t, canonica)), canonica]
}
