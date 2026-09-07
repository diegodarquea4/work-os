// Categorías estándar de "Estado actual" para la cartera de proyectos del
// Comité Económico (comite_economico_proyecto, mig 086/087). El detalle
// libre (N° de RCA, fechas, contexto) vive aparte en `notas` — no se mezcla
// con la categoría, a diferencia de la carga inicial desde Excel.
export const ESTADO_ACTUAL_ECONOMICO_OPCIONES = [
  'Preliminar',
  'En calificación (SEIA)',
  'Aprobado ambientalmente',
  'En construcción',
  'En pruebas',
  'Operación',
  'Otro',
] as const

export type EstadoActualEconomico = typeof ESTADO_ACTUAL_ECONOMICO_OPCIONES[number]

// ── Descarga Excel de la cartera de proyectos privados ──────────────────────
// Toda la información del proyecto EXCEPTO el historial de avances completo
// (mig 088 agregó permisos/avances) — de eso solo va el último avance
// registrado, y los permisos del proyecto van en una sola columna separados
// por ";". `xlsx` se importa recién acá (lazy), mismo criterio que el resto
// de las descargas del sistema (lib/territorial/carrito.ts) — no se agrega
// al bundle inicial.

import { getSupabase } from '@/lib/supabase'
import type { ComiteEconomicoProyecto } from '@/lib/types'

function slug(texto: string): string {
  const sinTildes = texto.toLowerCase().replace(/[áàäâ]/g, 'a').replace(/[éèëê]/g, 'e')
    .replace(/[íìïî]/g, 'i').replace(/[óòöô]/g, 'o').replace(/[úùüû]/g, 'u').replace(/ñ/g, 'n')
  return sinTildes.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export async function exportProyectosEconomicosXlsx(
  proyectos: ComiteEconomicoProyecto[],
  regionNombre: string,
): Promise<void> {
  if (proyectos.length === 0) return

  const sb = getSupabase()
  const ids = proyectos.map(p => p.id)

  const [{ data: avancesData }, { data: permisosData }] = await Promise.all([
    // Ordenado por fecha/created_at desc: la primera fila que aparezca por
    // proyecto_id ya es su avance más reciente — no hace falta agrupar.
    sb.from('comite_economico_proyecto_seguimiento')
      .select('proyecto_id, fecha, descripcion, autor')
      .in('proyecto_id', ids)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false }),
    sb.from('comite_economico_proyecto_permiso')
      .select('proyecto_id, pas:pas_catalogo(n_pas)')
      .in('proyecto_id', ids),
  ])

  const ultimoAvancePorProyecto = new Map<number, { fecha: string; descripcion: string; autor: string | null }>()
  for (const a of (avancesData ?? []) as { proyecto_id: number; fecha: string; descripcion: string; autor: string | null }[]) {
    if (!ultimoAvancePorProyecto.has(a.proyecto_id)) ultimoAvancePorProyecto.set(a.proyecto_id, a)
  }

  const permisosPorProyecto = new Map<number, string[]>()
  for (const row of (permisosData ?? []) as unknown as { proyecto_id: number; pas: { n_pas: string } | null }[]) {
    if (!row.pas) continue
    const lista = permisosPorProyecto.get(row.proyecto_id) ?? []
    lista.push(row.pas.n_pas)
    permisosPorProyecto.set(row.proyecto_id, lista)
  }

  const filas = proyectos.map(p => {
    const ultimo = ultimoAvancePorProyecto.get(p.id)
    const permisos = (permisosPorProyecto.get(p.id) ?? []).sort()
    return {
      'Nombre proyecto': p.nombre,
      'Plazo': p.plazo ?? '',
      'Priorizado': p.priorizado ? 'Sí' : 'No',
      'Riesgo': p.riesgo ? 'Sí' : 'No',
      'SEREMI líder': p.seremi_lider ?? '',
      'Inversión (MM$)': p.inversion_monto ?? '',
      'Moneda': p.inversion_moneda ?? '',
      'Fuente de financiamiento': p.fuente_financiamiento ?? '',
      'Mano de obra directa': p.mano_obra_directa ?? '',
      'Mano de obra indirecta': p.mano_obra_indirecta ?? '',
      'Responsable operativo': p.responsable_operativo ?? '',
      'KPI': p.kpi ?? '',
      'Meta 2026 - 2027': p.meta_2026_2027 ?? '',
      'Estado inicial': p.estado_inicial ?? '',
      'Estado actual': p.estado_actual ?? '',
      'Notas': p.notas ?? '',
      'Vida útil (años)': p.vida_util_anios ?? '',
      'Permisos': permisos.join('; '),
      'Último avance — fecha': ultimo?.fecha ?? '',
      'Último avance — descripción': ultimo?.descripcion ?? '',
      'Último avance — autor': ultimo?.autor ?? '',
    }
  })

  const XLSX = await import('xlsx')
  const ws = XLSX.utils.json_to_sheet(filas)
  ws['!cols'] = [
    { wch: 34 }, { wch: 8 }, { wch: 11 }, { wch: 9 }, { wch: 26 },
    { wch: 13 }, { wch: 10 }, { wch: 26 }, { wch: 13 }, { wch: 15 },
    { wch: 26 }, { wch: 20 }, { wch: 32 }, { wch: 32 }, { wch: 24 },
    { wch: 32 }, { wch: 12 }, { wch: 22 }, { wch: 14 }, { wch: 44 }, { wch: 24 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Proyectos privados')

  const fecha = new Date().toLocaleDateString('en-CA')
  XLSX.writeFile(wb, `cartera_proyectos_economico_${slug(regionNombre)}_${fecha}.xlsx`)
}
