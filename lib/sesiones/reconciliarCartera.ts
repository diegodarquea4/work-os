// Contrasta la cartera del Comité Económico contra el catálogo y deja rastro.
//
// Corre del lado del servidor, justo después de que el sync refresca el
// catálogo, para que un cambio en la fuente se note sin que nadie tenga que
// abrir una ficha a mirar.
//
// **Esto cambia una regla anterior**: hasta la mig 106 el sync no escribía
// nunca en `comite_economico_proyecto`. Ahora sí, de forma acotada — solo
// campos que siguen calzando con el último snapshot, o sea que nadie editó a
// mano. Lo que una persona corrigió no se pisa: el cambio de la fuente queda
// anotado en la bitácora y la decisión es de quien lleva la ficha. La regla
// vive en `lib/carteraReconciliar.ts` y tiene tests.

import type { getSupabaseAdmin } from '@/lib/supabaseServer'
import {
  cambiosDesdeCatalogo,
  descripcionDeCambios,
  parcheDeCartera,
  snapshotDesdeCatalogo,
  type EspejoCartera,
  type SnapshotOrigen,
} from '@/lib/carteraReconciliar'

// Mismo alias que usa generarActa: el cliente service-role, sin tipos
// generados de la base.
type Db = ReturnType<typeof getSupabaseAdmin>

type ProyectoCartera = {
  id: number
  nombre: string | null
  fuente_financiamiento: string | null
  responsable_operativo: string | null
  inversion_monto: number | null
  origen_id: string | null
  origen_snapshot: SnapshotOrigen | null
}

export type ResumenReconciliacion = {
  revisados: number
  conCambios: number
  camposActualizados: number
  errores: string[]
}

/**
 * Reconcilia los proyectos importados de una región (o de todas si se omite).
 *
 * Silencioso por diseño en dos casos: un proyecto sin `origen_snapshot` solo
 * lo siembra —no reporta nada—, porque es un importado anterior a esta
 * funcionalidad y anunciar "cambió todo" el día que se enciende sería ruido; y
 * un proyecto cuyo expediente ya no está en el catálogo se salta sin tocarlo,
 * porque desaparecer de la ventana de seguimiento no es un cambio del proyecto.
 */
export async function reconciliarCartera(
  db: Db,
  regionCod?: string,
): Promise<ResumenReconciliacion> {
  const resumen: ResumenReconciliacion = { revisados: 0, conCambios: 0, camposActualizados: 0, errores: [] }

  let q = db
    .from('comite_economico_proyecto')
    .select('id, nombre, fuente_financiamiento, responsable_operativo, inversion_monto, origen_id, origen_snapshot')
    .not('origen_id', 'is', null)
  if (regionCod) q = q.eq('region_cod', regionCod)

  const { data: proyectos, error } = await q
  if (error) {
    resumen.errores.push(`cartera: ${error.message}`)
    return resumen
  }
  const filas = (proyectos ?? []) as ProyectoCartera[]
  if (filas.length === 0) return resumen

  const ids = [...new Set(filas.map(p => p.origen_id).filter((x): x is string => !!x))]
  const { data: catalogo, error: catErr } = await db
    .from('v2_proyectos_inversion')
    .select('id, nombre, titular, estado, inversion')
    .in('id', ids)
  if (catErr) {
    resumen.errores.push(`catálogo: ${catErr.message}`)
    return resumen
  }
  const porId = new Map(
    ((catalogo ?? []) as { id: string; nombre: string | null; titular: string | null; estado: string | null; inversion: number | null }[])
      .map(c => [c.id, c]),
  )

  const ahora = new Date().toISOString()

  for (const p of filas) {
    const fuente = p.origen_id ? porId.get(p.origen_id) : undefined
    if (!fuente) continue
    resumen.revisados++

    const actual = snapshotDesdeCatalogo(fuente)
    const espejo: EspejoCartera = {
      nombre: p.nombre,
      fuente_financiamiento: p.fuente_financiamiento,
      responsable_operativo: p.responsable_operativo,
      inversion_monto: p.inversion_monto != null ? Number(p.inversion_monto) : null,
    }
    const cambios = cambiosDesdeCatalogo(p.origen_snapshot, actual, espejo)

    const parche: Record<string, unknown> = {
      origen_snapshot: actual,
      origen_reconciliado_at: ahora,
      ...parcheDeCartera(cambios, actual),
    }
    // `updated_at` solo se mueve si de verdad cambió un campo del proyecto:
    // sembrar el snapshot no es una edición.
    const aplicados = Object.keys(parche).length - 2
    if (aplicados > 0) parche.updated_at = ahora

    const { error: upErr } = await db
      .from('comite_economico_proyecto').update(parche).eq('id', p.id)
    if (upErr) {
      resumen.errores.push(`proyecto ${p.id}: ${upErr.message}`)
      continue
    }
    resumen.camposActualizados += aplicados

    if (cambios.length === 0) continue
    resumen.conCambios++

    const { error: segErr } = await db
      .from('comite_economico_proyecto_seguimiento').insert({
        proyecto_id: p.id,
        fecha: ahora.slice(0, 10),
        descripcion: descripcionDeCambios(cambios),
        autor: null,
        automatico: true,
      })
    if (segErr) resumen.errores.push(`bitácora ${p.id}: ${segErr.message}`)
  }

  return resumen
}
