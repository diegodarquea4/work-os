// Reconciliación entre el catálogo y la cartera del Comité Económico (mig 109).
//
// Cada vez que el catálogo se refresca, los proyectos importados se contrastan
// contra él. Lo que cambió en la fuente se anota en la bitácora del proyecto y,
// cuando es seguro, se actualiza el campo.
//
// La regla que decide qué es "seguro": **solo se pisa lo que nadie tocó a
// mano**. Un campo cuyo valor en la cartera sigue siendo idéntico al del último
// snapshot es un campo que nadie editó, y actualizarlo es propagar la fuente.
// Si alguien lo corrigió —porque el titular del SEIA no es quien realmente
// opera, por ejemplo— ese valor manda: se reporta el cambio de la fuente en la
// bitácora y la decisión queda en quien lleva la ficha.
//
// Se compara contra el ÚLTIMO snapshot, no contra el momento de importar. Si
// no, un cambio ya reportado volvería a reportarse en cada corrida.

import { montoEnMillones } from '@/lib/carteraOrigen'

/** Lo que la fuente sabe de un proyecto y la cartera espeja. */
export type SnapshotOrigen = {
  nombre: string | null
  titular: string | null
  estado: string | null
  /** Ya en la escala de la cartera (millones), no el bruto de la fuente. */
  inversion: number | null
}

export type CampoReconciliable = 'nombre' | 'titular' | 'estado' | 'inversion'

export type Cambio = {
  campo: CampoReconciliable
  etiqueta: string
  antes: string | number | null
  despues: string | number | null
  /** Si el valor en la cartera todavía calza con el snapshot, se puede propagar. */
  seguroDeAplicar: boolean
}

const ETIQUETAS: Record<CampoReconciliable, string> = {
  nombre:    'Nombre',
  titular:   'Titular',
  estado:    'Estado en el SEIA',
  inversion: 'Inversión',
}

/** Fila del catálogo, con lo que la reconciliación necesita. */
export type FilaCatalogo = {
  nombre: string | null
  titular: string | null
  estado: string | null
  /** Bruto de la fuente; se lleva a millones acá, igual que al importar. */
  inversion: number | null
}

export function snapshotDesdeCatalogo(fila: FilaCatalogo): SnapshotOrigen {
  return {
    nombre:    fila.nombre ?? null,
    titular:   fila.titular ?? null,
    estado:    fila.estado ?? null,
    inversion: montoEnMillones(fila.inversion),
  }
}

/** Los campos de la cartera que espejan a la fuente. */
export type EspejoCartera = {
  nombre: string | null
  fuente_financiamiento: string | null
  responsable_operativo: string | null
  inversion_monto: number | null
}

function texto(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()
}

function numero(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  // Un decimal, que es la precisión con que se guarda el monto.
  return Math.abs(a - b) < 0.05
}

/**
 * Qué cambió en la fuente desde la última reconciliación.
 *
 * `previo` ausente (proyectos importados antes de la mig 109) devuelve lista
 * vacía: no hay contra qué comparar, y reportar todo como "cambió" sería
 * inundar la bitácora de ruido el día que esto se enciende. La primera corrida
 * solo siembra el snapshot.
 */
export function cambiosDesdeCatalogo(
  previo: SnapshotOrigen | null | undefined,
  actual: SnapshotOrigen,
  cartera: EspejoCartera,
): Cambio[] {
  if (!previo) return []
  const cambios: Cambio[] = []

  if (!texto(previo.nombre, actual.nombre)) {
    cambios.push({
      campo: 'nombre', etiqueta: ETIQUETAS.nombre,
      antes: previo.nombre, despues: actual.nombre,
      seguroDeAplicar: texto(cartera.nombre, previo.nombre),
    })
  }

  if (!texto(previo.titular, actual.titular)) {
    // El titular alimenta dos campos de la cartera; solo es seguro propagarlo
    // si NINGUNO de los dos fue corregido a mano.
    const intacto = texto(cartera.fuente_financiamiento, previo.titular)
      && texto(cartera.responsable_operativo, previo.titular)
    cambios.push({
      campo: 'titular', etiqueta: ETIQUETAS.titular,
      antes: previo.titular, despues: actual.titular,
      seguroDeAplicar: intacto,
    })
  }

  if (!texto(previo.estado, actual.estado)) {
    // El estado del expediente NO se propaga a `estado_actual`: ese campo
    // describe la obra y lo lleva el comité, no el trámite ambiental. Solo se
    // informa.
    cambios.push({
      campo: 'estado', etiqueta: ETIQUETAS.estado,
      antes: previo.estado, despues: actual.estado,
      seguroDeAplicar: false,
    })
  }

  if (!numero(previo.inversion, actual.inversion)) {
    cambios.push({
      campo: 'inversion', etiqueta: ETIQUETAS.inversion,
      antes: previo.inversion, despues: actual.inversion,
      seguroDeAplicar: numero(cartera.inversion_monto, previo.inversion),
    })
  }

  return cambios
}

function valorLegible(campo: CampoReconciliable, v: string | number | null): string {
  if (v == null || v === '') return '—'
  if (campo === 'inversion') return `${Number(v).toLocaleString('es-CL')} MM$`
  return String(v)
}

/**
 * La línea que queda en la bitácora. Se escribe para que alguien que la lea en
 * seis meses entienda qué pasó sin abrir el expediente: qué campo, de qué a
 * qué, y si la ficha quedó actualizada o se respetó lo que había escrito.
 */
export function descripcionDeCambios(cambios: Cambio[]): string {
  const lineas = cambios.map(c => {
    const base = `${c.etiqueta}: ${valorLegible(c.campo, c.antes)} → ${valorLegible(c.campo, c.despues)}`
    return c.seguroDeAplicar ? base : `${base} (se mantuvo el valor de la ficha)`
  })
  const cabecera = cambios.length === 1
    ? 'El SEIA actualizó este proyecto.'
    : `El SEIA actualizó ${cambios.length} datos de este proyecto.`
  return [cabecera, ...lineas].join('\n')
}

/** Los campos de la cartera a escribir, solo con los cambios seguros. */
export function parcheDeCartera(cambios: Cambio[], actual: SnapshotOrigen): Record<string, unknown> {
  const parche: Record<string, unknown> = {}
  for (const c of cambios) {
    if (!c.seguroDeAplicar) continue
    if (c.campo === 'nombre')    parche.nombre = actual.nombre
    if (c.campo === 'inversion') parche.inversion_monto = actual.inversion
    if (c.campo === 'titular') {
      parche.fuente_financiamiento = actual.titular
      parche.responsable_operativo = actual.titular
    }
  }
  return parche
}
