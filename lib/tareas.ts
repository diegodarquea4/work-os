// Horizonte temporal de una tarea de Planificación — no es un campo que el
// usuario elija: se infiere de la duración entre fecha_inicio y fecha_termino
// (calco del pedido: "las fechas se calculen en función del horizonte
// temporal propio de las tareas"). Se usa para etiquetar cada barra en
// TareaGantt.
export type HorizonteTarea = 'semanal' | 'mensual' | 'trimestral'

export const HORIZONTE_LABEL: Record<HorizonteTarea, string> = {
  semanal: 'Semanal',
  mensual: 'Mensual',
  trimestral: 'Trimestral',
}

export function horizonteTarea(fechaInicio: string | null, fechaTermino: string | null): HorizonteTarea | null {
  if (!fechaInicio || !fechaTermino) return null
  const ini = new Date(fechaInicio + 'T12:00:00')
  const fin = new Date(fechaTermino + 'T12:00:00')
  const dias = Math.round((fin.getTime() - ini.getTime()) / (1000 * 60 * 60 * 24))
  if (dias <= 10) return 'semanal'
  if (dias <= 45) return 'mensual'
  return 'trimestral'
}
