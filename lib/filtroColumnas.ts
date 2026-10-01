/**
 * Filtros por columna «modo Excel»: cada encabezado abre un menú para
 * ordenar y filtrar esa columna. Puro, para testearlo sin DOM
 * (`__tests__/filtroColumnas.test.ts`); lo usa la cartera del módulo
 * Seguimiento de la inversión en el SEIA.
 *
 * Como en Excel:
 *  - Una columna de texto se filtra marcando valores. Sin filtro = todos
 *    marcados; las celdas vacías son un valor más, «(Vacías)».
 *  - Las opciones de una columna salen de las filas que pasan los filtros de
 *    las OTRAS columnas: si filtraste Vía = DIA, la lista de Tipo muestra solo
 *    los tipos que tienen DIA. Si salieran de las que pasan su propio filtro,
 *    al desmarcar un valor desaparecería y no habría cómo volver a marcarlo.
 *  - Números y fechas se filtran por rango («desde / hasta»), que es lo que se
 *    hace con montos e ingresos; una lista de 300 montos distintos no sirve.
 */

export const VACIAS = '(Vacías)'

export type ColumnaFiltrable<F> =
  | { clave: string; tipo: 'lista'; valores: (f: F) => (string | null)[] }
  | { clave: string; tipo: 'numero'; valor: (f: F) => number | null }
  | { clave: string; tipo: 'fecha'; valor: (f: F) => string | null }

/** `incluidos` = los valores marcados. Rango: extremos opcionales, inclusive. */
export type Filtro =
  | { tipo: 'lista'; incluidos: Set<string> }
  | { tipo: 'rango'; desde: string | null; hasta: string | null }

export type Filtros = Record<string, Filtro | undefined>
export type Orden = { clave: string; dir: 1 | -1 } | null

const valoresDe = <F>(c: Extract<ColumnaFiltrable<F>, { tipo: 'lista' }>, f: F) => {
  const vs = c.valores(f).map(v => (v ?? '').trim()).filter(Boolean)
  return vs.length ? vs : [VACIAS]
}

export function pasaFiltro<F>(fila: F, col: ColumnaFiltrable<F>, filtro: Filtro | undefined): boolean {
  if (!filtro) return true
  if (col.tipo === 'lista') {
    if (filtro.tipo !== 'lista') return true
    // Con varios valores (una comuna «Osorno, San Pablo»), basta que uno esté marcado.
    return valoresDe(col, fila).some(v => filtro.incluidos.has(v))
  }
  if (filtro.tipo !== 'rango') return true
  const v = col.valor(fila)
  if (filtro.desde == null && filtro.hasta == null) return true
  if (v == null) return false
  if (col.tipo === 'numero') {
    const n = v as number
    return (filtro.desde == null || n >= Number(filtro.desde)) && (filtro.hasta == null || n <= Number(filtro.hasta))
  }
  const s = v as string
  return (filtro.desde == null || s >= filtro.desde) && (filtro.hasta == null || s <= filtro.hasta)
}

/** Las filas que pasan todos los filtros, salvo el de la columna `excepto`. */
export function filtrarFilas<F>(filas: F[], columnas: ColumnaFiltrable<F>[], filtros: Filtros, excepto?: string): F[] {
  const activas = columnas.filter(c => c.clave !== excepto && filtros[c.clave])
  if (!activas.length) return filas
  return filas.filter(f => activas.every(c => pasaFiltro(f, c, filtros[c.clave])))
}

const comparar = new Intl.Collator('es', { sensitivity: 'base', numeric: true }).compare

/** Valores de una columna de lista con su conteo, en orden alfabético y «(Vacías)» al final. */
export function opcionesDeColumna<F>(filas: F[], col: Extract<ColumnaFiltrable<F>, { tipo: 'lista' }>): { valor: string; n: number }[] {
  const cuenta = new Map<string, number>()
  for (const f of filas) for (const v of new Set(valoresDe(col, f))) cuenta.set(v, (cuenta.get(v) ?? 0) + 1)
  return [...cuenta.entries()]
    .map(([valor, n]) => ({ valor, n }))
    .sort((a, b) => (a.valor === VACIAS ? 1 : b.valor === VACIAS ? -1 : comparar(a.valor, b.valor)))
}

/** Ordena sin tocar el arreglo original. Los vacíos van siempre al final. */
export function ordenarFilas<F>(filas: F[], col: ColumnaFiltrable<F> | undefined, dir: 1 | -1): F[] {
  if (!col) return filas
  const clave = (f: F): string | number | null => {
    if (col.tipo === 'lista') { const v = col.valores(f).find(x => x && x.trim()); return v ? v.trim() : null }
    return col.valor(f)
  }
  return [...filas].sort((a, b) => {
    const x = clave(a), y = clave(b)
    if (x == null && y == null) return 0
    if (x == null) return 1
    if (y == null) return -1
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : comparar(String(x), String(y))
    return c * dir
  })
}

/** Un filtro de lista que quedó con todo marcado equivale a no tener filtro. */
export function normalizarFiltro(filtro: Filtro | undefined, todas: string[]): Filtro | undefined {
  if (!filtro) return undefined
  if (filtro.tipo === 'lista') return todas.every(v => filtro.incluidos.has(v)) ? undefined : filtro
  return filtro.desde == null && filtro.hasta == null ? undefined : filtro
}
