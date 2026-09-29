import { ministerioCalza } from '@/lib/ministerios'
import { conduceComiteEconomico } from '@/lib/comiteEconomico'

/**
 * Reglas de la CARTERA PÚBLICA de un comité: qué iniciativas de la región mira
 * el comité, marcadas con una etiqueta en `prioridades_territoriales.tags`.
 *
 * Sirve a los dos comités que tienen cartera pública:
 *   · infraestructura (Nudos Críticos) — etiqueta configurable por región
 *     (`region_config.infraestructura_tag`, 'CRI'), más sus megaproyectos.
 *   · economico — etiqueta fija 'CER', sin megaproyectos.
 *
 * ── Por qué esto vive acá, puro y aparte de la ruta ─────────────────────────
 *
 * La ruta que lo usa escribe con SERVICE ROLE, y el service role se salta dos
 * barreras a la vez:
 *
 *   · la RLS de `prioridades_territoriales` (mig 087: un SEREMI solo ve las de
 *     su ministerio), y
 *   · el trigger de columnas `prioridades_check_update()`, que trata `tags`
 *     como campo DEFINICIONAL — su primera línea es
 *     `IF auth.uid() IS NULL THEN RETURN NEW` (mig 028, decisión explícita para
 *     que /api/import y /api/proposals puedan escribir la cartera).
 *
 * O sea que entre un POST y la columna `tags` no queda nada más que estas
 * funciones. Si `puedeGestionarCartera` devuelve `true` de más, alguien puede
 * etiquetar una iniciativa que ni siquiera tiene permitido LEER. Por eso están
 * puras y testeadas aparte del handler HTTP.
 *
 * ── Por qué una ruta y no un UPDATE desde el navegador ──────────────────────
 *
 * Porque `tags` es definicional: solo admin y editor la mueven. Sin esto, ni la
 * delegación que lleva el comité ni el SEREMI pueden armar su propia cartera, y
 * quedan pidiéndole a un admin que etiquete por ellos. Abrir la columna entera
 * en el trigger sería tocar la autorización de `prioridades_territoriales`; la
 * ruta acotada logra lo mismo sin migración.
 */

export type Comite = 'economico' | 'infraestructura'

export type AccionCartera = 'sumar' | 'quitar'

/** Etiqueta de la cartera pública del Comité Económico. Fija, no configurable
 *  por región — a diferencia de Infraestructura, que la lee de region_config. */
export const TAG_ECONOMICO = 'CER'

/**
 * Tag de Infraestructura cuando `region_config` no trae uno. La mig 060 lo
 * sembró con este valor en las 16 regiones, así que en la práctica el fallback
 * no se usa — está para que la ruta no escriba `null` si alguien borra la fila.
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
 * ¿Este usuario puede sumar o sacar ESTA iniciativa de la cartera del comité?
 *
 * Presupone que la capacidad del comité en la región de la iniciativa ya se
 * verificó — acá solo se resuelve el corte fino, que es DISTINTO en cada uno
 * porque cada comité lo decidió distinto:
 *
 *   · ECONÓMICO — solo quien CONDUCE (mig 112: "quién entra y quién sale de la
 *     cartera lo decide quien conduce"). Es el SEREMI de Economía o la
 *     delegación; un SEREMI sectorial aporta sobre lo que ya está adentro, pero
 *     no compone la cartera. Misma regla que ya rige a los proyectos privados,
 *     extendida acá a las iniciativas públicas: es la misma decisión.
 *
 *   · INFRAESTRUCTURA — la delegación con cualquier iniciativa de la región;
 *     un SEREMI solo con las de su propio ministerio. La columna `ministerio`
 *     es multi-valor (';'), así que basta con que el suyo esté entre los de la
 *     iniciativa: el SEREMI de MOP alcanza una "Vivienda;Obras Públicas".
 *
 * Fail-closed en los dos: un SEREMI sin ministerio declarado no mueve nada. Se
 * recupera completando el perfil, que es mejor que dejarlo componer cartera
 * ajena.
 */
export function puedeGestionarCartera(
  comite: Comite,
  role: string | null | undefined,
  ministerioUsuario: string | null | undefined,
  ministerioIniciativa: string | null | undefined,
): boolean {
  if (comite === 'economico') return conduceComiteEconomico(role, ministerioUsuario)
  if (role !== 'seremi') return true
  return ministerioCalza(ministerioUsuario, ministerioIniciativa)
}

/**
 * Lista blanca de etiquetas que la ruta puede tocar. Nada más.
 *
 * La ruta NO es un editor genérico de `tags` — si lo fuera, cualquiera con la
 * capacidad de un comité podría reescribir etiquetas que no tienen nada que ver
 * con él, saltándose el trigger que justamente las protege.
 *
 * El Económico pasa `megaproyectos` vacío: no tiene ese concepto, su cartera
 * pública es una lista plana.
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

/** ¿`tag` está en la lista blanca? Devuelve la forma CANÓNICA (la que define el
 *  comité), no la que mandó el cliente, o `null` si no aplica. */
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
