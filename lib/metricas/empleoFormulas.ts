/**
 * Fórmulas de empleo INE, portadas verbatim del generador original
 * (generar_dashboard.py / SPEC_PANEL_por_pestana.md §5). Compartidas entre
 * `lib/hooks/useMetricasEmpleo.ts` (cliente) y `lib/kitDeViaje/metricasData.ts`
 * (servidor) para no reimplementar el cálculo en dos lugares.
 */

/** Fuerza de trabajo: ft = ocupados / (1 - tasa/100). */
export function calcFuerzaTrabajo(ocupados: number | null, tasa: number | null): number | null {
  if (ocupados == null || tasa == null || tasa >= 100 || tasa < 0) return null
  return parseFloat((ocupados / (1 - tasa / 100)).toFixed(1))
}

/** Desocupados: desocupados = ft - ocupados. */
export function calcDesocupados(ft: number | null, ocupados: number | null): number | null {
  if (ft == null || ocupados == null) return null
  return parseFloat((ft - ocupados).toFixed(1))
}

/**
 * Tasa de desocupación en trimestre móvil (estándar INE):
 * tasa_tm[i] = Σ desocupados[i-2..i] / Σ ft[i-2..i] * 100. Los 2 primeros
 * períodos de la serie no tienen ventana completa → null.
 */
export function calcTasaTrimestreMovil(
  desocupados: (number | null)[],
  ft: (number | null)[],
  i: number,
): number | null {
  if (i < 2) return null
  const ds = [desocupados[i - 2], desocupados[i - 1], desocupados[i]]
  const fs = [ft[i - 2], ft[i - 1], ft[i]]
  if (ds.some(v => v == null) || fs.some(v => v == null)) return null
  const sumFt = (fs as number[]).reduce((a, b) => a + b, 0)
  if (!sumFt) return null
  return parseFloat(((ds as number[]).reduce((a, b) => a + b, 0) / sumFt * 100).toFixed(2))
}
