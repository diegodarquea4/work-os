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
