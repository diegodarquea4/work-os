// Puente entre el catálogo unificado de proyectos (`v2_proyectos_inversion`,
// que alimentan el sync del SEIA y los demás) y la cartera curada del Comité
// Económico (`comite_economico_proyecto`, mig 094).
//
// La dirección es una sola: del catálogo a la cartera, y solo cuando alguien
// lo pide. El sync nunca escribe en la cartera — un proyecto importado deja de
// depender de su origen y pasa a ser del comité. Lo único que queda del enlace
// son las columnas `origen_*` (mig 106), que sirven para no duplicar, para
// volver al expediente, y para notar que el catálogo avanzó.

import type { EstadoActualEconomico } from '@/lib/comiteEconomico'

/** Una fila del catálogo, con lo que la cartera necesita de ella. */
export type CandidatoCatalogo = {
  id: string
  sistema_origen: string | null
  nombre: string
  titular: string | null
  estado: string | null
  tipo: string | null
  comuna_nombre: string | null
  inversion: number | null
  moneda: string | null
  fecha_presentacion: string | null
  via_ingreso: string | null
  url_ficha: string | null
  synced_at: string | null
}

/**
 * Estado del expediente → categoría de la cartera.
 *
 * El vocabulario del SEIA describe el ciclo de EVALUACIÓN ambiental, no el de
 * ejecución: "Aprobado" significa que tiene RCA, no que se esté construyendo.
 * Por eso el mapeo llega hasta 'Aprobado ambientalmente' y ni un paso más — si
 * el proyecto ya está en obras, eso lo sabe la persona, no la fuente.
 *
 * Lo no reconocido devuelve null: es mejor un campo vacío que una categoría
 * inventada que después nadie sabe de dónde salió.
 */
export function estadoCarteraDesdeCatalogo(estado: string | null | undefined): EstadoActualEconomico | null {
  if (!estado) return null
  const e = estado.trim().toLowerCase()
  if (e.startsWith('aprobado'))         return 'Aprobado ambientalmente'
  if (e.startsWith('en calificaci'))    return 'En calificación (SEIA)'
  if (e.startsWith('en admisi'))        return 'Preliminar'
  return null
}

/**
 * Las notas de arranque: lo que el catálogo sabe y la cartera no tiene columna
 * para guardar (comuna, tipología, vía de ingreso, el link al expediente).
 * Va a `notas` en vez de perderse, y queda editable como cualquier otra nota.
 */
export function notasDesdeCatalogo(c: CandidatoCatalogo): string | null {
  const lineas: string[] = []
  if (c.comuna_nombre)      lineas.push(`Comuna: ${c.comuna_nombre}`)
  if (c.tipo)               lineas.push(`Tipología: ${c.tipo}`)
  if (c.via_ingreso)        lineas.push(`Vía de ingreso: ${c.via_ingreso}`)
  if (c.fecha_presentacion) lineas.push(`Presentado: ${c.fecha_presentacion}`)
  if (c.url_ficha)          lineas.push(`Expediente: ${c.url_ficha}`)
  return lineas.length > 0 ? lineas.join('\n') : null
}

/** Lo que se inserta en `comite_economico_proyecto` al importar un candidato. */
export type FilaCarteraImportada = {
  region_cod: string
  nombre: string
  priorizado: boolean
  riesgo: boolean
  inversion_monto: number | null
  inversion_moneda: string | null
  fuente_financiamiento: string | null
  responsable_operativo: string | null
  estado_actual: string | null
  notas: string | null
  created_by_email: string | null
  origen_sistema: string | null
  origen_id: string
  origen_estado_al_importar: string | null
  origen_importado_at: string
}

/**
 * Prellena lo que el catálogo puede responder y **nada más**. Los campos que
 * son del comité y no de la fuente —plazo, priorización, SEREMI líder, mano de
 * obra, KPI, meta, vida útil, riesgo— quedan vacíos a propósito: son la
 * decisión que justifica que la cartera exista, y adivinarlos sería ruido.
 *
 * `fuente_financiamiento` y `responsable_operativo` salen ambos del titular:
 * en el SEIA el titular es la empresa que presenta el proyecto, que financia y
 * que va a operarlo. Si después se separan (una financia, otra opera), se
 * corrigen a mano en la ficha.
 */
export function filaDesdeCandidato(
  c: CandidatoCatalogo,
  regionCod: string,
  userEmail: string | null,
  ahora = new Date().toISOString(),
): FilaCarteraImportada {
  return {
    region_cod: regionCod,
    nombre: c.nombre,
    priorizado: false,
    riesgo: false,
    inversion_monto: c.inversion,
    inversion_moneda: c.inversion != null ? (c.moneda ?? null) : null,
    fuente_financiamiento: c.titular,
    responsable_operativo: c.titular,
    estado_actual: estadoCarteraDesdeCatalogo(c.estado),
    notas: notasDesdeCatalogo(c),
    created_by_email: userEmail,
    origen_sistema: c.sistema_origen,
    origen_id: c.id,
    origen_estado_al_importar: c.estado,
    origen_importado_at: ahora,
  }
}

/**
 * Shift+click: extiende la selección desde el último candidato tocado hasta
 * este, sobre la lista que la persona está VIENDO (ya filtrada) — nunca sobre
 * filas que un filtro escondió.
 *
 * Un rango siempre SUMA, nunca quita. Es lo que espera quien lo usa para
 * juntar muchos de una vez, y evita que un Shift+click descuidado borre una
 * selección larga que costó armar. Los ya importados se saltan: no son
 * seleccionables ni aunque caigan dentro del rango.
 */
export function extenderSeleccion(
  seleccionActual: Set<string>,
  visibles: { id: string }[],
  desdeIndice: number,
  hastaIndice: number,
  noSeleccionables: Set<string>,
): Set<string> {
  const desde = Math.min(desdeIndice, hastaIndice)
  const hasta = Math.max(desdeIndice, hastaIndice)
  const next = new Set(seleccionActual)
  for (const c of visibles.slice(desde, hasta + 1)) {
    if (!noSeleccionables.has(c.id)) next.add(c.id)
  }
  return next
}

/**
 * ¿El catálogo avanzó desde que se importó este proyecto? Es la pregunta que
 * hace útil volver a correr el sync: no solo sumar expedientes nuevos, sino
 * avisar que uno que ya se sigue cambió de estado en la fuente.
 *
 * Compara contra el estado congelado al importar, no contra `estado_actual` de
 * la cartera: ese lo edita la gente y describe la obra, no el expediente.
 */
export function catalogoAvanzo(
  origenEstadoAlImportar: string | null | undefined,
  estadoEnCatalogo: string | null | undefined,
): boolean {
  if (!origenEstadoAlImportar || !estadoEnCatalogo) return false
  return origenEstadoAlImportar.trim().toLowerCase() !== estadoEnCatalogo.trim().toLowerCase()
}
