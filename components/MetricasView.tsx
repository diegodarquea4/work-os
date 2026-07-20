'use client'

import { useState, useMemo, useEffect } from 'react'
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  Cell, ReferenceLine, Legend, PieChart, Pie,
} from 'recharts'
import { REGIONS } from '@/lib/regions'
import {
  useColegaSeguridadAll, useColegaSeguridadRegion,
  useColegaSeguridadSemanas,
} from '@/lib/hooks/useColegaSeguridad'
import {
  useColegaDelitosAll, useColegaDelitosRegion,
  DMCS_LISTA, DMCS_COLORES,
} from '@/lib/hooks/useColegaDelitos'
import {
  useMetricasPibRegion, useMetricasPibNacional,
  periodoLabel, parsePeriodo, PIB_UNIDAD_ENC, PIB_UNIDAD_NOM,
} from '@/lib/hooks/useMetricasPib'
import {
  useMetricasEmpleoTodas,
} from '@/lib/hooks/useMetricasEmpleo'
import { useCensoRegiones, type CensoRegionData } from '@/lib/hooks/useCensoRegiones'
import { useUltimaActualizacionMetricas, fmtUltimaActualizacion } from '@/lib/hooks/useUltimaActualizacionMetricas'
import { getSupabase } from '@/lib/supabase'

// ── Tipos ──────────────────────────────────────────────────────
type ModuleId = 'resumen' | 'seguridad' | 'pib' | 'censo' | 'empleo' | 'casen'
type SegTab   = 'resumen' | 'evolucion' | 'operativo' | 'dmcs'
type PibTab   = 'evolucion' | 'sectores' | 'nacional'
type EmpTab   = 'resumen' | 'evolucion' | 'ranking'
type CensoTab = 'demografia' | 'vivienda' | 'educacion' | 'conectividad'
type CasenTab = 'pobreza' | 'p_severa' | 'multi' | 'ingresos' | 'salud'
type SegInd   = 'casos_anno_fecha' | 'tasa_registro' | 'casos_ultima_semana' | 'casos_28dias' | 'var_anno_fecha'
type EmpInd   = 'tasa' | 'tasa_tm' | 'ocupados' | 'ft' | 'desocupados'

type RegResumen = {
  nombre: string
  tasa: number | null
  tasa_tm: number | null
  ocupados: number | null
  ft: number | null
  desocupados: number | null
}

// ── Constantes de color empleo (verbatim de generar_dashboard.py) ──
const EMP_COLORS = [
  '#e6194b','#3cb44b','#ffe119','#4363d8','#f58231',
  '#911eb4','#42d4f4','#f032e6','#bfef45','#fabed4',
  '#469990','#dcbeff','#9A6324','#800000','#aaffc3','#008080',
]
const EMP_NAC_COLOR = '#fbbf24'
const EMP_REG_COLOR: Record<string, string> = Object.fromEntries(
  REGIONS.map((r, i) => [r.nombre, EMP_COLORS[i % EMP_COLORS.length]])
)

// ── Formateadores ──────────────────────────────────────────────
function fmtN(v: number | null | undefined, dec = 0) {
  if (v == null) return '—'
  return v.toLocaleString('es-CL', { maximumFractionDigits: dec, minimumFractionDigits: dec })
}
function fmtPct(v: number | null | undefined) {
  if (v == null) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
}
function fmtPp(v: number | null | undefined) {
  if (v == null) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}`
}
function fmtEmpPer(p: string) {
  try { return new Intl.DateTimeFormat('es-CL', { month: 'short', year: '2-digit' }).format(new Date(p + 'T12:00:00')) }
  catch { return p.slice(0, 7) }
}
function empYear(p: string) { return p.slice(0, 4) }

// Redondea al múltiplo "redondo" más cercano hacia abajo/arriba para zoom visual en ejes Y
function niceAxisMin(v: number) {
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(v) || 1)) - 1)
  return Math.floor(v / mag) * mag
}
function niceAxisMax(v: number) {
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(v) || 1)) - 1)
  return Math.ceil(v / mag) * mag
}

// Sectores PIB display names
const SECTOR_DISP: Record<string, string> = {
  'PIB': 'Producto interno bruto',
  'PIB Producción de bienes': 'Producción de bienes',
  'PIB Minería': 'Minería',
  'PIB Industria manufacturera': 'Industria manufacturera',
  'PIB Resto de bienes': 'Resto de bienes',
  'PIB Comercio': 'Comercio',
  'PIB Servicios': 'Servicios',
  'PIB Agropecuario-silvícola': 'Agropecuario-silvícola',
  'PIB Construcción': 'Construcción',
  'PIB Servicios financieros y empresariales': 'Servicios financieros',
  'PIB Servicios personales': 'Servicios personales',
  'PIB Administración pública': 'Administración pública',
  'PIB Restaurantes y hoteles': 'Restaurantes y hoteles',
  'PIB Electricidad, gas y agua': 'Electricidad, gas y agua',
  'PIB Pesca': 'Pesca',
}

const toSentenceCase = (s: string) =>
  s && s !== '—' ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s

// ── Componentes UI base ────────────────────────────────────────
function Spinner() {
  return (
    <div className="flex items-center justify-center h-32">
      <div className="w-7 h-7 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function KpiCard({ label, value, sub, color = '#3b82f6', valueColor }: {
  label: string; value: string; sub?: string; color?: string; valueColor?: string
}) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100" style={{ borderLeftWidth: 4, borderLeftColor: color }}>
      <p className="text-[10px] font-semibold tracking-wide text-gray-500 mb-1 leading-tight">{label}</p>
      <p className="text-xl font-bold leading-none" style={{ color: valueColor ?? '#111827' }}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-1 leading-snug">{sub}</p>}
    </div>
  )
}

const selectCls = 'border border-gray-300 rounded-lg px-3 py-1.5 text-xs bg-white focus:outline-none focus:border-blue-400'

function Filtros({ children }: { children: React.ReactNode }) {
  return <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap gap-4 items-end">{children}</div>
}
function FiltroField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</label>
      {children}
    </div>
  )
}

// ── Placeholder para módulos sin datos ─────────────────────────
function SinDatos({ titulo, mensaje }: { titulo: string; mensaje: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
      <span className="text-5xl opacity-30">🚧</span>
      <p className="text-sm font-semibold text-gray-500">{titulo}</p>
      <p className="text-xs text-gray-400 max-w-xs">{mensaje}</p>
    </div>
  )
}

// ── Navegación de módulos ──────────────────────────────────────
const MODULES: { id: ModuleId; label: string }[] = [
  { id: 'resumen',   label: '📋 Resumen' },
  { id: 'seguridad', label: '🛡 Seguridad Pública' },
  { id: 'pib',       label: '📈 PIB Regional' },
  { id: 'censo',     label: '🏘 Censo 2024' },
  { id: 'empleo',    label: '💼 Empleo' },
  { id: 'casen',     label: '🏠 CASEN 2024' },
]

function ModuleNav({ active, onSelect }: { active: ModuleId; onSelect: (m: ModuleId) => void }) {
  return (
    <nav className="bg-slate-900 flex overflow-x-auto px-4 border-b-2 border-sky-600/30">
      {MODULES.map(m => (
        <button key={m.id} onClick={() => onSelect(m.id)}
          className={`px-5 py-3 text-xs font-semibold tracking-wide whitespace-nowrap border-b-2 -mb-0.5 transition-colors shrink-0 ${
            active === m.id ? 'text-white border-sky-400' : 'text-slate-400 border-transparent hover:text-white'
          }`}
        >{m.label}</button>
      ))}
    </nav>
  )
}

function UltimaActualizacionBar() {
  const { fecha, loading } = useUltimaActualizacionMetricas()
  return (
    <div className="bg-white border-b border-gray-200 px-6 py-1.5 flex justify-end">
      <span className="text-[10px] text-gray-400">
        {loading ? 'Cargando…' : fecha ? `Última actualización: ${fmtUltimaActualizacion(fecha)}` : 'Sin datos de actualización'}
      </span>
    </div>
  )
}

function SubTabs<T extends string>({ tabs, active, onSelect, color }: {
  tabs: { id: T; label: string }[]
  active: T; onSelect: (t: T) => void; color: string
}) {
  return (
    <div className="bg-white border-b border-gray-200 flex overflow-x-auto px-4">
      {tabs.map(t => (
        <button key={t.id} onClick={() => onSelect(t.id)}
          className="px-5 py-3 text-xs font-medium whitespace-nowrap border-b-2 -mb-px transition-colors shrink-0"
          style={active === t.id ? { color, borderBottomColor: color, fontWeight: 600 } : { color: '#888', borderBottomColor: 'transparent' }}
        >{t.label}</button>
      ))}
    </div>
  )
}

const Contenido = ({ children }: { children: React.ReactNode }) => (
  <div className="p-5 max-w-[1400px] mx-auto space-y-5">{children}</div>
)

// ══════════════════════════════════════════════════════════════
// RESUMEN EJECUTIVO
// ══════════════════════════════════════════════════════════════
function ResumenModule() {
  const [regionNombre, setRegionNombre]   = useState('')
  const [empDesdeAnio, setEmpDesdeAnio]   = useState('')
  const [empHastaAnio, setEmpHastaAnio]   = useState('')
  const [pibDesde, setPibDesde]           = useState('')
  const [pibHasta, setPibHasta]           = useState('')
  const [pibPoblacion, setPibPoblacion]   = useState<number | null>(null)
  const { rows: segRows, semana, loading: segL }                  = useColegaSeguridadAll()
  const { rows: delRows, loading: dmcsL }                         = useColegaDelitosAll()
  const { rows: pibRows, loading: pibRegL }                       = useMetricasPibRegion(regionNombre || null)
  const { valores: nacVals, valoresNom: nacValsNom, años: nacAños, loading: pibNacL } = useMetricasPibNacional()
  const { periodos, datos: empDatos, loading: empL }              = useMetricasEmpleoTodas()
  const { loading: censoL, get: censoGet, byCode: censoByCod, nacional: censoNacional } = useCensoRegiones()

  const isNac  = !regionNombre
  const segRow = isNac ? null : segRows.find(r => r.nombre_region === regionNombre) ?? null

  useEffect(() => {
    if (!regionNombre) { setPibPoblacion(null); return }
    const regionCod = REGIONS.find(r => r.nombre === regionNombre)?.cod
    if (!regionCod) { setPibPoblacion(null); return }
    let cancelled = false
    getSupabase()
      .from('region_metrics')
      .select('poblacion_total')
      .eq('region_cod', regionCod)
      .single()
      .then(({ data }) => {
        if (cancelled) return
        setPibPoblacion(data ? (data as { poblacion_total: number | null }).poblacion_total : null)
      })
    return () => { cancelled = true }
  }, [regionNombre])

  // Empleo — datos para región o nacional
  const ultIdx  = periodos.length - 1
  const nac     = empDatos['__NACIONAL__']
  const regEmp  = regionNombre ? empDatos[regionNombre] : null
  const dEmp    = isNac ? nac : regEmp

  const empUltPer   = periodos[ultIdx] ?? ''
  const empTasa     = dEmp?.tasa[ultIdx]     ?? null
  const empTasaTm   = dEmp?.tasa_tm[ultIdx]  ?? null
  const empOcupados = dEmp?.ocupados[ultIdx]  ?? null
  const nacTasaRes  = nac?.tasa[ultIdx]       ?? null
  const nacTasaTmRes= nac?.tasa_tm[ultIdx]    ?? null

  const varAnualTasa = (dEmp && ultIdx >= 12 && dEmp.tasa[ultIdx] != null && dEmp.tasa[ultIdx - 12] != null)
    ? parseFloat((dEmp.tasa[ultIdx]! - dEmp.tasa[ultIdx - 12]!).toFixed(2)) : null
  const varAnualTm   = (dEmp && ultIdx >= 12 && dEmp.tasa_tm[ultIdx] != null && dEmp.tasa_tm[ultIdx - 12] != null)
    ? parseFloat((dEmp.tasa_tm[ultIdx]! - dEmp.tasa_tm[ultIdx - 12]!).toFixed(2)) : null
  const ftUlt3 = dEmp ? [dEmp.ft[ultIdx], ultIdx >= 1 ? dEmp.ft[ultIdx - 1] : null, ultIdx >= 2 ? dEmp.ft[ultIdx - 2] : null].filter((v): v is number => v != null) : []
  const ftProm = ftUlt3.length ? Math.round(ftUlt3.reduce((a, b) => a + b, 0) / ftUlt3.length) : null

  // Empleo — serie temporal filtrada por año
  const empAnios = useMemo(() => [...new Set(periodos.map(empYear))].sort(), [periodos])
  const empEfectivoDe    = empDesdeAnio || empAnios[Math.max(0, empAnios.length - 3)]
  const empEfectivoHasta = empHastaAnio || empAnios[empAnios.length - 1]
  const empPeriodosFilt  = useMemo(() =>
    periodos.filter(p => { const y = empYear(p); return y >= empEfectivoDe && y <= empEfectivoHasta }),
    [periodos, empEfectivoDe, empEfectivoHasta]
  )
  const empEvoData = useMemo(() =>
    empPeriodosFilt.map(p => {
      const pi = periodos.indexOf(p)
      return {
        label:  fmtEmpPer(p),
        tasa:   dEmp?.tasa[pi]    ?? null,
        tasa_tm:dEmp?.tasa_tm[pi] ?? null,
        nacTm:  nac?.tasa_tm[pi]  ?? null,
      }
    }),
    [empPeriodosFilt, periodos, dEmp, nac]
  )

  return (
    <div>
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4">
        <label className="text-xs font-semibold text-gray-500">Región:</label>
        <select value={regionNombre} onChange={e => setRegionNombre(e.target.value)} className={`${selectCls} min-w-[240px]`}>
          <option value="">🇨🇱 Nacional (total)</option>
          {REGIONS.map(r => <option key={r.cod} value={r.nombre}>{r.nombre}</option>)}
        </select>
      </div>
      <Contenido>
        {/* ── Seguridad ── */}
        <div className="bg-white rounded-xl shadow-sm border-t-4 border-red-600 p-5">
          {segL ? <Spinner /> : (() => {
            const refRow     = isNac ? segRows[0] : segRow
            const totalCasos = isNac ? segRows.reduce((s, r) => s + (r.casos_anno_fecha ?? 0), 0) : (segRow?.casos_anno_fecha ?? null)
            const varPromArr = segRows.filter(r => r.var_anno_fecha != null)
            const varProm    = isNac && varPromArr.length ? varPromArr.reduce((s, r) => s + r.var_anno_fecha!, 0) / varPromArr.length : (segRow?.var_anno_fecha ?? null)
            const tasaProm   = isNac ? null : (segRow?.tasa_registro ?? null)

            // Delito más común
            const delitoTop = isNac
              ? (() => { const c: Record<string, number> = {}; segRows.forEach(r => { if (r.mayor_registro_1) c[r.mayor_registro_1] = (c[r.mayor_registro_1] ?? 0) + 1 }); return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—' })()
              : (segRow?.mayor_registro_1 ?? '—')

            // Fecha de referencia
            const fmtFechaISO = (iso: string | null | undefined) => {
              if (!iso) return ''
              const [y, m, d] = iso.split('-')
              return `${d}/${m}/${y}`
            }
            const semNum  = refRow?.semana ?? ''
            const semYear = refRow?.fecha_hasta_iso?.slice(0, 4) ?? ''
            const semLabel = semNum && semYear
              ? `${semNum.replace('SEMANA ', 'Semana ')} ${semYear} (del ${fmtFechaISO(refRow?.fecha_desde_iso)} al ${fmtFechaISO(refRow?.fecha_hasta_iso)})`
              : ''

            // Top 5 delitos — desde delRows año a la fecha (conteos reales)
            const top5Seg: { nombre: string; casos: number }[] = []
            if (delRows.length > 0) {
              const base5 = isNac ? delRows : delRows.filter(r => r.nombre_region === regionNombre)
              const cnt: Record<string, number> = {}
              base5.forEach(r => { if (r.nombre_delito) cnt[r.nombre_delito] = (cnt[r.nombre_delito] ?? 0) + (r.anno_fecha ?? 0) })
              Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([nombre, casos]) => top5Seg.push({ nombre, casos }))
            }

            const rankEmoji = ['🥇', '🥈', '🥉', '4°', '5°']

            return (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-gray-800">🛡 Seguridad Pública</h3>
                  {semLabel && <span className="text-xs text-gray-400">{semLabel}</span>}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <KpiCard label="Delitos registrados LeyStop — año a la fecha" value={fmtN(totalCasos)} sub={isNac ? 'Total nacional' : regionNombre} color="#dc2626" />
                  <KpiCard label="Variación vs año anterior" value={fmtPct(varProm)}
                    color={varProm != null && varProm < 0 ? '#16a34a' : '#dc2626'}
                    sub="total delitos año a la fecha" />
                  <KpiCard label="Tasa delitos / 100k hab." value={tasaProm != null ? fmtN(tasaProm, 1) : '—'} sub="LeyStop año a la fecha" color="#dc2626" />
                </div>

                {top5Seg.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Top 5 delitos más frecuentes — año a la fecha</p>
                    <div className="grid grid-cols-5 gap-3">
                      {top5Seg.map((d, i) => (
                        <div key={i} className="rounded-lg bg-amber-50 border border-amber-100 p-3">
                          <p className="text-[10px] font-bold text-amber-700 mb-1">{rankEmoji[i]}</p>
                          <p className="text-xs font-bold text-gray-800 leading-snug">{toSentenceCase(d.nombre)}</p>
                          <p className="text-[11px] text-gray-500 mt-1">{fmtN(d.casos)} casos</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )
          })()}

          {/* ── DMCS ── */}
          <div className="border-t border-red-100 pt-4 mt-4">
            <h4 className="text-xs font-bold text-red-800 mb-3">🔴 Delitos de Mayor Connotación Social (DMCS)</h4>
            {dmcsL ? <Spinner /> : (() => {
              const base     = isNac ? delRows : delRows.filter(r => r.nombre_region === regionNombre)
              const dmcsRows = base.filter(r => DMCS_LISTA.includes(r.nombre_delito))
              const todosRows = base

              const totalAnno  = dmcsRows.reduce((s, r) => s + (r.anno_fecha ?? 0), 0)
              const totalAnt   = dmcsRows.reduce((s, r) => s + (r.anno_fecha_ant ?? 0), 0)
              const varDmcs    = totalAnt > 0 ? ((totalAnno - totalAnt) / totalAnt * 100) : null
              const totalTodos = todosRows.reduce((s, r) => s + (r.anno_fecha ?? 0), 0)
              const pctDmcs    = totalTodos > 0 ? (totalAnno / totalTodos * 100) : 0

              // Tasa DMCS/100k: población inversa desde tasa_registro de registros_leystop
              let tasaDmcs: number | null = null
              if (isNac) {
                let pobTotal = 0
                segRows.forEach(r => {
                  if (r.tasa_registro != null && r.tasa_registro > 0 && r.casos_anno_fecha != null && r.casos_anno_fecha > 0)
                    pobTotal += r.casos_anno_fecha / r.tasa_registro * 100000
                })
                tasaDmcs = pobTotal > 0 ? totalAnno / pobTotal * 100000 : null
              } else if (segRow?.tasa_registro != null && segRow.tasa_registro > 0 && segRow.casos_anno_fecha != null && segRow.casos_anno_fecha > 0) {
                const pob = segRow.casos_anno_fecha / segRow.tasa_registro * 100000
                tasaDmcs = totalAnno / pob * 100000
              }

              // Ranking tasa DMCS regional
              let tasaDmcsRanking: string | null = null
              if (!isNac && tasaDmcs != null) {
                const tasasPor = segRows.flatMap(sr => {
                  if (!sr.tasa_registro || sr.tasa_registro <= 0 || !sr.casos_anno_fecha || sr.casos_anno_fecha <= 0) return []
                  const dmcsReg = delRows.filter(d => d.nombre_region === sr.nombre_region && DMCS_LISTA.includes(d.nombre_delito))
                    .reduce((s, d) => s + (d.anno_fecha ?? 0), 0)
                  const pob = sr.casos_anno_fecha / sr.tasa_registro * 100000
                  return [{ region: sr.nombre_region, tasa: dmcsReg / pob * 100000 }]
                }).sort((a, b) => b.tasa - a.tasa)
                const idx = tasasPor.findIndex(r => r.region === regionNombre)
                if (idx >= 0) tasaDmcsRanking = `${idx + 1}° de ${tasasPor.length} regiones`
              }

              const sumaPorDelito: Record<string, { anno: number; ant: number }> = {}
              dmcsRows.forEach(r => {
                if (!sumaPorDelito[r.nombre_delito]) sumaPorDelito[r.nombre_delito] = { anno: 0, ant: 0 }
                sumaPorDelito[r.nombre_delito].anno += r.anno_fecha ?? 0
                sumaPorDelito[r.nombre_delito].ant  += r.anno_fecha_ant ?? 0
              })
              const barData = Object.entries(sumaPorDelito)
                .sort((a, b) => b[1].anno - a[1].anno)
                .map(([nombre, v]) => ({
                  nombre: nombre.length > 32 ? nombre.slice(0, 32) + '…' : nombre,
                  anno: v.anno,
                  ant: v.ant,
                }))

              if (dmcsRows.length === 0) return (
                <p className="text-xs text-gray-400 py-2">Sin datos DMCS para la semana actual.</p>
              )
              return (
                <>
                  {barData.length > 0 ? (
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-5 items-start">
                      <div className="grid grid-cols-2 gap-3">
                        <KpiCard label="DMCS año a la fecha"       value={fmtN(totalAnno)} sub={isNac ? 'Total nacional' : regionNombre} color="#500707" />
                        <KpiCard label="Variación vs año anterior" value={fmtPct(varDmcs)} sub="año a la fecha" color="#7f1d1d" />
                        <KpiCard label="Tasa DMCS / 100k hab."     value={tasaDmcs != null ? fmtN(tasaDmcs, 1) : '—'} sub={tasaDmcsRanking ?? (isNac ? 'Nacional' : undefined)} color="#991b1b" />
                        <KpiCard label="% del total de delitos"    value={pctDmcs.toFixed(1) + '%'} sub="son DMCS (año a la fecha)" color="#b91c1c" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-600 mb-2 uppercase tracking-wide">DMCS por tipo — año a la fecha</p>
                        <ResponsiveContainer width="100%" height={260}>
                          <BarChart data={barData} layout="vertical" margin={{ left: 4, right: 16 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 9 }} allowDecimals={false} />
                            <YAxis type="category" dataKey="nombre" tick={{ fontSize: 8 }} width={150} />
                            <Tooltip formatter={(v) => fmtN(v as number)} />
                            <Bar dataKey="anno" name="2026" fill="rgba(220,38,38,.75)" radius={[0, 3, 3, 0]} />
                            <Bar dataKey="ant"  name="2025" fill="rgba(156,163,175,.5)" radius={[0, 3, 3, 0]} />
                            <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <KpiCard label="DMCS año a la fecha"       value={fmtN(totalAnno)} sub={isNac ? 'Total nacional' : regionNombre} color="#500707" />
                      <KpiCard label="Variación vs año anterior" value={fmtPct(varDmcs)} sub="año a la fecha" color="#7f1d1d" />
                      <KpiCard label="Tasa DMCS / 100k hab."     value={tasaDmcs != null ? fmtN(tasaDmcs, 1) : '—'} sub={tasaDmcsRanking ?? (isNac ? 'Nacional' : undefined)} color="#991b1b" />
                      <KpiCard label="% del total de delitos"    value={pctDmcs.toFixed(1) + '%'} sub="son DMCS (año a la fecha)" color="#b91c1c" />
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        </div>

        {/* ── PIB ── */}
        <div className="bg-white rounded-xl shadow-sm border-t-4 border-blue-600 p-5">
          {(pibRegL || pibNacL) ? <Spinner /> : (() => {
            // Filas PIB total anuales encadenadas (real) para la región
            const pibAnual = pibRows.filter(r =>
              r.indicador_limpio === 'PIB' &&
              r.unidad_limpia === PIB_UNIDAD_ENC &&
              r.series_id?.endsWith('A')
            ).map(r => ({ year: parsePeriodo(r.periodo).year, val: r.valor_corregido ?? 0 }))

            // Filas PIB total anuales nominales (corrientes) para la región
            const pibAnualNom = pibRows.filter(r =>
              r.indicador_limpio === 'PIB' &&
              r.unidad_limpia === PIB_UNIDAD_NOM &&
              r.series_id?.endsWith('A')
            ).map(r => ({ year: parsePeriodo(r.periodo).year, val: r.valor_corregido ?? 0 }))

            const regAños = [...new Set(pibAnual.map(r => r.year))].sort()
            const allAños = isNac ? nacAños : regAños

            // Gráfico de evolución (real, encadenado) siempre desde 2018 al último año disponible
            const efectivoDe    = pibDesde    || (allAños.find(y => y >= '2018') ?? allAños[0] ?? '')
            const efectivoHasta = pibHasta    || (allAños[allAños.length - 1]   ?? '')
            const añosFilt = allAños.filter(y => y >= efectivoDe && y <= efectivoHasta)

            const lastYear = añosFilt[añosFilt.length - 1] ?? ''
            const prevYear = añosFilt[añosFilt.length - 2] ?? ''

            // PIB real por año (región o suma nacional) — para el gráfico y la Var. % anual
            const pibByYear: Record<string, number> = {}
            if (isNac) {
              nacAños.forEach(y => {
                pibByYear[y] = Object.values(nacVals).reduce((s, rv) => s + (rv[y] ?? 0), 0)
              })
            } else {
              pibAnual.forEach(({ year, val }) => { pibByYear[year] = val })
            }

            // PIB nominal por año (región o suma nacional) — para las tarjetas del último año
            const pibNomByYear: Record<string, number> = {}
            if (isNac) {
              nacAños.forEach(y => {
                pibNomByYear[y] = Object.values(nacValsNom).reduce((s, rv) => s + (rv[y] ?? 0), 0)
              })
            } else {
              pibAnualNom.forEach(({ year, val }) => { pibNomByYear[year] = val })
            }

            const pibLast = lastYear ? (pibByYear[lastYear] ?? null) : null
            const pibPrev = prevYear ? (pibByYear[prevYear] ?? null) : null
            const varAnual = pibLast != null && pibPrev != null && pibPrev > 0
              ? (pibLast - pibPrev) / pibPrev * 100 : null

            const pibNomLast = lastYear ? (pibNomByYear[lastYear] ?? null) : null

            // Per cápita nominal: miles MM$ × 1000 / pop → millones de pesos por hab.
            const perCapita = !isNac && pibNomLast != null && pibPoblacion != null && pibPoblacion > 0
              ? pibNomLast * 1000 / pibPoblacion : null

            // Total nominal en billones (1 bill = 1 000 MM$)
            const pibBill = pibNomLast != null ? pibNomLast / 1000 : null

            // % del PIB nacional (suma de todas las regiones ese año) — sobre base real, no varía si es nominal
            const nacTotal = lastYear
              ? Object.values(nacVals).reduce((s, rv) => s + (rv[lastYear] ?? 0), 0)
              : 0
            const pctNac = !isNac && pibLast != null && nacTotal > 0
              ? pibLast / nacTotal * 100 : null

            // Ranking PIB entre las 16 regiones (mayor a menor)
            const pibRankingNac = !isNac && lastYear && pibLast != null
              ? (() => {
                  const vals = Object.entries(nacVals)
                    .map(([, rv]) => rv[lastYear] ?? 0)
                    .filter(v => v > 0)
                    .sort((a, b) => b - a)
                  const pos = vals.findIndex(v => Math.abs(v - pibLast!) < 0.01) + 1
                  return pos > 0 ? pos : null
                })()
              : null

            const evoData = añosFilt.map(y => ({ año: y, pib: pibByYear[y] ?? null }))

            // Top 5 sectores productivos (solo para región) — siempre en MM$ nominal
            const sectorMap: Record<string, { last: number | null; prev: number | null }> = {}
            // Crecimiento real (encadenado) por sector — separado del monto nominal
            // de arriba para no mezclar bases al calcular la Var. %.
            const sectorMapReal: Record<string, { last: number | null; prev: number | null }> = {}
            if (!isNac) {
              pibRows
                .filter(r =>
                  r.unidad_limpia === PIB_UNIDAD_NOM &&
                  r.series_id?.endsWith('A') &&
                  r.indicador_limpio !== 'PIB' &&
                  r.indicador_limpio in SECTOR_DISP
                )
                .forEach(r => {
                  const y = parsePeriodo(r.periodo).year
                  if (y !== lastYear && y !== prevYear) return
                  if (!sectorMap[r.indicador_limpio]) sectorMap[r.indicador_limpio] = { last: null, prev: null }
                  if (y === lastYear) sectorMap[r.indicador_limpio].last = r.valor_corregido
                  if (y === prevYear) sectorMap[r.indicador_limpio].prev = r.valor_corregido
                })
              pibRows
                .filter(r =>
                  r.unidad_limpia === PIB_UNIDAD_ENC &&
                  r.series_id?.endsWith('A') &&
                  r.indicador_limpio !== 'PIB' &&
                  r.indicador_limpio in SECTOR_DISP
                )
                .forEach(r => {
                  const y = parsePeriodo(r.periodo).year
                  if (y !== lastYear && y !== prevYear) return
                  if (!sectorMapReal[r.indicador_limpio]) sectorMapReal[r.indicador_limpio] = { last: null, prev: null }
                  if (y === lastYear) sectorMapReal[r.indicador_limpio].last = r.valor_corregido
                  if (y === prevYear) sectorMapReal[r.indicador_limpio].prev = r.valor_corregido
                })
            }
            const top5 = Object.entries(sectorMap)
              .filter(([, v]) => v.last != null)
              .sort(([, a], [, b]) => (b.last ?? 0) - (a.last ?? 0))
              .slice(0, 5)
              .map(([key, v]) => {
                const real = sectorMapReal[key]
                const varPctReal = real?.last != null && real?.prev != null && real.prev > 0
                  ? (real.last - real.prev) / real.prev * 100 : null
                return { nombre: SECTOR_DISP[key] ?? key, last: v.last as number, varPctReal }
              })

            return (
              <>
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                  <h3 className="text-sm font-bold text-gray-800">📈 PIB Regional — Banco Central</h3>
                  <div className="flex gap-3 items-end flex-wrap">
                    <FiltroField label="Año desde">
                      <select value={pibDesde || efectivoDe} onChange={e => setPibDesde(e.target.value)} className={`${selectCls} min-w-[80px]`}>
                        {allAños.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </FiltroField>
                    <FiltroField label="Año hasta">
                      <select value={pibHasta || efectivoHasta} onChange={e => setPibHasta(e.target.value)} className={`${selectCls} min-w-[80px]`}>
                        {allAños.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </FiltroField>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-5">
                  {/* Gráfico evolución */}
                  <div>
                    <p className="text-[11px] text-gray-500 mb-2">Evolución PIB real</p>
                    {evoData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={230}>
                        <AreaChart data={evoData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                          <defs>
                            <linearGradient id="pibGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.15} />
                              <stop offset="95%" stopColor="#2563eb" stopOpacity={0.01} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="#e8ecf0" />
                          <XAxis dataKey="año" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                          <YAxis
                            tick={{ fontSize: 9, fill: '#9ca3af' }}
                            tickFormatter={v => fmtN(v as number, 0)}
                            width={72}
                            axisLine={false}
                            tickLine={false}
                            domain={[
                              (d: number) => niceAxisMin(d),
                              (d: number) => niceAxisMax(d),
                            ]}
                          />
                          <Tooltip
                            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,.08)' }}
                            formatter={(v) => [fmtN(v as number, 0) + ' MM$', 'PIB enc.']}
                            labelFormatter={(l) => `Año ${l}`}
                          />
                          <Area
                            type="monotone"
                            dataKey="pib"
                            stroke="#2563eb"
                            strokeWidth={2.5}
                            fill="url(#pibGrad)"
                            dot={{ r: 4, fill: '#fff', stroke: '#2563eb', strokeWidth: 2 }}
                            activeDot={{ r: 5, fill: '#2563eb' }}
                            connectNulls
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-xs text-gray-400 py-12 text-center">Sin datos para el rango seleccionado.</p>
                    )}
                  </div>

                  {/* KPIs + Tabla sectores */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <KpiCard
                        label={`PIB total ${lastYear}`}
                        value={pibBill != null ? fmtN(pibBill, 2) + ' bill.' : '—'}
                        sub="billones de pesos, nominal"
                        color="#2563eb"
                      />
                      <KpiCard
                        label={`PIB per cápita ${lastYear}`}
                        value={perCapita != null ? fmtN(perCapita, 2) + ' mill.' : '—'}
                        sub="por habitante, nominal · Censo 2024"
                        color="#1d4ed8"
                      />
                      <KpiCard
                        label="Crecimiento PIB real anual"
                        value={varAnual != null ? (varAnual >= 0 ? '+' : '') + varAnual.toFixed(1) + '%' : '—'}
                        sub={prevYear ? `vs ${prevYear}` : 'vs año anterior'}
                        color={varAnual != null ? (varAnual < 0 ? '#dc2626' : '#059669') : '#6b7280'}
                        valueColor={varAnual != null ? (varAnual < 0 ? '#dc2626' : '#059669') : undefined}
                      />
                      <KpiCard
                        label="% PIB nacional"
                        value={pctNac != null ? pctNac.toFixed(1) + '%' : (isNac ? '100%' : '—')}
                        sub={pibRankingNac ? `${pibRankingNac}° de 16 regiones · ${lastYear}` : `participación ${lastYear}`}
                        color="#dc2626"
                      />
                    </div>

                    {top5.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">
                          Top 5 sectores productivos — {lastYear}
                        </p>
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-800 text-white">
                              <th className="px-3 py-2 text-left font-medium">Sector</th>
                              <th className="px-3 py-2 text-right font-medium">MM$ nominal</th>
                              <th className="px-3 py-2 text-right font-medium">Crecimiento PIB real anual</th>
                              <th className="px-3 py-2 text-right font-medium">% PIB reg.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {top5.map((s, i) => {
                              const varPct = s.varPctReal
                              const pctPib = pibNomLast != null && pibNomLast > 0 ? s.last / pibNomLast * 100 : null
                              return (
                                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                  <td className="px-3 py-1.5 text-gray-900">{s.nombre}</td>
                                  <td className="px-3 py-1.5 text-right text-gray-900 font-medium">{fmtN(s.last, 0)}</td>
                                  <td className={`px-3 py-1.5 text-right font-semibold ${varPct == null ? 'text-gray-400' : varPct < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    {varPct != null ? (varPct >= 0 ? '+' : '') + varPct.toFixed(1) + '%' : '—'}
                                  </td>
                                  <td className="px-3 py-1.5 text-right text-gray-900">
                                    {pctPib != null ? pctPib.toFixed(1) + '%' : '—'}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">* Gráfico y Crecimiento PIB real anual (tarjeta y Top 5 sectores) en volumen encadenado (real), serie empalmada referencia 2018. PIB total, per cápita y MM$ por sector en pesos nominales (corrientes). Fuente: Banco Central de Chile.</p>
              </>
            )
          })()}
        </div>

        {/* ── Empleo ── */}
        <div className="bg-white rounded-xl shadow-sm border-t-4 border-emerald-600 p-5">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <h3 className="text-sm font-bold text-gray-800">💼 Empleo — INE / BCCh</h3>
            <div className="flex gap-3 flex-wrap items-end">
              <FiltroField label="Desde">
                <select value={empDesdeAnio || empEfectivoDe} onChange={e => setEmpDesdeAnio(e.target.value)} className={`${selectCls} min-w-[80px]`}>
                  {empAnios.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </FiltroField>
              <FiltroField label="Hasta">
                <select value={empHastaAnio || empEfectivoHasta} onChange={e => setEmpHastaAnio(e.target.value)} className={`${selectCls} min-w-[80px]`}>
                  {empAnios.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </FiltroField>
            </div>
          </div>
          {empL ? <Spinner /> : (
            <>
              {empEvoData.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-semibold text-gray-500 mb-2">Desocupación</h4>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={empEvoData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="empGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.12} />
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0.01} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="#e8ecf0" />
                      <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#9ca3af' }} angle={-45} textAnchor="end" height={50}
                        interval={Math.max(0, Math.floor(empEvoData.length / 24))}
                        axisLine={false} tickLine={false} />
                      <YAxis
                        tick={{ fontSize: 9, fill: '#9ca3af' }}
                        tickFormatter={v => v + '%'}
                        axisLine={false} tickLine={false}
                        domain={['auto', 'auto']}
                      />
                      <Tooltip
                        contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,.08)' }}
                        formatter={(v, name) => [fmtN(v as number, 2) + '%', name === 'tasa' ? 'Tasa desoc.' : name === 'tasa_tm' ? 'Trim. móvil' : 'Trim. móvil 🇨🇱']}
                      />
                      <Legend formatter={v => v === 'tasa' ? 'Tasa desocupación (%)' : v === 'tasa_tm' ? 'Trim. móvil (%)' : 'Trim. móvil nacional (%)'} iconSize={10} wrapperStyle={{ fontSize: 10 }} />
                      <Area type="monotone" dataKey="tasa" stroke="#2563eb" strokeWidth={2}
                        fill="url(#empGrad)" fillOpacity={1}
                        dot={{ r: 2, fill: '#2563eb', strokeWidth: 0 }} activeDot={{ r: 4 }} connectNulls />
                      <Line type="monotone" dataKey="tasa_tm" stroke="#059669" strokeWidth={2}
                        dot={{ r: 2, fill: '#059669', strokeWidth: 0 }} activeDot={{ r: 4 }} connectNulls />
                      {!isNac && (
                        <Line type="monotone" dataKey="nacTm" stroke="#dc2626" strokeWidth={1.5}
                          strokeDasharray="4 3"
                          dot={false} activeDot={{ r: 3 }} connectNulls />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                  {(() => {
                    const empColor = isNac ? '#dc2626' : '#16a34a'
                    const allRegTm = !isNac ? Object.entries(empDatos)
                      .filter(([k]) => k !== '__NACIONAL__')
                      .map(([k, v]) => ({ nombre: k, tm: v.tasa_tm[ultIdx] ?? null }))
                      .filter((v): v is { nombre: string; tm: number } => v.tm != null)
                      .sort((a, b) => a.tm - b.tm) : []
                    const rank = !isNac && empTasaTm != null ? allRegTm.findIndex(v => v.nombre === regionNombre) + 1 : 0
                    const varVsNac = !isNac && empTasaTm != null && nacTasaTmRes != null ? empTasaTm - nacTasaTmRes : null
                    return (
                      <>
                        <div className={`grid gap-3 mt-3 ${isNac ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'}`}>
                          <KpiCard label="Var. anual trim. móvil (pp)"
                            value={varAnualTm != null ? (varAnualTm > 0 ? '+' : '') + varAnualTm.toFixed(1) : '—'}
                            sub="vs mismo mes año ant."
                            color={empColor}
                            valueColor={varAnualTm == null ? undefined : varAnualTm > 0 ? '#dc2626' : '#16a34a'} />
                          <KpiCard label="Var. anual tasa simple (pp)"
                            value={varAnualTasa != null ? (varAnualTasa > 0 ? '+' : '') + varAnualTasa.toFixed(1) : '—'}
                            sub="vs mismo mes año ant."
                            color={empColor}
                            valueColor={varAnualTasa == null ? undefined : varAnualTasa > 0 ? '#dc2626' : '#16a34a'} />
                          <KpiCard label="Fuerza de trabajo (miles)"
                            value={ftProm != null ? fmtN(ftProm) : '—'}
                            sub="prom. últ. 3 meses"
                            color={empColor} />
                          {!isNac && rank > 0 && (
                            <KpiCard label="Ranking desocupación*"
                              value={`${rank}° de ${allRegTm.length}`}
                              sub="trim. móvil"
                              color={rank <= 5 ? '#16a34a' : rank >= 12 ? '#dc2626' : '#6b7280'}
                              valueColor={rank <= 5 ? '#16a34a' : rank >= 12 ? '#dc2626' : undefined} />
                          )}
                          {!isNac && varVsNac != null && (
                            <KpiCard label="Vs. trim. móvil nacional"
                              value={(varVsNac > 0 ? '+' : '') + varVsNac.toFixed(2) + ' pp'}
                              sub="diferencia en puntos porcentuales"
                              color={varVsNac > 0 ? '#dc2626' : '#16a34a'}
                              valueColor={varVsNac > 0 ? '#dc2626' : '#16a34a'} />
                          )}
                        </div>
                        {!isNac && <p className="text-[10px] text-gray-400 mt-1">* Ranking sobre las 16 regiones disponibles; 1° = menor desocupación.</p>}
                      </>
                    )
                  })()}
                </div>
              )}
            </>
          )}
        </div>
        {/* ── CENSO 2024: Resumen demográfico ── */}
        {!censoL && censoNacional && (() => {
          const censoRegionCod = REGIONS.find(r => r.nombre === regionNombre)?.cod ?? ''
          const cd      = censoGet(censoRegionCod)
          const isNacC  = !censoRegionCod
          const nacPop  = censoNacional.n_per
          const CC      = '#1e3a8a'
          const pctOfC  = (n: number, den: number) => den > 0 ? (n / den * 100).toFixed(1) + '%' : '—'
          const allRC   = censoByCod ? Object.values(censoByCod) : []
          const rankOfC = (fn: (r: CensoRegionData) => number) => {
            if (!cd || isNacC) return null
            const sorted = [...allRC].sort((a, b) => fn(b) - fn(a))
            return sorted.findIndex(r => r.cod === cd.cod) + 1
          }
          if (!cd) return null
          const rPob = rankOfC(r => r.n_per)
          const rInm = rankOfC(r => r.n_inmigrantes / r.n_per)
          const rPO  = rankOfC(r => r.n_pueblos_orig / r.n_per)
          const rAge = rankOfC(r => r.prom_edad)
          return (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Censo 2024 — Indicadores demográficos</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100" style={{ borderLeftWidth: 4, borderLeftColor: CC }}>
                  <p className="text-[10px] font-semibold tracking-wide text-gray-500 mb-1 leading-tight">Población total</p>
                  <p className="text-xl font-bold leading-none text-gray-900">{fmtN(cd.n_per)}</p>
                  {!isNacC && <p className="text-[10px] text-gray-400 mt-1 leading-snug">{pctOfC(cd.n_per, nacPop)} de la población nacional</p>}
                  {isNacC && <p className="text-[10px] text-gray-400 mt-1 leading-snug">Total Chile · Censo 2024</p>}
                  {rPob && <span className="inline-block text-[10px] bg-blue-50 text-blue-700 rounded-full px-2 py-0.5 mt-1">🏅 {rPob}° de 16 regiones</span>}
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100" style={{ borderLeftWidth: 4, borderLeftColor: CC }}>
                  <p className="text-[10px] font-semibold tracking-wide text-gray-500 mb-1 leading-tight">Inmigrantes</p>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xl font-bold leading-none text-gray-900">{pctOfC(cd.n_inmigrantes, cd.n_per)}</p>
                      <p className="text-[10px] text-gray-400 mt-1 leading-snug">{fmtN(cd.n_inmigrantes)} personas</p>
                    </div>
                    {!isNacC && (
                      <div className="text-right">
                        <p className="text-xs font-semibold text-gray-400">vs {pctOfC(censoNacional.n_inmigrantes, censoNacional.n_per)}</p>
                        <p className="text-[10px] text-gray-400">nacional</p>
                      </div>
                    )}
                  </div>
                  {rInm && <span className="inline-block text-[10px] bg-blue-50 text-blue-700 rounded-full px-2 py-0.5 mt-1">🏅 {rInm}° de 16 regiones</span>}
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100" style={{ borderLeftWidth: 4, borderLeftColor: CC }}>
                  <p className="text-[10px] font-semibold tracking-wide text-gray-500 mb-1 leading-tight">Pueblos originarios</p>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xl font-bold leading-none text-gray-900">{pctOfC(cd.n_pueblos_orig, cd.n_per)}</p>
                      <p className="text-[10px] text-gray-400 mt-1 leading-snug">{fmtN(cd.n_pueblos_orig)} personas</p>
                    </div>
                    {!isNacC && (
                      <div className="text-right">
                        <p className="text-xs font-semibold text-gray-400">vs {pctOfC(censoNacional.n_pueblos_orig, censoNacional.n_per)}</p>
                        <p className="text-[10px] text-gray-400">nacional</p>
                      </div>
                    )}
                  </div>
                  {rPO && <span className="inline-block text-[10px] bg-blue-50 text-blue-700 rounded-full px-2 py-0.5 mt-1">🏅 {rPO}° de 16 regiones</span>}
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100" style={{ borderLeftWidth: 4, borderLeftColor: CC }}>
                  <p className="text-[10px] font-semibold tracking-wide text-gray-500 mb-1 leading-tight">Edad promedio</p>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xl font-bold leading-none text-gray-900">{cd.prom_edad.toFixed(1)} años</p>
                      <p className="text-[10px] text-gray-400 mt-1 leading-snug">{isNacC ? 'Promedio nacional' : cd.nombre}</p>
                    </div>
                    {!isNacC && (
                      <div className="text-right">
                        <p className="text-xs font-semibold text-gray-400">vs {censoNacional.prom_edad.toFixed(1)} años</p>
                        <p className="text-[10px] text-gray-400">nacional</p>
                      </div>
                    )}
                  </div>
                  {rAge && <span className="inline-block text-[10px] bg-blue-50 text-blue-700 rounded-full px-2 py-0.5 mt-1">🏅 {rAge}° de 16 regiones</span>}
                </div>
              </div>
            </div>
          )
        })()}
      </Contenido>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// SEGURIDAD PÚBLICA
// ══════════════════════════════════════════════════════════════
const SEG_TABS: { id: SegTab; label: string }[] = [
  { id: 'resumen',   label: 'Resumen por región' },
  { id: 'evolucion', label: 'Evolución temporal' },
  { id: 'operativo', label: 'Actividad operativa' },
  { id: 'dmcs',      label: '🔴 DMCS' },
]
const SEG_IND_LABELS: Record<SegInd, string> = {
  casos_anno_fecha:    'Casos año a la fecha',
  tasa_registro:       'Tasa por 100 mil hab.',
  casos_ultima_semana: 'Casos última semana',
  casos_28dias:        'Casos últimos 28 días',
  var_anno_fecha:      'Variación % año a la fecha',
}

function SeguridadModule() {
  const [activeTab, setActiveTab]             = useState<SegTab>('resumen')
  const [semanaId, setSemanaId]               = useState<number | undefined>(undefined)
  const [segRegionFiltro, setSegRegionFiltro] = useState('')
  const [segRegionCod, setSegRegionCod]       = useState('RM')
  const [segInd, setSegInd]                   = useState<SegInd>('casos_anno_fecha')
  const [dmcsRegion, setDmcsRegion]           = useState('')
  const [dmcsDelito, setDmcsDelito]           = useState('')

  const { semanas }                          = useColegaSeguridadSemanas()
  const { rows, semana, loading }            = useColegaSeguridadAll(semanaId)
  const { history, loading: histL }          = useColegaSeguridadRegion(segRegionCod)
  const { rows: delRows, loading: delL }     = useColegaDelitosAll(semanaId)
  const dmcsRegionCod = REGIONS.find(r => r.nombre === dmcsRegion)?.cod ?? ''
  const { rows: delHistory }                 = useColegaDelitosRegion(dmcsRegionCod)

  const latestSemanaId = semanas[0]?.id_semana
  const effSemana = semanaId ?? latestSemanaId

  const filasResumen = useMemo(() => {
    const base = rows.filter(r => !semanaId ? true : r.id_semana === effSemana)
    return segRegionFiltro ? base.filter(r => r.nombre_region === segRegionFiltro) : base
  }, [rows, semanaId, effSemana, segRegionFiltro])

  const sortedByCasos = useMemo(() => [...filasResumen].sort((a, b) => (b.casos_anno_fecha ?? 0) - (a.casos_anno_fecha ?? 0)), [filasResumen])
  const sortedByTasa  = useMemo(() => [...filasResumen].sort((a, b) => (b.tasa_registro ?? 0) - (a.tasa_registro ?? 0)), [filasResumen])

  const totalCasos = filasResumen.reduce((s, r) => s + (r.casos_anno_fecha ?? 0), 0)
  const totalSem   = filasResumen.reduce((s, r) => s + (r.casos_ultima_semana ?? 0), 0)
  const varArr     = filasResumen.filter(r => r.var_anno_fecha != null)
  const varProm    = varArr.length ? varArr.reduce((s, r) => s + r.var_anno_fecha!, 0) / varArr.length : null
  const tasaArr    = sortedByTasa.filter(r => r.tasa_registro != null)
  const tasaProm   = tasaArr.length ? tasaArr.reduce((s, r) => s + r.tasa_registro!, 0) / tasaArr.length : null

  const topDelitoChart = useMemo(() => {
    const cnt: Record<string, number> = {}
    filasResumen.forEach(r => { if (r.mayor_registro_1) cnt[r.mayor_registro_1] = (cnt[r.mayor_registro_1] ?? 0) + 1 })
    return Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([nombre, n]) => ({ nombre: nombre.length > 30 ? nombre.slice(0, 30) + '…' : nombre, n }))
  }, [filasResumen])

  const selectedRegion = REGIONS.find(r => r.cod === segRegionCod)

  const SemanaSelector = () => (
    <FiltroField label="Semana">
      <select value={semanaId ?? effSemana ?? ''} onChange={e => setSemanaId(Number(e.target.value))} className={`${selectCls} min-w-[200px]`}>
        {semanas.map(s => <option key={s.id_semana} value={s.id_semana}>{s.nombre}</option>)}
      </select>
    </FiltroField>
  )

  return (
    <div>
      <SubTabs tabs={SEG_TABS} active={activeTab} onSelect={setActiveTab} color="#16a34a" />
      <Contenido>

        {activeTab === 'resumen' && (loading ? <Spinner /> : (
          <>
            <Filtros>
              <SemanaSelector />
              <FiltroField label="Región">
                <select value={segRegionFiltro} onChange={e => setSegRegionFiltro(e.target.value)} className={`${selectCls} min-w-[200px]`}>
                  <option value="">Todas las regiones</option>
                  {REGIONS.map(r => <option key={r.cod} value={r.nombre}>{r.nombre}</option>)}
                </select>
              </FiltroField>
            </Filtros>
            {semana && <p className="text-[11px] text-gray-400">Semana: <strong>{semana}</strong></p>}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Casos año a la fecha"  value={fmtN(totalCasos)} sub={segRegionFiltro || 'Total nacional'} color="#dc2626" />
              <KpiCard label="Var. año a la fecha"   value={fmtPct(varProm)}  sub={segRegionFiltro || 'Promedio regional'} color={varProm != null && varProm < 0 ? '#16a34a' : '#dc2626'} />
              <KpiCard label="Casos última semana"   value={fmtN(totalSem)}   sub={segRegionFiltro || 'Nacional'} color="#dc2626" />
              <KpiCard label="Tasa por 100 mil hab." value={fmtN(tasaProm, 1)} sub={segRegionFiltro || 'Promedio regional'} color="#d97706" />
            </div>
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-800">Casos año a la fecha — {semana}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-800 text-white">
                      <th className="px-4 py-2.5 text-left font-medium">Región</th>
                      <th className="px-4 py-2.5 text-right font-medium">Casos año</th>
                      <th className="px-4 py-2.5 text-right font-medium">Var. año %</th>
                      <th className="px-4 py-2.5 text-right font-medium">Casos sem.</th>
                      <th className="px-4 py-2.5 text-right font-medium">Tasa /100k</th>
                      <th className="px-4 py-2.5 text-left  font-medium">Principal delito</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedByCasos.map((r, i) => (
                      <tr key={r.id_region} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-2 font-medium text-gray-700">{r.nombre_region}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmtN(r.casos_anno_fecha)}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-semibold"
                          style={{ color: r.var_anno_fecha != null ? (r.var_anno_fecha < 0 ? '#16a34a' : '#dc2626') : '#94a3b8' }}>
                          {fmtPct(r.var_anno_fecha)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmtN(r.casos_ultima_semana)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmtN(r.tasa_registro, 1)}</td>
                        <td className="px-4 py-2 text-gray-600 max-w-[200px] truncate">{r.mayor_registro_1 ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="bg-white rounded-xl shadow-sm p-4">
                <h4 className="text-xs font-bold text-gray-700 mb-3">Top delito más frecuente por región (n° regiones)</h4>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={topDelitoChart} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="nombre" tick={{ fontSize: 9 }} width={160} />
                    <Tooltip formatter={v => [v, 'N° regiones']} />
                    <Bar dataKey="n" fill="rgba(37,99,235,.75)" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4">
                <h4 className="text-xs font-bold text-gray-700 mb-3">Tasa de registro por 100 mil hab.</h4>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={sortedByTasa} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="nombre_region" tick={{ fontSize: 9 }} width={130} />
                    <Tooltip formatter={v => [fmtN(v as number, 1), 'Tasa /100k']} />
                    <Bar dataKey="tasa_registro" radius={[0, 3, 3, 0]}>
                      {sortedByTasa.map(r => (
                        <Cell key={r.id_region}
                          fill={(r.tasa_registro ?? 0) > 500 ? 'rgba(220,38,38,.8)' : (r.tasa_registro ?? 0) > 400 ? 'rgba(217,119,6,.8)' : 'rgba(22,163,74,.8)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        ))}

        {activeTab === 'evolucion' && (
          <>
            <Filtros>
              <FiltroField label="Región">
                <select value={segRegionCod} onChange={e => setSegRegionCod(e.target.value)} className={`${selectCls} min-w-[200px]`}>
                  {REGIONS.map(r => <option key={r.cod} value={r.cod}>{r.nombre}</option>)}
                </select>
              </FiltroField>
              <FiltroField label="Indicador">
                <select value={segInd} onChange={e => setSegInd(e.target.value as SegInd)} className={`${selectCls} min-w-[200px]`}>
                  {(Object.entries(SEG_IND_LABELS) as [SegInd, string][]).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </FiltroField>
            </Filtros>
            {histL ? <Spinner /> : (
              <>
                <div className="bg-white rounded-xl shadow-sm p-4">
                  <h3 className="text-xs font-bold text-gray-700 mb-3">
                    {selectedRegion?.nombre} — {SEG_IND_LABELS[segInd]}
                  </h3>
                  {history.length === 0
                    ? <p className="text-xs text-gray-400 text-center py-8">Sin datos disponibles</p>
                    : (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={history.map(r => ({ sem: r.semana, val: r[segInd] }))}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="sem" tick={{ fontSize: 8 }} angle={-55} textAnchor="end" height={65} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Bar dataKey="val" radius={[2, 2, 0, 0]}>
                            {history.map(r => {
                              const v = r[segInd] as number | null
                              return <Cell key={r.id_semana}
                                fill={segInd === 'var_anno_fecha'
                                  ? (v != null && v < 0 ? 'rgba(22,163,74,.8)' : 'rgba(220,38,38,.8)')
                                  : 'rgba(22,163,74,.75)'} />
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )
                  }
                </div>
                {history.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm p-4">
                    <h3 className="text-xs font-bold text-gray-700 mb-3">
                      {selectedRegion?.nombre} — top delitos por semana (% del total)
                    </h3>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={history.map(r => ({
                        sem: r.semana, d1: r.n_1, d2: r.n_2, d3: r.n_3, d4: r.n_4, d5: r.n_5,
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="sem" tick={{ fontSize: 8 }} angle={-55} textAnchor="end" height={65} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                        <Tooltip />
                        <Bar dataKey="d1" stackId="a" name="1°" fill="rgba(22,163,74,.8)" />
                        <Bar dataKey="d2" stackId="a" name="2°" fill="rgba(37,99,235,.8)" />
                        <Bar dataKey="d3" stackId="a" name="3°" fill="rgba(217,119,6,.8)" />
                        <Bar dataKey="d4" stackId="a" name="4°" fill="rgba(220,38,38,.8)" />
                        <Bar dataKey="d5" stackId="a" name="5°" fill="rgba(147,51,234,.8)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {activeTab === 'operativo' && (loading ? <Spinner /> : (
          <>
            <Filtros><SemanaSelector /></Filtros>
            {semana && <p className="text-[11px] text-gray-400">Semana: <strong>{semana}</strong></p>}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Controles realizados"  value={fmtN(rows.reduce((s, r) => s + ((r.controles_identidad ?? 0) + (r.controles_vehicular ?? 0)), 0))} sub="Identidad + vehicular" color="#6366f1" />
              <KpiCard label="Incautaciones armas"   value={fmtN(rows.reduce((s, r) => s + ((r.incaut_fuego ?? 0) + (r.incaut_blancas ?? 0)), 0))} sub="Fuego + blancas" color="#dc2626" />
              <KpiCard label="Decomisos drogas"      value={fmtN(rows.reduce((s, r) => s + (r.decomisos_anno ?? 0), 0))} sub="Año a la fecha" color="#d97706" />
              <KpiCard label="Regiones con datos"    value={String(rows.length)} color="#6366f1" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="bg-white rounded-xl shadow-sm p-4">
                <h4 className="text-xs font-bold text-gray-700 mb-3">Controles por región</h4>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={[...rows].sort((a, b) => ((b.controles_identidad ?? 0) + (b.controles_vehicular ?? 0)) - ((a.controles_identidad ?? 0) + (a.controles_vehicular ?? 0)))} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="nombre_region" tick={{ fontSize: 9 }} width={130} />
                    <Tooltip />
                    <Bar dataKey="controles_identidad" stackId="a" name="Identidad"  fill="rgba(37,99,235,.75)" />
                    <Bar dataKey="controles_vehicular" stackId="a" name="Vehicular"  fill="rgba(22,163,74,.75)" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4">
                <h4 className="text-xs font-bold text-gray-700 mb-3">Incautaciones de armas por región</h4>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={[...rows].sort((a, b) => ((b.incaut_fuego ?? 0) + (b.incaut_blancas ?? 0)) - ((a.incaut_fuego ?? 0) + (a.incaut_blancas ?? 0)))} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="nombre_region" tick={{ fontSize: 9 }} width={130} />
                    <Tooltip />
                    <Bar dataKey="incaut_fuego"   stackId="a" name="Armas de fuego" fill="rgba(220,38,38,.75)" />
                    <Bar dataKey="incaut_blancas" stackId="a" name="Armas blancas"  fill="rgba(217,119,6,.75)" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        ))}

        {activeTab === 'dmcs' && (delL ? <Spinner /> : (() => {
          const semLabel = semanas.find(s => s.id_semana === effSemana)?.nombre ?? ''

          const baseRows = delRows.filter(r => !dmcsRegion || r.nombre_region === dmcsRegion)
          const dmcsRows = baseRows.filter(r => DMCS_LISTA.includes(r.nombre_delito))
          const filtRows = dmcsDelito ? dmcsRows.filter(r => r.nombre_delito === dmcsDelito) : dmcsRows
          const todosRows = baseRows

          const totalAnno  = filtRows.reduce((s, r) => s + (r.anno_fecha ?? 0), 0)
          const totalAnt   = filtRows.reduce((s, r) => s + (r.anno_fecha_ant ?? 0), 0)
          const varDmcs    = totalAnt > 0 ? ((totalAnno - totalAnt) / totalAnt * 100) : null
          const totalTodos = todosRows.reduce((s, r) => s + (r.anno_fecha ?? 0), 0)
          const pctDmcs    = totalTodos > 0 ? (totalAnno / totalTodos * 100) : 0

          // Tasa DMCS/100k: población inversa desde tasa_registro de registros_leystop
          let tasaDmcs: number | null = null
          if (dmcsRegion) {
            const sr = rows.find(r => r.nombre_region === dmcsRegion)
            if (sr?.tasa_registro != null && sr.tasa_registro > 0 && sr.casos_anno_fecha != null && sr.casos_anno_fecha > 0) {
              const pob = sr.casos_anno_fecha / sr.tasa_registro * 100000
              tasaDmcs = totalAnno / pob * 100000
            }
          } else {
            let pobTotal = 0
            rows.forEach(r => {
              if (r.tasa_registro != null && r.tasa_registro > 0 && r.casos_anno_fecha != null && r.casos_anno_fecha > 0)
                pobTotal += r.casos_anno_fecha / r.tasa_registro * 100000
            })
            tasaDmcs = pobTotal > 0 ? totalAnno / pobTotal * 100000 : null
          }

          const sumaPorDelito: Record<string, { anno: number; ant: number }> = {}
          filtRows.forEach(r => {
            if (!sumaPorDelito[r.nombre_delito]) sumaPorDelito[r.nombre_delito] = { anno: 0, ant: 0 }
            sumaPorDelito[r.nombre_delito].anno += r.anno_fecha ?? 0
            sumaPorDelito[r.nombre_delito].ant  += r.anno_fecha_ant ?? 0
          })
          const barData = Object.entries(sumaPorDelito)
            .sort((a, b) => b[1].anno - a[1].anno)
            .map(([nombre, v]) => ({
              nombre: nombre.length > 35 ? nombre.slice(0, 35) + '…' : nombre,
              anno: v.anno,
              ant: v.ant,
            }))

          // Tabla por región
          const porRegion: Record<string, { anno: number; ant: number; sem: number; dias28: number; maxUmbral: number; delito: string }> = {}
          dmcsRows.forEach(r => {
            if (!porRegion[r.nombre_region]) porRegion[r.nombre_region] = { anno: 0, ant: 0, sem: 0, dias28: 0, maxUmbral: -Infinity, delito: '' }
            const pr = porRegion[r.nombre_region]
            pr.anno  += r.anno_fecha ?? 0
            pr.ant   += r.anno_fecha_ant ?? 0
            pr.sem   += r.ultima_semana ?? 0
            pr.dias28 += r.dias28 ?? 0
            const u = parseFloat(r.umbral ?? '-99')
            if (u > pr.maxUmbral) { pr.maxUmbral = u; pr.delito = r.nombre_delito }
          })
          const tablaRows = Object.entries(porRegion)
            .sort((a, b) => b[1].anno - a[1].anno)
            .map(([region, v]) => ({ region, ...v, varPct: v.ant > 0 ? ((v.anno - v.ant) / v.ant * 100) : null }))

          // Evolución semanal (historial región seleccionada, cargado por useColegaDelitosRegion)
          const evoBase = dmcsRegion
            ? delHistory.filter(r => DMCS_LISTA.includes(r.nombre_delito))
            : []
          const evoSemanas = [...new Set(evoBase.map(r => r.id_semana))].sort()
          const evoData = evoSemanas.map(id => {
            const sRows = evoBase.filter(r => r.id_semana === id)
            const label = sRows[0]?.semana?.replace('SEMANA ', 'S') ?? String(id)
            return { label, anno: sRows.reduce((s, r) => s + (r.ultima_semana ?? 0), 0) }
          })

          return (
            <>
              <Filtros>
                <SemanaSelector />
                <FiltroField label="Región">
                  <select value={dmcsRegion} onChange={e => setDmcsRegion(e.target.value)} className={`${selectCls} min-w-[200px]`}>
                    <option value="">Todas las regiones</option>
                    {REGIONS.map(r => <option key={r.cod} value={r.nombre}>{r.nombre}</option>)}
                  </select>
                </FiltroField>
                <FiltroField label="Delito DMCS">
                  <select value={dmcsDelito} onChange={e => setDmcsDelito(e.target.value)} className={`${selectCls} min-w-[240px]`}>
                    <option value="">Todos los DMCS</option>
                    {DMCS_LISTA.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </FiltroField>
              </Filtros>
              {semLabel && <p className="text-[11px] text-gray-400">Semana: <strong>{semLabel}</strong> · {dmcsRegion || 'Nacional'}</p>}

              {barData.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-5 items-start">
                  <div className="grid grid-cols-2 gap-3">
                    <KpiCard label="DMCS año a la fecha"    value={fmtN(totalAnno)} color="#500707" />
                    <KpiCard label="Var. vs año anterior"   value={fmtPct(varDmcs)} color="#7f1d1d" />
                    <KpiCard label="Tasa DMCS / 100k hab."  value={tasaDmcs != null ? fmtN(tasaDmcs, 1) : '—'} color="#991b1b" />
                    <KpiCard label="% del total de delitos" value={pctDmcs.toFixed(1) + '%'} color="#b91c1c" />
                  </div>
                  <div className="bg-white rounded-xl shadow-sm p-4">
                    <h4 className="text-xs font-bold text-gray-700 mb-3">DMCS por tipo — año a la fecha</h4>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={barData} layout="vertical" margin={{ left: 4, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 9 }} allowDecimals={false} />
                        <YAxis type="category" dataKey="nombre" tick={{ fontSize: 8 }} width={160} />
                        <Tooltip formatter={(v) => fmtN(v as number)} />
                        <Bar dataKey="anno" name="2026 (año a la fecha)" fill="rgba(220,38,38,.75)" radius={[0, 3, 3, 0]} />
                        <Bar dataKey="ant"  name="2025 (año a la fecha)" fill="rgba(156,163,175,.5)" radius={[0, 3, 3, 0]} />
                        <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <KpiCard label="DMCS año a la fecha"    value={fmtN(totalAnno)} color="#500707" />
                  <KpiCard label="Var. vs año anterior"   value={fmtPct(varDmcs)} color="#7f1d1d" />
                  <KpiCard label="Tasa DMCS / 100k hab."  value={tasaDmcs != null ? fmtN(tasaDmcs, 1) : '—'} color="#991b1b" />
                  <KpiCard label="% del total de delitos" value={pctDmcs.toFixed(1) + '%'} color="#b91c1c" />
                </div>
              )}

              {tablaRows.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm p-4 overflow-x-auto">
                  <h4 className="text-xs font-bold text-gray-700 mb-3">Detalle DMCS por región</h4>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600">
                        <th className="px-3 py-2 text-left font-medium">Región</th>
                        <th className="px-3 py-2 text-right font-medium">Total DMCS año</th>
                        <th className="px-3 py-2 text-right font-medium">Var. %</th>
                        <th className="px-3 py-2 text-right font-medium">Última sem.</th>
                        <th className="px-3 py-2 text-right font-medium">28 días</th>
                        <th className="px-3 py-2 text-left font-medium">Delito más grave</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tablaRows.map((r, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-3 py-1.5 font-medium">{r.region}</td>
                          <td className="px-3 py-1.5 text-right">{fmtN(r.anno)}</td>
                          <td className={`px-3 py-1.5 text-right font-semibold ${r.varPct == null ? '' : r.varPct < 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {r.varPct != null ? fmtPct(r.varPct) : '—'}
                          </td>
                          <td className="px-3 py-1.5 text-right">{fmtN(r.sem)}</td>
                          <td className="px-3 py-1.5 text-right">{fmtN(r.dias28)}</td>
                          <td className="px-3 py-1.5 text-gray-600 max-w-[200px] truncate">{r.delito}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-[10px] text-gray-400 mt-2">Var. % calculada respecto al mismo período del año anterior. "Delito más grave" = DMCS con umbral más alto.</p>
                </div>
              )}

              {dmcsRegion && evoData.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm p-4">
                  <h4 className="text-xs font-bold text-gray-700 mb-3">Evolución semanal DMCS — {dmcsRegion}</h4>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={evoData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={50}
                        interval={Math.max(0, Math.floor(evoData.length / 20))} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip formatter={(v) => fmtN(v as number)} />
                      <Bar dataKey="anno" name="Casos DMCS" fill="rgba(220,38,38,.75)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )
        })())}
      </Contenido>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// PIB REGIONAL
// ══════════════════════════════════════════════════════════════
const PIB_TABS: { id: PibTab; label: string }[] = [
  { id: 'evolucion', label: 'Evolución' },
  { id: 'sectores',  label: 'Sectores productivos' },
  { id: 'nacional',  label: 'Resumen nacional' },
]

function PibModule() {
  const [activeTab, setActiveTab] = useState<PibTab>('evolucion')
  const [pibRegion, setPibRegion] = useState(REGIONS[6].nombre)
  const [freq, setFreq]           = useState<'anual' | 'trimestral'>('anual')
  const [desdeAnio, setDesdeAnio] = useState('')
  const [hastaAnio, setHastaAnio] = useState('')
  const [mostrarVar, setMostrarVar] = useState(false)

  const { rows, loading: rowsL }                    = useMetricasPibRegion(pibRegion)
  const { años: nacAños, regiones: nacRegs, valores: nacVals,
          extrarregional: nacExtra, loading: nacL }  = useMetricasPibNacional()

  const isAnual = freq === 'anual'

  const allPeriods = useMemo(() => {
    const set = new Set<string>()
    rows.filter(r =>
      r.unidad_limpia === PIB_UNIDAD_ENC &&
      (isAnual ? r.series_id?.endsWith('A') : !r.series_id?.endsWith('A'))
    ).forEach(r => set.add(r.periodo))
    return [...set].sort((a, b) => parsePeriodo(a).sortKey.localeCompare(parsePeriodo(b).sortKey))
  }, [rows, isAnual])

  const anios = useMemo(() => {
    const set = new Set<string>()
    allPeriods.forEach(p => set.add(parsePeriodo(p).year))
    return [...set].sort()
  }, [allPeriods])

  const efectivoDe    = desdeAnio || anios[Math.max(0, anios.length - (isAnual ? 8 : 10))]
  const efectivoHasta = hastaAnio || anios[anios.length - 1]

  const filteredPeriods = useMemo(() =>
    allPeriods.filter(p => {
      const { year } = parsePeriodo(p)
      return year >= efectivoDe && year <= efectivoHasta
    }),
    [allPeriods, efectivoDe, efectivoHasta]
  )

  const SECTOR_ORDER = Object.keys(SECTOR_DISP)
  const allSectors = useMemo(() => {
    const set = new Set<string>()
    rows.filter(r => r.unidad_limpia === PIB_UNIDAD_ENC).forEach(r => set.add(r.indicador_limpio))
    return SECTOR_ORDER.filter(s => set.has(s)).concat([...set].filter(s => !SECTOR_ORDER.includes(s)))
  }, [rows])

  const pibGrid = useMemo(() => {
    const map: Record<string, Record<string, number | null>> = {}
    for (const r of rows.filter(r =>
      r.unidad_limpia === PIB_UNIDAD_ENC &&
      (isAnual ? r.series_id?.endsWith('A') : !r.series_id?.endsWith('A'))
    )) {
      if (!map[r.indicador_limpio]) map[r.indicador_limpio] = {}
      map[r.indicador_limpio][r.periodo] = r.valor_corregido
    }
    return map
  }, [rows, isAnual])

  // Var. % interanual: valor[t] / valor[mismo mes año anterior] - 1
  function calcVarEnc(sector: string, periodo: string): number | null {
    const v1 = pibGrid[sector]?.[periodo] ?? null
    if (v1 == null) return null
    const { year, month } = parsePeriodo(periodo)
    const prevYear = String(parseInt(year) - 1)
    const prevP = allPeriods.find(p => {
      const pp = parsePeriodo(p)
      return pp.year === prevYear && pp.month === month
    })
    if (!prevP) return null
    const v0 = pibGrid[sector]?.[prevP] ?? null
    if (v0 == null || v0 === 0) return null
    return (v1 / v0 - 1) * 100
  }

  function calcCAGR(sData: Record<string, number | null>, de: string, ha: string): number | null {
    const p0 = filteredPeriods.find(p => parsePeriodo(p).year === de && sData[p] != null)
    const p1 = [...filteredPeriods].reverse().find(p => parsePeriodo(p).year === ha && sData[p] != null)
    if (!p0 || !p1) return null
    const v0 = sData[p0]!, v1 = sData[p1]!
    const n = parseInt(ha) - parseInt(de)
    if (v0 === 0 || n <= 0) return null
    return (Math.pow(v1 / v0, 1 / n) - 1) * 100
  }

  // Nacional: última año suma de regiones
  const latestNacYear = nacAños[nacAños.length - 1]
  const nacTotal = useMemo(
    () => nacRegs.reduce((s, r) => s + (nacVals[r]?.[latestNacYear] ?? 0), 0),
    [nacRegs, nacVals, latestNacYear]
  )

  const evoData = useMemo(() => {
    return filteredPeriods.map(p => {
      const val = pibGrid['PIB']?.[p] ?? null
      const label = periodoLabel(p, freq)
      return { label, valor: val }
    })
  }, [filteredPeriods, pibGrid, freq])

  const FreqSelector = () => (
    <FiltroField label="Frecuencia">
      <select value={freq} onChange={e => { setFreq(e.target.value as 'anual' | 'trimestral'); setDesdeAnio(''); setHastaAnio('') }} className={`${selectCls} min-w-[140px]`}>
        <option value="anual">Anual</option>
        <option value="trimestral">Trimestral</option>
      </select>
    </FiltroField>
  )
  const AnioSelectors = () => (
    <>
      <FiltroField label="Año desde">
        <select value={desdeAnio || efectivoDe} onChange={e => setDesdeAnio(e.target.value)} className={`${selectCls} min-w-[90px]`}>
          {anios.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </FiltroField>
      <FiltroField label="Año hasta">
        <select value={hastaAnio || efectivoHasta} onChange={e => setHastaAnio(e.target.value)} className={`${selectCls} min-w-[90px]`}>
          {anios.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </FiltroField>
    </>
  )

  return (
    <div>
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4">
        <label className="text-xs font-semibold text-gray-500">Región:</label>
        <select value={pibRegion} onChange={e => setPibRegion(e.target.value)} className={`${selectCls} min-w-[260px]`}>
          {REGIONS.map(r => <option key={r.cod} value={r.nombre}>{r.nombre}</option>)}
        </select>
      </div>
      <SubTabs tabs={PIB_TABS} active={activeTab} onSelect={setActiveTab} color="#2563eb" />
      <Contenido>

        {/* ── Evolución ── */}
        {activeTab === 'evolucion' && (
          <>
            <Filtros>
              <FreqSelector />
              <AnioSelectors />
            </Filtros>
            {rowsL ? <Spinner /> : (
              <>
                {evoData.length > 0 && (() => {
                  const noNull = evoData.filter(d => d.valor != null)
                  const ult  = noNull[noNull.length - 1]
                  const prv  = noNull[noNull.length - 2]
                  const cagr = calcCAGR(pibGrid['PIB'] ?? {}, efectivoDe, efectivoHasta)
                  const varUlt = ult ? calcVarEnc('PIB', filteredPeriods[filteredPeriods.length - 1]) : null
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <KpiCard label={`PIB ${ult?.label ?? ''}`}
                        value={fmtN(ult?.valor, 0) + ' MM$'}
                        sub="miles MM$ enc. base 2018" color="#2563eb" />
                      {prv && <KpiCard label="Período anterior" value={fmtN(prv.valor, 0) + ' MM$'} sub={prv.label} color="#2563eb" />}
                      {varUlt != null && <KpiCard label="Var. % interanual"
                        value={(varUlt >= 0 ? '+' : '') + varUlt.toFixed(1) + '%'}
                        color={varUlt >= 0 ? '#16a34a' : '#dc2626'} />}
                      {cagr != null && <KpiCard label={`CAGR ${efectivoDe}–${efectivoHasta}`}
                        value={(cagr >= 0 ? '+' : '') + cagr.toFixed(2) + '%'}
                        sub="vol. encadenado" color={cagr >= 0 ? '#16a34a' : '#dc2626'} />}
                    </div>
                  )
                })()}
                <div className="bg-white rounded-xl shadow-sm p-4">
                  <h3 className="text-xs font-bold text-gray-700 mb-3">
                    PIB {pibRegion} — {isAnual ? 'Anual' : 'Trimestral'}
                    <span className="text-gray-400 font-normal ml-2">(vol. encadenado base 2018)</span>
                  </h3>
                  {evoData.length === 0
                    ? <p className="text-xs text-gray-400 text-center py-8">Sin datos</p>
                    : (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={evoData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 9 }} angle={isAnual ? 0 : -55} textAnchor={isAnual ? 'middle' : 'end'} height={isAnual ? 20 : 55} />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmtN(v, 0)} />
                          <Tooltip formatter={v => [fmtN(v as number, 0) + ' MM$', 'PIB']} />
                          <Bar dataKey="valor" fill="rgba(37,99,235,.75)" radius={[2, 2, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )
                  }
                </div>
              </>
            )}
          </>
        )}

        {/* ── Sectores productivos ── */}
        {activeTab === 'sectores' && (
          <>
            <Filtros>
              <FreqSelector />
              <AnioSelectors />
              <FiltroField label="Vista">
                <label className="flex items-center gap-2 cursor-pointer py-1.5">
                  <input type="checkbox" checked={mostrarVar} onChange={e => setMostrarVar(e.target.checked)} className="w-3.5 h-3.5" />
                  <span className="text-xs text-gray-700">Mostrar var. % interanual</span>
                </label>
              </FiltroField>
            </Filtros>
            {rowsL ? <Spinner /> : (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <h3 className="text-sm font-bold text-gray-800">
                    {pibRegion} — Sectores productivos
                    <span className="text-xs font-normal text-gray-400 ml-2">
                      {mostrarVar ? 'Var. % interanual' : 'vol. enc. MM$ base 2018'}
                    </span>
                  </h3>
                </div>
                {filteredPeriods.length === 0 || allSectors.length === 0
                  ? <p className="text-xs text-gray-400 text-center py-8">Sin datos disponibles</p>
                  : (
                    <div className="overflow-x-auto">
                      <table className="text-xs min-w-full">
                        <thead>
                          <tr className="bg-slate-800 text-white">
                            <th className="px-4 py-2.5 text-left font-medium sticky left-0 bg-slate-800 min-w-[180px]">Sector</th>
                            {filteredPeriods.map(p => (
                              <th key={p} className="px-3 py-2.5 text-right font-medium whitespace-nowrap">{periodoLabel(p, freq)}</th>
                            ))}
                            <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap bg-slate-700 border-l-2 border-sky-400">
                              CAGR {efectivoDe}→{efectivoHasta}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {allSectors.map((sector, si) => {
                            const sData = pibGrid[sector] ?? {}
                            const esTotal = sector === 'PIB'
                            const nombre  = SECTOR_DISP[sector] ?? sector
                            const cagr    = calcCAGR(sData, efectivoDe, efectivoHasta)
                            return (
                              <tr key={sector} className={esTotal ? 'bg-indigo-50 font-bold' : si % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                <td className={`px-4 py-2 sticky left-0 ${esTotal ? 'bg-indigo-50 font-bold' : si % 2 === 0 ? 'bg-white font-medium' : 'bg-gray-50 font-medium'} text-gray-700`}>
                                  {nombre}
                                </td>
                                {filteredPeriods.map(p => {
                                  if (mostrarVar) {
                                    const v = calcVarEnc(sector, p)
                                    return (
                                      <td key={p} className="px-3 py-2 text-right tabular-nums font-medium"
                                        style={{ color: v == null ? '#94a3b8' : v >= 0 ? '#16a34a' : '#dc2626' }}>
                                        {v != null ? (v >= 0 ? '+' : '') + v.toFixed(1) + '%' : '—'}
                                      </td>
                                    )
                                  }
                                  return <td key={p} className="px-3 py-2 text-right tabular-nums">{fmtN(sData[p], 0)}</td>
                                })}
                                <td className={`px-3 py-2 text-right tabular-nums font-semibold border-l-2 border-sky-200 ${cagr != null ? (cagr >= 0 ? 'text-green-700' : 'text-red-600') : 'text-gray-400'}`}>
                                  {cagr != null ? (cagr >= 0 ? '+' : '') + cagr.toFixed(2) + '%' : '—'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                }
                <p className="px-5 py-2 text-[10px] text-gray-400 italic">Volumen encadenado a precios del año anterior, series empalmadas.</p>
              </div>
            )}
          </>
        )}

        {/* ── Resumen nacional ── */}
        {activeTab === 'nacional' && (
          nacL ? <Spinner /> : (
            <div className="space-y-5">
              {/* Bar chart último año */}
              {nacRegs.length > 0 && latestNacYear && (
                <div className="bg-white rounded-xl shadow-sm p-4">
                  <h3 className="text-xs font-bold text-gray-700 mb-3">PIB por región — {latestNacYear}</h3>
                  <ResponsiveContainer width="100%" height={420}>
                    <BarChart
                      data={[...nacRegs].sort((a, b) => (nacVals[b]?.[latestNacYear] ?? 0) - (nacVals[a]?.[latestNacYear] ?? 0))
                        .map(r => ({ region: r, pib: nacVals[r]?.[latestNacYear] ?? null }))}
                      layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => fmtN(v, 0)} />
                      <YAxis type="category" dataKey="region" tick={{ fontSize: 9 }} width={135} />
                      <Tooltip formatter={v => [fmtN(v as number, 0) + ' MM$', 'PIB']} />
                      <Bar dataKey="pib" fill="rgba(37,99,235,.75)" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Tabla multi-año */}
              {nacAños.length > 0 && nacRegs.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100">
                    <h3 className="text-sm font-bold text-gray-800">PIB por región × año
                      <span className="text-xs font-normal text-gray-400 ml-2">(miles MM$ encadenado base 2018)</span>
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="text-xs min-w-full">
                      <thead>
                        <tr className="bg-slate-800 text-white">
                          <th className="px-4 py-2.5 text-left font-medium sticky left-0 bg-slate-800 min-w-[160px]">Región</th>
                          {nacAños.map(a => <th key={a} className="px-3 py-2.5 text-right font-medium whitespace-nowrap">{a}</th>)}
                          <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap bg-slate-700 border-l-2 border-sky-400">CAGR</th>
                          <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">% PIB {latestNacYear}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const sorted = [...nacRegs].sort((a, b) => (nacVals[b]?.[latestNacYear] ?? 0) - (nacVals[a]?.[latestNacYear] ?? 0))
                          return sorted.map((reg, si) => {
                            const avail = nacAños.filter(a => nacVals[reg]?.[a] != null)
                            const cagr = avail.length >= 2 ? (() => {
                              const v0 = nacVals[reg][avail[0]]!, v1 = nacVals[reg][avail[avail.length-1]]!
                              const n = parseInt(avail[avail.length-1]) - parseInt(avail[0])
                              return n > 0 && v0 > 0 ? (Math.pow(v1/v0, 1/n) - 1) * 100 : null
                            })() : null
                            const pct = nacTotal > 0 ? (nacVals[reg]?.[latestNacYear] ?? 0) / nacTotal * 100 : null
                            return (
                              <tr key={reg} className={si % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                <td className={`px-4 py-2 font-medium text-gray-700 sticky left-0 ${si % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>{reg}</td>
                                {nacAños.map(a => (
                                  <td key={a} className="px-3 py-2 text-right tabular-nums">{fmtN(nacVals[reg]?.[a], 0)}</td>
                                ))}
                                <td className={`px-3 py-2 text-right tabular-nums font-semibold border-l-2 border-sky-200 ${cagr != null ? (cagr >= 0 ? 'text-green-700' : 'text-red-600') : 'text-gray-400'}`}>
                                  {cagr != null ? (cagr >= 0 ? '+' : '') + cagr.toFixed(2) + '%' : '—'}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-gray-600">{pct != null ? pct.toFixed(1) + '%' : '—'}</td>
                              </tr>
                            )
                          })
                        })()}
                        {/* Extrarregional */}
                        {Object.keys(nacExtra).length > 0 && (
                          <tr className="bg-amber-50 border-t border-amber-200">
                            <td className="px-4 py-2 font-medium text-amber-800 sticky left-0 bg-amber-50">Extrarregional</td>
                            {nacAños.map(a => <td key={a} className="px-3 py-2 text-right tabular-nums text-amber-700">{fmtN(nacExtra[a], 0)}</td>)}
                            <td className="px-3 py-2 border-l-2 border-sky-200" />
                            <td className="px-3 py-2 text-right tabular-nums text-amber-700">
                              {nacTotal > 0 && nacExtra[latestNacYear] != null
                                ? (nacExtra[latestNacYear]! / nacTotal * 100).toFixed(1) + '%' : '—'}
                            </td>
                          </tr>
                        )}
                        {/* Total nacional */}
                        <tr className="bg-indigo-50 font-bold border-t-2 border-indigo-300">
                          <td className="px-4 py-2 text-indigo-800 sticky left-0 bg-indigo-50">Total regiones</td>
                          {nacAños.map(a => {
                            const sum = nacRegs.reduce((s, r) => s + (nacVals[r]?.[a] ?? 0), 0) + (nacExtra[a] ?? 0)
                            return <td key={a} className="px-3 py-2 text-right tabular-nums text-indigo-800">{fmtN(sum, 0)}</td>
                          })}
                          <td className="px-3 py-2 border-l-2 border-sky-200" />
                          <td className="px-3 py-2 text-right text-indigo-800">100%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="px-5 py-2 text-[10px] text-gray-400 italic">Fuente: Banco Central de Chile, series encadenadas base 2018.</p>
                </div>
              )}
            </div>
          )
        )}
      </Contenido>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// CENSO 2024
// ══════════════════════════════════════════════════════════════
const CENSO_TABS: { id: CensoTab; label: string }[] = [
  { id: 'demografia',   label: 'Demografía' },
  { id: 'vivienda',     label: 'Vivienda' },
  { id: 'educacion',    label: 'Educación' },
  { id: 'conectividad', label: 'Conectividad y Servicios' },
]

const CENSO_PIE = ['#1e3a8a','#1e40af','#1d4ed8','#2563eb','#3b82f6','#60a5fa','#93c5fd','#172554']

function CensoModule() {
  const [activeTab, setActiveTab]   = useState<CensoTab>('demografia')
  const [regionCod, setRegionCod]   = useState('')
  const [conectVar, setConectVar]   = useState('internet')
  const { loading, get, byCode, nacional } = useCensoRegiones()

  const d     = get(regionCod)
  const isNac = !regionCod
  const CC    = '#1e3a8a'
  const allR  = byCode ? Object.values(byCode) : []

  const pctOf = (n: number, den: number) => den > 0 ? (n / den * 100).toFixed(1) + '%' : '—'
  const pctN  = (n: number, den: number) => den > 0 ? n / den * 100 : 0

  const rankOf = (fn: (r: CensoRegionData) => number) => {
    if (!d || isNac) return null
    const sorted = [...allR].sort((a, b) => fn(b) - fn(a))
    return sorted.findIndex(r => r.cod === d.cod) + 1
  }

  return (
    <div>
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4">
        <label className="text-xs font-semibold text-gray-500">Región:</label>
        <select value={regionCod} onChange={e => setRegionCod(e.target.value)} className={`${selectCls} min-w-[240px]`}>
          <option value="">🇨🇱 Nacional (total)</option>
          {REGIONS.map(r => <option key={r.cod} value={r.cod}>{r.nombre}</option>)}
        </select>
        {d && !loading && (
          <span className="text-[10px] text-gray-400 ml-auto">Censo 2024 · {fmtN(d.n_per)} habitantes</span>
        )}
      </div>
      <SubTabs tabs={CENSO_TABS} active={activeTab} onSelect={setActiveTab} color={CC} />
      <Contenido>
        {loading ? <Spinner /> : !d ? (
          <SinDatos titulo="Sin datos" mensaje="No se pudieron cargar los datos del Censo 2024." />
        ) : (
          <>
            {/* ── DEMOGRAFÍA ── */}
            {activeTab === 'demografia' && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <KpiCard label="Total habitantes"    value={fmtN(d.n_per)}                                         color={CC} />
                  <KpiCard label="Inmigrantes"         value={pctOf(d.n_inmigrantes, d.n_per)} sub={fmtN(d.n_inmigrantes) + ' pers.'} color={CC} />
                  <KpiCard label="Pueblos originarios" value={pctOf(d.n_pueblos_orig, d.n_per)} sub={fmtN(d.n_pueblos_orig)}           color={CC} />
                  <KpiCard label="Discapacidad"        value={pctOf(d.n_discapacidad, d.n_per)} sub={fmtN(d.n_discapacidad)}           color={CC} />
                  <KpiCard label="Edad promedio"       value={d.prom_edad.toFixed(1) + ' años'}                       color={CC} />
                  <KpiCard label="Pers. por hogar"     value={d.prom_per_hog.toFixed(1)}                              color={CC} />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div className="bg-white rounded-xl shadow-sm p-4">
                    <h4 className="text-xs font-bold text-gray-700 mb-3">Distribución etaria (% de la población)</h4>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart
                        data={[
                          { grupo: '0-5 años',   pct: d.n_edad_0_5    / d.n_per * 100 },
                          { grupo: '6-13 años',  pct: d.n_edad_6_13   / d.n_per * 100 },
                          { grupo: '14-17 años', pct: d.n_edad_14_17  / d.n_per * 100 },
                          { grupo: '18-24 años', pct: d.n_edad_18_24  / d.n_per * 100 },
                          { grupo: '25-44 años', pct: d.n_edad_25_44  / d.n_per * 100 },
                          { grupo: '45-59 años', pct: d.n_edad_45_59  / d.n_per * 100 },
                          { grupo: '60+ años',   pct: d.n_edad_60_mas / d.n_per * 100 },
                        ]}
                        layout="vertical"
                        margin={{ left: 8, right: 28 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={v => (v as number).toFixed(0) + '%'} />
                        <YAxis type="category" dataKey="grupo" tick={{ fontSize: 10 }} width={72} />
                        <Tooltip formatter={(v: unknown) => [(v as number).toFixed(1) + '%', '% población']} />
                        <Bar dataKey="pct" fill={CC} radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm p-4">
                    <h4 className="text-xs font-bold text-gray-700 mb-1">Composición por sexo</h4>
                    <p className="text-[10px] text-gray-400 mb-3">{fmtN(d.n_hombres)} hombres · {fmtN(d.n_mujeres)} mujeres</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={[
                            { name: `Hombres (${pctOf(d.n_hombres, d.n_per)})`, value: d.n_hombres },
                            { name: `Mujeres (${pctOf(d.n_mujeres, d.n_per)})`,  value: d.n_mujeres },
                          ]}
                          dataKey="value" nameKey="name"
                          cx="50%" cy="50%"
                          innerRadius={58} outerRadius={88}
                          paddingAngle={3}
                        >
                          <Cell fill="#1e3a8a" />
                          <Cell fill="#93c5fd" />
                        </Pie>
                        <Tooltip formatter={(v: unknown) => [fmtN(v as number), 'personas']} />
                        <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                {isNac && byCode && (() => {
                  const rows = Object.values(byCode).sort((a, b) => b.n_inmigrantes / b.n_per - a.n_inmigrantes / a.n_per)
                  return (
                    <div className="bg-white rounded-xl shadow-sm p-4">
                      <h4 className="text-xs font-bold text-gray-700 mb-3">% Inmigrantes por región — Censo 2024</h4>
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={rows.map(r => ({ region: r.nombre, pct: r.n_inmigrantes / r.n_per * 100 }))} layout="vertical" margin={{ left: 8, right: 36 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={v => (v as number).toFixed(1) + '%'} />
                          <YAxis type="category" dataKey="region" tick={{ fontSize: 9 }} width={130} />
                          <Tooltip formatter={(v: unknown) => [(v as number).toFixed(1) + '%', '% inmigrantes']} />
                          <Bar dataKey="pct" fill={CC} radius={[0, 3, 3, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )
                })()}
              </>
            )}

            {/* ── VIVIENDA ── */}
            {activeTab === 'vivienda' && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                  <KpiCard label="Hogares"              value={fmtN(d.n_hog)}                                                                          color={CC} />
                  <KpiCard label="Viv. part. ocupadas"  value={fmtN(d.n_vp_ocupada)}  sub={pctOf(d.n_vp_desocupada, d.n_vp) + ' desocupadas'}        color={CC} />
                  <KpiCard label="Unipersonales"        value={pctOf(d.n_hog_unipersonales, d.n_hog)} sub={fmtN(d.n_hog_unipersonales)}               color={CC} />
                  <KpiCard label="Jefatura mujer"       value={pctOf(d.n_jefatura_mujer, d.n_hog)}                                                    color={CC} />
                  <KpiCard label="Viv. hacinadas"       value={pctOf(d.n_viv_hacinadas, d.n_vp_ocupada)}      sub={fmtN(d.n_viv_hacinadas)}           color={CC} />
                  <KpiCard label="Viv. irrecuperables"  value={pctOf(d.n_viv_irrecuperables, d.n_vp_ocupada)} sub={fmtN(d.n_viv_irrecuperables)}      color={CC} />
                  <KpiCard label="Déficit cuantitativo" value={pctOf(d.n_deficit_cuantitativo, d.n_vp_ocupada)} sub={fmtN(d.n_deficit_cuantitativo) + ' viviendas'} color={CC} />
                  <KpiCard label="Hogares allegados"    value={fmtN(d.n_hog_allegados)}                                                               color={CC} />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div className="bg-white rounded-xl shadow-sm p-4">
                    <h4 className="text-xs font-bold text-gray-700 mb-3">Tipo de vivienda particular</h4>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Casa',           value: d.n_tipo_viv_casa },
                            { name: 'Depto.',          value: d.n_tipo_viv_depto },
                            { name: 'Mediagua',       value: d.n_tipo_viv_mediagua },
                            { name: 'Ruka/indígena',  value: d.n_tipo_viv_indigena },
                            { name: 'Pieza',          value: d.n_tipo_viv_pieza },
                            { name: 'Otro',           value: d.n_tipo_viv_movil + d.n_tipo_viv_otro },
                          ]}
                          dataKey="value" nameKey="name"
                          cx="50%" cy="50%"
                          innerRadius={50} outerRadius={82}
                          paddingAngle={2}
                        >
                          {CENSO_PIE.slice(0, 6).map((c, i) => <Cell key={i} fill={c} />)}
                        </Pie>
                        <Tooltip formatter={(v: unknown, name: unknown) => [fmtN(v as number), name as string]} />
                        <Legend iconSize={8} wrapperStyle={{ fontSize: 9 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm p-4">
                    <h4 className="text-xs font-bold text-gray-700 mb-3">Tenencia de vivienda</h4>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Propia pagada',  value: d.n_tenencia_propia_pagada },
                            { name: 'Propia pagando', value: d.n_tenencia_propia_pagandose },
                            { name: 'Arrendada',      value: d.n_tenencia_arrendada_contrato + d.n_tenencia_arrendada_sin_contrato },
                            { name: 'Cedida',         value: d.n_tenencia_cedida_trabajo + d.n_tenencia_cedida_familiar },
                            { name: 'Otro',           value: d.n_tenencia_otro },
                          ]}
                          dataKey="value" nameKey="name"
                          cx="50%" cy="50%"
                          innerRadius={50} outerRadius={82}
                          paddingAngle={2}
                        >
                          {CENSO_PIE.slice(0, 5).map((c, i) => <Cell key={i} fill={c} />)}
                        </Pie>
                        <Tooltip formatter={(v: unknown, name: unknown) => [fmtN(v as number), name as string]} />
                        <Legend iconSize={8} wrapperStyle={{ fontSize: 9 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-4">
                  <h4 className="text-xs font-bold text-gray-700 mb-3">Servicios básicos (% de viviendas ocupadas)</h4>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart
                      data={[
                        { serv: 'Agua red pública',  pct: d.n_fuente_agua_publica   / d.n_vp_ocupada * 100 },
                        { serv: 'Alcant. interior',  pct: d.n_serv_hig_alc_dentro   / d.n_vp_ocupada * 100 },
                        { serv: 'Electricidad red',  pct: d.n_fuente_elect_publica  / d.n_vp_ocupada * 100 },
                        { serv: 'Retiro basura',     pct: d.n_basura_servicios      / d.n_vp_ocupada * 100 },
                      ]}
                      layout="vertical"
                      margin={{ left: 8, right: 40 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9 }} tickFormatter={v => v + '%'} />
                      <YAxis type="category" dataKey="serv" tick={{ fontSize: 10 }} width={120} />
                      <Tooltip formatter={(v: unknown) => [(v as number).toFixed(1) + '%', '% viviendas']} />
                      <Bar dataKey="pct" fill={CC} radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {isNac && byCode && (() => {
                  const rows = Object.values(byCode).sort((a, b) => b.n_viv_hacinadas / b.n_vp_ocupada - a.n_viv_hacinadas / a.n_vp_ocupada)
                  return (
                    <div className="bg-white rounded-xl shadow-sm p-4">
                      <h4 className="text-xs font-bold text-gray-700 mb-3">% Viviendas hacinadas por región</h4>
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={rows.map(r => ({ region: r.nombre, pct: r.n_viv_hacinadas / r.n_vp_ocupada * 100 }))} layout="vertical" margin={{ left: 8, right: 40 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={v => (v as number).toFixed(1) + '%'} />
                          <YAxis type="category" dataKey="region" tick={{ fontSize: 9 }} width={130} />
                          <Tooltip formatter={(v: unknown) => [(v as number).toFixed(1) + '%', '% hacinadas']} />
                          <Bar dataKey="pct" fill="#a855f7" radius={[0, 3, 3, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )
                })()}
              </>
            )}

            {/* ── EDUCACIÓN ── */}
            {activeTab === 'educacion' && (() => {
              const totCine = d.n_cine_nunca_curso_primera_infancia + d.n_cine_primaria + d.n_cine_secundaria + d.n_cine_terciaria_maestria_doctorado + d.n_cine_especial_diferencial
              const EDU_C   = ['#dc2626','#f97316','#3b82f6','#7c3aed','#9ca3af']
              const EDU_C2  = ['#dc2626','#f97316','#3b82f6','#7c3aed','#22c55e','#d1d5db']
              return (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <KpiCard label="Prom. escolaridad"      value={d.prom_escolaridad18.toFixed(1) + ' años'} sub="Población 18+"                                               color={CC} />
                    <KpiCard label="Analfabetismo"          value={pctOf(d.n_analfabet, d.n_per)}            sub={fmtN(d.n_analfabet) + ' personas'}                           color="#16a34a" />
                    <KpiCard label="Sin escolaridad (CINE)" value={pctOf(d.n_cine_nunca_curso_primera_infancia, totCine)} sub="Nunca cursó"                                    color="#dc2626" />
                    <KpiCard label="Ed. Terciaria (CINE)"   value={pctOf(d.n_cine_terciaria_maestria_doctorado, totCine)} sub="Maestría/Doc. incl."                            color={CC} />
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <div className="bg-white rounded-xl shadow-sm p-4">
                      <h4 className="text-xs font-bold text-gray-700 mb-3">Nivel educacional (CINE)</h4>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart
                          data={[
                            { nivel: 'Sin escolaridad',    pct: pctN(d.n_cine_nunca_curso_primera_infancia, totCine) },
                            { nivel: 'Primaria',            pct: pctN(d.n_cine_primaria, totCine) },
                            { nivel: 'Secundaria',          pct: pctN(d.n_cine_secundaria, totCine) },
                            { nivel: 'Terciaria/Posgrado',  pct: pctN(d.n_cine_terciaria_maestria_doctorado, totCine) },
                            { nivel: 'Ed. especial',        pct: pctN(d.n_cine_especial_diferencial, totCine) },
                          ]}
                          layout="vertical" margin={{ left: 8, right: 44 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9 }} tickFormatter={v => (v as number).toFixed(0) + '%'} />
                          <YAxis type="category" dataKey="nivel" tick={{ fontSize: 10 }} width={128} />
                          <Tooltip formatter={(v: unknown) => [(v as number).toFixed(1) + '%', '% del total CINE']} />
                          <Bar dataKey="pct" radius={[0, 3, 3, 0]}>
                            {EDU_C.map((c, i) => <Cell key={i} fill={c} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm p-4">
                      <h4 className="text-xs font-bold text-gray-700 mb-3">Nivel educacional alcanzado</h4>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart
                          data={[
                            { nivel: 'Sin escolaridad',          pct: pctN(d.n_cine_nunca_curso_primera_infancia, totCine) },
                            { nivel: 'Primaria',                  pct: pctN(d.n_cine_primaria, totCine) },
                            { nivel: 'Secundaria',                pct: pctN(d.n_cine_secundaria, totCine) },
                            { nivel: 'Terciaria/Posgrado',        pct: pctN(d.n_cine_terciaria_maestria_doctorado, totCine) },
                            { nivel: 'Parvularia (asist. actual)', pct: pctN(d.n_asistencia_parv, d.n_per) },
                            { nivel: 'Analfabetismo (ref.)',      pct: pctN(d.n_analfabet, d.n_per) },
                          ]}
                          layout="vertical" margin={{ left: 8, right: 44 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9 }} tickFormatter={v => (v as number).toFixed(0) + '%'} />
                          <YAxis type="category" dataKey="nivel" tick={{ fontSize: 10 }} width={152} />
                          <Tooltip formatter={(v: unknown) => [(v as number).toFixed(1) + '%', '%']} />
                          <Bar dataKey="pct" radius={[0, 3, 3, 0]}>
                            {EDU_C2.map((c, i) => <Cell key={i} fill={c} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  {byCode && (
                    <div className="bg-white rounded-xl shadow-sm p-4">
                      <h4 className="text-xs font-bold text-gray-700 mb-3">Comparación regional — Educación</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-800 text-white">
                              <th className="px-3 py-2 text-left font-medium">Región</th>
                              <th className="px-3 py-2 text-right font-medium">Prom. escolaridad</th>
                              <th className="px-3 py-2 text-right font-medium">% Sin escolaridad</th>
                              <th className="px-3 py-2 text-right font-medium">% Analfabetismo</th>
                              <th className="px-3 py-2 text-right font-medium">% Parvularia (asist.)</th>
                              <th className="px-3 py-2 text-right font-medium">% Primaria</th>
                              <th className="px-3 py-2 text-right font-medium">% Secundaria</th>
                              <th className="px-3 py-2 text-right font-medium">% Terciaria</th>
                            </tr>
                          </thead>
                          <tbody>
                            {allR.map((r, i) => {
                              const tc = r.n_cine_nunca_curso_primera_infancia + r.n_cine_primaria + r.n_cine_secundaria + r.n_cine_terciaria_maestria_doctorado + r.n_cine_especial_diferencial
                              const isActive = !isNac && r.cod === d.cod
                              return (
                                <tr key={r.cod} className={`border-b border-gray-100 ${isActive ? 'bg-blue-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                  <td className="px-3 py-1.5 font-medium text-gray-900">{r.nombre}</td>
                                  <td className="px-3 py-1.5 text-right text-gray-900">{r.prom_escolaridad18.toFixed(1)}</td>
                                  <td className={`px-3 py-1.5 text-right font-semibold ${pctN(r.n_cine_nunca_curso_primera_infancia, tc) > 10 ? 'text-red-600' : 'text-green-600'}`}>{pctOf(r.n_cine_nunca_curso_primera_infancia, tc)}</td>
                                  <td className={`px-3 py-1.5 text-right font-semibold ${pctN(r.n_analfabet, r.n_per) > 1 ? 'text-red-600' : 'text-green-600'}`}>{pctOf(r.n_analfabet, r.n_per)}</td>
                                  <td className="px-3 py-1.5 text-right text-blue-600">{pctOf(r.n_asistencia_parv, r.n_per)}</td>
                                  <td className="px-3 py-1.5 text-right text-gray-900">{pctOf(r.n_cine_primaria, tc)}</td>
                                  <td className="px-3 py-1.5 text-right text-gray-900">{pctOf(r.n_cine_secundaria, tc)}</td>
                                  <td className="px-3 py-1.5 text-right text-blue-600 font-semibold">{pctOf(r.n_cine_terciaria_maestria_doctorado, tc)}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )
            })()}

            {/* ── CONECTIVIDAD ── */}
            {activeTab === 'conectividad' && (() => {
              const GR = '#16a34a'
              const CONECT_OPT = [
                { value: 'internet',       label: 'Acceso a internet (cualquier tipo)',  fn: (r: CensoRegionData) => pctN(r.n_internet, r.n_hog) },
                { value: 'tel_movil',      label: 'Teléfono móvil',                      fn: (r: CensoRegionData) => pctN(r.n_serv_tel_movil, r.n_hog) },
                { value: 'internet_fija',  label: 'Internet fija',                        fn: (r: CensoRegionData) => pctN(r.n_serv_internet_fija, r.n_hog) },
                { value: 'internet_movil', label: 'Internet móvil',                       fn: (r: CensoRegionData) => pctN(r.n_serv_internet_movil, r.n_hog) },
                { value: 'compu',          label: 'Computador',                           fn: (r: CensoRegionData) => pctN(r.n_serv_compu, r.n_hog) },
                { value: 'tablet',         label: 'Tablet',                               fn: (r: CensoRegionData) => pctN(r.n_serv_tablet, r.n_hog) },
              ]
              const selOpt   = CONECT_OPT.find(o => o.value === conectVar) ?? CONECT_OPT[0]
              const conectRows = [...allR].sort((a, b) => selOpt.fn(b) - selOpt.fn(a)).map(r => ({
                region: r.nombre.length > 12 ? r.nombre.split(' ')[0] : r.nombre,
                con: parseFloat(selOpt.fn(r).toFixed(1)),
                sin: parseFloat((100 - selOpt.fn(r)).toFixed(1)),
              }))
              return (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <KpiCard label="Acceso a internet" value={pctOf(d.n_internet, d.n_hog)}              sub={fmtN(d.n_internet) + ' hogares'}        color={GR} />
                    <KpiCard label="Teléfono móvil"    value={pctOf(d.n_serv_tel_movil, d.n_hog)}        sub={fmtN(d.n_serv_tel_movil) + ' hogares'}   color={GR} />
                    <KpiCard label="Agua red pública"  value={pctOf(d.n_fuente_agua_publica, d.n_vp_ocupada)} sub={fmtN(d.n_fuente_agua_publica) + ' viviendas'} color={GR} />
                    <KpiCard label="Alcantarillado"    value={pctOf(d.n_serv_hig_alc_dentro, d.n_vp_ocupada)} sub="Dentro de la vivienda"              color={GR} />
                    <KpiCard label="Electricidad red"  value={pctOf(d.n_fuente_elect_publica, d.n_vp_ocupada)} sub={fmtN(d.n_fuente_elect_publica) + ' viviendas'} color={GR} />
                    <KpiCard label="Retiro basura"     value={pctOf(d.n_basura_servicios, d.n_vp_ocupada)} sub="Serv. municipal/empresa"               color={GR} />
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <div className="bg-white rounded-xl shadow-sm p-4">
                      <h4 className="text-xs font-bold text-gray-700 mb-3">Acceso a servicios básicos (% viviendas)</h4>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart
                          data={[
                            { serv: 'Agua red pública',     pct: pctN(d.n_fuente_agua_publica, d.n_vp_ocupada) },
                            { serv: 'Alcantarillado dentro', pct: pctN(d.n_serv_hig_alc_dentro, d.n_vp_ocupada) },
                            { serv: 'Electricidad red',     pct: pctN(d.n_fuente_elect_publica, d.n_vp_ocupada) },
                            { serv: 'Retiro de basura',     pct: pctN(d.n_basura_servicios, d.n_vp_ocupada) },
                          ]}
                          layout="vertical" margin={{ left: 8, right: 40 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9 }} tickFormatter={v => v + '%'} />
                          <YAxis type="category" dataKey="serv" tick={{ fontSize: 10 }} width={140} />
                          <Tooltip formatter={(v: unknown) => [(v as number).toFixed(1) + '%', '% viviendas']} />
                          <Bar dataKey="pct" radius={[0, 3, 3, 0]}>
                            {['#3b82f6','#22c55e','#f97316','#8b5cf6'].map((c, i) => <Cell key={i} fill={c} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm p-4">
                      <h4 className="text-xs font-bold text-gray-700 mb-1">Conectividad digital — comparación regional</h4>
                      <div className="mb-2">
                        <select value={conectVar} onChange={e => setConectVar(e.target.value)} className={`${selectCls} w-full`}>
                          {CONECT_OPT.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={conectRows} margin={{ top: 4, right: 4, bottom: 36, left: -22 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="region" tick={{ fontSize: 7 }} angle={-45} textAnchor="end" interval={0} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 8 }} tickFormatter={v => v + '%'} />
                          <Tooltip formatter={(v: unknown, name: unknown) => [(v as number).toFixed(1) + '%', name === 'con' ? 'Con acceso' : 'Sin acceso']} />
                          <Legend formatter={v => v === 'con' ? 'Con acceso' : 'Sin acceso'} iconSize={8} wrapperStyle={{ fontSize: 9 }} />
                          <Bar dataKey="con" stackId="a" fill="#1e3a8a" name="con" />
                          <Bar dataKey="sin" stackId="a" fill="#fca5a5" name="sin" radius={[2, 2, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <div className="bg-white rounded-xl shadow-sm p-4">
                      <h4 className="text-xs font-bold text-gray-700 mb-3">Combustible cocina (% hogares)</h4>
                      <ResponsiveContainer width="100%" height={170}>
                        <BarChart
                          data={[
                            { tipo: 'Gas',          pct: pctN(d.n_comb_cocina_gas, d.n_hog) },
                            { tipo: 'Leña',         pct: pctN(d.n_comb_cocina_lena, d.n_hog) },
                            { tipo: 'Electricidad', pct: pctN(d.n_comb_cocina_electricidad, d.n_hog) },
                            { tipo: 'No utiliza',   pct: pctN(d.n_comb_cocina_no_utiliza, d.n_hog) },
                          ]}
                          layout="vertical" margin={{ left: 8, right: 44 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9 }} tickFormatter={v => v + '%'} />
                          <YAxis type="category" dataKey="tipo" tick={{ fontSize: 11 }} width={80} />
                          <Tooltip formatter={(v: unknown) => [(v as number).toFixed(1) + '%', '% hogares']} />
                          <Bar dataKey="pct" radius={[0, 3, 3, 0]}>
                            {['#f97316','#92400e','#3b82f6','#9ca3af'].map((c, i) => <Cell key={i} fill={c} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm p-4">
                      <h4 className="text-xs font-bold text-gray-700 mb-3">Combustible calefacción (% hogares)</h4>
                      <ResponsiveContainer width="100%" height={170}>
                        <BarChart
                          data={[
                            { tipo: 'Gas',          pct: pctN(d.n_comb_calefaccion_gas, d.n_hog) },
                            { tipo: 'Leña',         pct: pctN(d.n_comb_calefaccion_lena, d.n_hog) },
                            { tipo: 'Electricidad', pct: pctN(d.n_comb_calefaccion_electricidad, d.n_hog) },
                            { tipo: 'No utiliza',   pct: pctN(d.n_comb_calefaccion_no_utiliza, d.n_hog) },
                          ]}
                          layout="vertical" margin={{ left: 8, right: 44 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9 }} tickFormatter={v => v + '%'} />
                          <YAxis type="category" dataKey="tipo" tick={{ fontSize: 11 }} width={80} />
                          <Tooltip formatter={(v: unknown) => [(v as number).toFixed(1) + '%', '% hogares']} />
                          <Bar dataKey="pct" radius={[0, 3, 3, 0]}>
                            {['#f97316','#92400e','#3b82f6','#9ca3af'].map((c, i) => <Cell key={i} fill={c} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  {byCode && (
                    <div className="bg-white rounded-xl shadow-sm p-4">
                      <h4 className="text-xs font-bold text-gray-700 mb-3">Comparación regional — Servicios básicos</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-800 text-white">
                              <th className="px-3 py-2 text-left font-medium">Región</th>
                              <th className="px-3 py-2 text-right font-medium">% Internet</th>
                              <th className="px-3 py-2 text-right font-medium">% Agua pública</th>
                              <th className="px-3 py-2 text-right font-medium">% Alcantarillado</th>
                              <th className="px-3 py-2 text-right font-medium">% Electricidad</th>
                              <th className="px-3 py-2 text-right font-medium">% Retiro basura</th>
                              <th className="px-3 py-2 text-right font-medium">% Sin saneamiento</th>
                            </tr>
                          </thead>
                          <tbody>
                            {allR.map((r, i) => {
                              const isActive = !isNac && r.cod === d.cod
                              return (
                                <tr key={r.cod} className={`border-b border-gray-100 ${isActive ? 'bg-blue-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                  <td className="px-3 py-1.5 font-medium text-gray-900">{r.nombre}</td>
                                  <td className="px-3 py-1.5 text-right text-blue-600 font-semibold">{pctOf(r.n_internet, r.n_hog)}</td>
                                  <td className="px-3 py-1.5 text-right text-gray-900">{pctOf(r.n_fuente_agua_publica, r.n_vp_ocupada)}</td>
                                  <td className="px-3 py-1.5 text-right text-gray-900">{pctOf(r.n_serv_hig_alc_dentro, r.n_vp_ocupada)}</td>
                                  <td className="px-3 py-1.5 text-right text-gray-900">{pctOf(r.n_fuente_elect_publica, r.n_vp_ocupada)}</td>
                                  <td className="px-3 py-1.5 text-right text-gray-900">{pctOf(r.n_basura_servicios, r.n_vp_ocupada)}</td>
                                  <td className={`px-3 py-1.5 text-right font-semibold ${pctN(r.n_serv_hig_no_tiene, r.n_vp_ocupada) > 0.5 ? 'text-red-600' : 'text-green-600'}`}>{pctOf(r.n_serv_hig_no_tiene, r.n_vp_ocupada)}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )
            })()}
          </>
        )}
      </Contenido>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// EMPLEO
// ══════════════════════════════════════════════════════════════
const EMP_TABS: { id: EmpTab; label: string }[] = [
  { id: 'resumen',   label: 'Resumen' },
  { id: 'evolucion', label: 'Evolución' },
  { id: 'ranking',   label: 'Ranking' },
]
const EMP_IND_LABELS: Record<EmpInd, string> = {
  tasa:        'Tasa de desocupación (%)',
  tasa_tm:     'Tasa desocup. trimestre móvil (%)',
  ocupados:    'Ocupados (miles)',
  ft:          'Fuerza de trabajo (miles)',
  desocupados: 'Desocupados (miles)',
}

function EmpleoModule() {
  const [activeTab, setActiveTab]             = useState<EmpTab>('resumen')
  const [empInd, setEmpInd]                   = useState<EmpInd>('tasa')
  const [empPeriodo, setEmpPeriodo]           = useState('')
  const [selectedRegions, setSelectedRegions] = useState<string[]>(['__NACIONAL__'])
  const [empInd1, setEmpInd1]                 = useState<'tasa' | 'tasa_tm'>('tasa')
  const [desdeAnio, setDesdeAnio]             = useState('')
  const [hastaAnio, setHastaAnio]             = useState('')

  const { periodos, datos: empDatos, loading: todasL } = useMetricasEmpleoTodas()

  const ultPer      = periodos[periodos.length - 1] ?? ''
  const effPeriodo  = empPeriodo || ultPer
  const perIdx      = periodos.indexOf(effPeriodo)
  const isRate      = empInd === 'tasa' || empInd === 'tasa_tm'

  // Nacional ponderado — directo del hook (fórmula INE correcta)
  const nac       = empDatos['__NACIONAL__']
  const nacTasa   = nac?.tasa[perIdx]        ?? null
  const nacTasaTm = nac?.tasa_tm[perIdx]     ?? null
  const nacOcup   = nac?.ocupados[perIdx]    ?? null
  const nacDesoc  = nac?.desocupados[perIdx] ?? null
  const nacFT     = nac?.ft[perIdx]          ?? null

  // Datos por región para período seleccionado
  const resumenRegiones = useMemo((): RegResumen[] => {
    if (perIdx < 0) return []
    return REGIONS.map(r => {
      const d = empDatos[r.nombre]
      if (!d) return null
      const row: RegResumen = {
        nombre:      r.nombre,
        tasa:        d.tasa[perIdx],
        tasa_tm:     d.tasa_tm[perIdx],
        ocupados:    d.ocupados[perIdx],
        ft:          d.ft[perIdx],
        desocupados: d.desocupados[perIdx],
      }
      return row.tasa != null ? row : null
    }).filter((r): r is RegResumen => r != null)
  }, [empDatos, perIdx])

  const resumenSorted = useMemo(
    () => [...resumenRegiones].sort((a, b) => (b[empInd] ?? 0) - (a[empInd] ?? 0)),
    [resumenRegiones, empInd]
  )

  // Variación mensual y anual (pp) para ranking
  function varMensual(reg: string): number | null {
    const d = empDatos[reg]; if (!d || perIdx < 1) return null
    const t1 = d.tasa[perIdx], t0 = d.tasa[perIdx - 1]
    return t1 != null && t0 != null ? parseFloat((t1 - t0).toFixed(2)) : null
  }
  function varAnual(reg: string): number | null {
    const d = empDatos[reg]; if (!d || perIdx < 12) return null
    const t1 = d.tasa[perIdx], t0 = d.tasa[perIdx - 12]
    return t1 != null && t0 != null ? parseFloat((t1 - t0).toFixed(2)) : null
  }

  // Año selectors
  const anios         = useMemo(() => [...new Set(periodos.map(empYear))].sort(), [periodos])
  const efectivoDe    = desdeAnio || anios[Math.max(0, anios.length - 5)]
  const efectivoHasta = hastaAnio || anios[anios.length - 1]

  // Períodos filtrados para evolución
  const periodosFiltEvo = useMemo(() =>
    periodos.filter(p => { const y = empYear(p); return y >= efectivoDe && y <= efectivoHasta }),
    [periodos, efectivoDe, efectivoHasta]
  )

  // Chart data para evolución multi-región
  const evoData = useMemo(() =>
    periodosFiltEvo.map(p => {
      const pi = periodos.indexOf(p)
      const row: Record<string, unknown> = { label: fmtEmpPer(p) }
      for (const reg of selectedRegions) {
        const d = empDatos[reg]
        row[reg] = d && pi >= 0 ? d[empInd1][pi] : null
      }
      return row
    }),
    [periodosFiltEvo, periodos, empDatos, selectedRegions, empInd1]
  )

  function toggleRegion(reg: string) {
    setSelectedRegions(prev =>
      prev.includes(reg) ? prev.filter(r => r !== reg) : [...prev, reg]
    )
  }

  const PeriodoSelector = () => (
    <FiltroField label="Período">
      <select value={effPeriodo} onChange={e => setEmpPeriodo(e.target.value)} className={`${selectCls} min-w-[140px]`}>
        {[...periodos].reverse().map(p => <option key={p} value={p}>{fmtEmpPer(p)}</option>)}
      </select>
    </FiltroField>
  )

  return (
    <div>
      <SubTabs tabs={EMP_TABS} active={activeTab} onSelect={setActiveTab} color="#059669" />
      <Contenido>

        {/* ── Resumen ── */}
        {activeTab === 'resumen' && (todasL ? <Spinner /> : (
          <>
            <Filtros>
              <PeriodoSelector />
              <FiltroField label="Indicador">
                <select value={empInd} onChange={e => setEmpInd(e.target.value as EmpInd)} className={`${selectCls} min-w-[260px]`}>
                  {(Object.entries(EMP_IND_LABELS) as [EmpInd, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </FiltroField>
            </Filtros>

            {/* KPIs nacionales ponderados (INE) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: '🇨🇱 Tasa nac. desocupación', value: fmtN(nacTasa, 2) + '%',  sub: 'Ponderada: desoc/FT (INE)', color: '#fbbf24' },
                { label: '🇨🇱 Tasa trim. móvil nac.',  value: fmtN(nacTasaTm, 2) + '%', sub: 'Σ desoc 3m / Σ FT 3m (INE)',  color: '#f97316' },
                { label: '🇨🇱 Ocupados (miles)',         value: fmtN(nacOcup),            sub: 'Suma nacional',               color: '#38bdf8' },
                { label: '🇨🇱 Desocupados (miles)',      value: fmtN(nacDesoc),           sub: fmtEmpPer(effPeriodo),         color: '#f87171' },
              ].map(k => (
                <div key={k.label} className="bg-slate-800 text-white rounded-xl p-4 shadow-sm" style={{ borderLeftWidth: 4, borderLeftColor: k.color }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70 mb-1">{k.label}</p>
                  <p className="text-xl font-bold leading-none">{k.value}</p>
                  <p className="text-[10px] opacity-50 mt-1">{k.sub}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Mayor desocupación" value={fmtN(resumenSorted[0]?.[empInd], isRate ? 1 : 0) + (isRate ? '%' : '')} sub={resumenSorted[0]?.nombre} color="#dc2626" />
              <KpiCard label="Menor desocupación" value={fmtN(resumenSorted[resumenSorted.length-1]?.[empInd], isRate ? 1 : 0) + (isRate ? '%' : '')} sub={resumenSorted[resumenSorted.length-1]?.nombre} color="#16a34a" />
              <KpiCard label="Fuerza de trabajo (miles)" value={fmtN(nacFT)} sub="Suma nacional" color="#34d399" />
              <KpiCard label="Regiones con datos" value={String(resumenRegiones.length)} color="#6366f1" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="bg-white rounded-xl shadow-sm p-4">
                <h3 className="text-xs font-bold text-gray-700 mb-3">{EMP_IND_LABELS[empInd]} — {fmtEmpPer(effPeriodo)}</h3>
                <ResponsiveContainer width="100%" height={360}>
                  <BarChart data={resumenSorted} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => isRate ? `${v}%` : String(Math.round(v))} />
                    <YAxis type="category" dataKey="nombre" tick={{ fontSize: 9 }} width={130} />
                    <Tooltip formatter={v => [isRate ? fmtN(v as number, 1) + '%' : fmtN(v as number), EMP_IND_LABELS[empInd]]} />
                    {isRate && nacTasa != null && (
                      <ReferenceLine x={nacTasaTm ?? nacTasa} stroke={EMP_NAC_COLOR} strokeWidth={2} strokeDasharray="5 3"
                        label={{ value: `Nac. ${fmtN(nacTasaTm ?? nacTasa, 1)}%`, fill: '#d97706', fontSize: 9, position: 'insideTopRight' }} />
                    )}
                    <Bar dataKey={empInd} radius={[0, 3, 3, 0]}>
                      {resumenSorted.map(r => (
                        <Cell key={r.nombre}
                          fill={isRate && nacTasa != null && r.tasa != null
                            ? (r.tasa > nacTasa ? 'rgba(220,38,38,.8)' : r.tasa > 6 ? 'rgba(217,119,6,.8)' : 'rgba(22,163,74,.8)')
                            : 'rgba(37,99,235,.75)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4">
                <h3 className="text-xs font-bold text-gray-700 mb-3">Desocupados totales por región — {fmtEmpPer(effPeriodo)}</h3>
                <ResponsiveContainer width="100%" height={360}>
                  <BarChart data={[...resumenSorted].sort((a, b) => (b.desocupados ?? 0) - (a.desocupados ?? 0))} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="nombre" tick={{ fontSize: 9 }} width={130} />
                    <Tooltip formatter={v => [fmtN(v as number), 'Desocupados (miles)']} />
                    <Bar dataKey="desocupados" fill="rgba(239,68,68,.75)" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Tabla resumen */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-800 text-white">
                      <th className="px-4 py-2.5 text-left font-medium">Región</th>
                      <th className="px-4 py-2.5 text-right font-medium">Tasa desoc. %</th>
                      <th className="px-4 py-2.5 text-right font-medium">Tasa trim. móvil %</th>
                      <th className="px-4 py-2.5 text-right font-medium">Ocupados (miles)</th>
                      <th className="px-4 py-2.5 text-right font-medium">Desocupados (miles)</th>
                      <th className="px-4 py-2.5 text-right font-medium">Fuerza de trabajo*</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-blue-50 font-bold border-l-4 border-blue-700">
                      <td className="px-4 py-2 text-blue-800">🇨🇱 Nacional (ponderado INE)</td>
                      <td className="px-4 py-2 text-right text-blue-800">{fmtN(nacTasa, 2)}%</td>
                      <td className="px-4 py-2 text-right text-blue-800">{fmtN(nacTasaTm, 2)}%</td>
                      <td className="px-4 py-2 text-right text-blue-800">{fmtN(nacOcup)}</td>
                      <td className="px-4 py-2 text-right text-red-700 font-bold">{fmtN(nacDesoc)}</td>
                      <td className="px-4 py-2 text-right text-blue-800">{fmtN(nacFT)}</td>
                    </tr>
                    {resumenSorted.map((r, i) => {
                      const sobreProm = nacTasa != null && r.tasa != null && r.tasa > nacTasa
                      return (
                        <tr key={r.nombre} className={sobreProm ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-4 py-2 font-medium text-gray-700">{r.nombre}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-semibold" style={{ color: sobreProm ? '#dc2626' : '#16a34a' }}>
                            {fmtN(r.tasa, 1)}%
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">{r.tasa_tm != null ? fmtN(r.tasa_tm, 1) + '%' : '—'}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{fmtN(r.ocupados)}</td>
                          <td className="px-4 py-2 text-right tabular-nums" style={{ color: sobreProm ? '#dc2626' : undefined }}>{fmtN(r.desocupados)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{fmtN(r.ft)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="px-5 py-1.5 text-[10px] text-gray-400 italic">* FT = Ocupados / (1 − Tasa/100). Tasa trim. móvil = Σ desoc[t−2..t] / Σ FT[t−2..t] × 100 (método INE).</p>
            </div>
          </>
        ))}

        {/* ── Evolución multi-región ── */}
        {activeTab === 'evolucion' && (todasL ? <Spinner /> : (
          <>
            <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap gap-6 items-start">
              {/* Checkboxes regiones */}
              <FiltroField label="Regiones">
                <div className="border border-gray-300 rounded-lg p-2 max-h-48 overflow-y-auto bg-white min-w-[220px]">
                  <label className="flex items-center gap-2 cursor-pointer py-0.5">
                    <input type="checkbox" checked={selectedRegions.includes('__NACIONAL__')}
                      onChange={() => toggleRegion('__NACIONAL__')} className="w-3 h-3" />
                    <span className="text-xs font-semibold" style={{ color: EMP_NAC_COLOR }}>🇨🇱 Nacional</span>
                  </label>
                  {REGIONS.map(r => (
                    <label key={r.cod} className="flex items-center gap-2 cursor-pointer py-0.5">
                      <input type="checkbox" checked={selectedRegions.includes(r.nombre)}
                        onChange={() => toggleRegion(r.nombre)} className="w-3 h-3" />
                      <span className="text-xs" style={{ color: EMP_REG_COLOR[r.nombre] }}>{r.nombre}</span>
                    </label>
                  ))}
                </div>
              </FiltroField>

              {/* Indicador */}
              <FiltroField label="Indicador">
                <select value={empInd1} onChange={e => setEmpInd1(e.target.value as 'tasa' | 'tasa_tm')} className={`${selectCls} min-w-[260px]`}>
                  <option value="tasa">Tasa de desocupación (%)</option>
                  <option value="tasa_tm">Tasa trimestre móvil (%)</option>
                </select>
              </FiltroField>

              {/* Año filtros */}
              <FiltroField label="Año desde">
                <select value={desdeAnio || efectivoDe} onChange={e => setDesdeAnio(e.target.value)} className={`${selectCls} min-w-[90px]`}>
                  {anios.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </FiltroField>
              <FiltroField label="Año hasta">
                <select value={hastaAnio || efectivoHasta} onChange={e => setHastaAnio(e.target.value)} className={`${selectCls} min-w-[90px]`}>
                  {anios.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </FiltroField>
            </div>

            {selectedRegions.length === 0
              ? <p className="text-xs text-gray-400 text-center py-8">Selecciona al menos una región o Nacional</p>
              : (() => {
                // KPIs para primera región seleccionada
                const firstReg = selectedRegions[0]
                const dFirst = empDatos[firstReg]
                const firstLabel = firstReg === '__NACIONAL__' ? '🇨🇱 Nacional' : firstReg
                const firstPeriodosFilts = dFirst
                  ? periodosFiltEvo.filter(p => {
                      const pi = periodos.indexOf(p)
                      return pi >= 0 && dFirst[empInd1][pi] != null
                    })
                  : []
                const firstVals = firstPeriodosFilts.map(p => {
                  const pi = periodos.indexOf(p)
                  return dFirst ? dFirst[empInd1][pi] : null
                }).filter((v): v is number => v != null)
                const ultVal = firstVals[firstVals.length - 1] ?? null
                const promVal = firstVals.length ? firstVals.reduce((a, b) => a + b, 0) / firstVals.length : null
                const maxVal = firstVals.length ? Math.max(...firstVals) : null
                const minVal = firstVals.length ? Math.min(...firstVals) : null
                const ultPeriodoLabel = firstPeriodosFilts.length ? fmtEmpPer(firstPeriodosFilts[firstPeriodosFilts.length - 1]) : ''

                // Data multi-región para cada indicador
                const makeEvoSerie = (ind: 'tasa' | 'tasa_tm' | 'ocupados' | 'ft' | 'desocupados') =>
                  periodosFiltEvo.map(p => {
                    const pi = periodos.indexOf(p)
                    const row: Record<string, unknown> = { label: fmtEmpPer(p) }
                    for (const reg of selectedRegions) {
                      const d = empDatos[reg]
                      row[reg] = d && pi >= 0 ? d[ind][pi] : null
                    }
                    return row
                  })

                const evoCurvas = (ind: 'tasa' | 'tasa_tm' | 'ocupados' | 'ft' | 'desocupados', isRateChart: boolean) => (
                  <LineChart data={makeEvoSerie(ind)}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={55}
                      interval={Math.max(0, Math.floor(periodosFiltEvo.length / 24))} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => isRateChart ? v + '%' : String(Math.round(v))} />
                    <Tooltip formatter={(v, name) => [
                      isRateChart ? fmtN(v as number, 2) + '%' : fmtN(v as number),
                      name === '__NACIONAL__' ? '🇨🇱 Nacional' : name
                    ]} />
                    {selectedRegions.length > 1 && <Legend formatter={v => v === '__NACIONAL__' ? '🇨🇱 Nacional' : v} />}
                    {selectedRegions.map(reg => (
                      <Line key={reg} type="monotone" dataKey={reg}
                        stroke={reg === '__NACIONAL__' ? EMP_NAC_COLOR : (EMP_REG_COLOR[reg] ?? '#888')}
                        strokeDasharray={reg === '__NACIONAL__' ? '6 3' : undefined}
                        strokeWidth={reg === '__NACIONAL__' ? 2.5 : 1.5}
                        dot={false}
                        name={reg === '__NACIONAL__' ? '🇨🇱 Nacional' : reg}
                        connectNulls />
                    ))}
                  </LineChart>
                )

                return (
                  <>
                    {/* KPIs primera región */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <KpiCard label={`Tasa actual — ${firstLabel}`}
                        value={fmtN(ultVal, 2) + '%'} sub={ultPeriodoLabel}
                        color={ultVal != null ? (ultVal > 8 ? '#dc2626' : ultVal > 6 ? '#d97706' : '#16a34a') : '#6366f1'} />
                      <KpiCard label="Promedio período" value={fmtN(promVal, 2) + '%'} sub={`${efectivoDe}–${efectivoHasta}`} color="#6366f1" />
                      <KpiCard label="Máx. desocupación" value={fmtN(maxVal, 2) + '%'} color="#dc2626" />
                      <KpiCard label="Mín. desocupación" value={fmtN(minVal, 2) + '%'} color="#16a34a" />
                    </div>

                    {periodosFiltEvo.length === 0
                      ? <p className="text-xs text-gray-400 text-center py-8">Sin datos</p>
                      : (
                        <>
                          {/* Gráfico tasa */}
                          <div className="bg-white rounded-xl shadow-sm p-4">
                            <h3 className="text-xs font-bold text-gray-700 mb-3">
                              {selectedRegions.length > 1 ? 'Comparativa' : firstLabel} — {empInd1 === 'tasa' ? 'Tasa de desocupación (%)' : 'Tasa trimestre móvil (%)'}
                            </h3>
                            <ResponsiveContainer width="100%" height={300}>{evoCurvas(empInd1, true)}</ResponsiveContainer>
                          </div>

                          {/* Gráficos ocupados / ft / desocupados */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                            <div className="bg-white rounded-xl shadow-sm p-4">
                              <h3 className="text-xs font-bold text-gray-700 mb-3">Ocupados (miles)</h3>
                              <ResponsiveContainer width="100%" height={220}>{evoCurvas('ocupados', false)}</ResponsiveContainer>
                            </div>
                            <div className="bg-white rounded-xl shadow-sm p-4">
                              <h3 className="text-xs font-bold text-gray-700 mb-3">Fuerza de trabajo* (miles)</h3>
                              <ResponsiveContainer width="100%" height={220}>{evoCurvas('ft', false)}</ResponsiveContainer>
                            </div>
                            <div className="bg-white rounded-xl shadow-sm p-4">
                              <h3 className="text-xs font-bold text-gray-700 mb-3">Desocupados (miles)</h3>
                              <ResponsiveContainer width="100%" height={220}>{evoCurvas('desocupados', false)}</ResponsiveContainer>
                            </div>
                          </div>
                        </>
                      )
                    }
                  </>
                )
              })()
            }
          </>
        ))}

        {/* ── Ranking ── */}
        {activeTab === 'ranking' && (todasL ? <Spinner /> : (
          <>
            <Filtros>
              <PeriodoSelector />
            </Filtros>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="bg-white rounded-xl shadow-sm p-4">
                <h4 className="text-xs font-bold text-red-700 mb-3">Mayor desocupación — Top 5</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={resumenSorted.slice(0, 5)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                    <YAxis type="category" dataKey="nombre" tick={{ fontSize: 9 }} width={120} />
                    <Tooltip formatter={v => [fmtN(v as number, 1) + '%', 'Tasa']} />
                    {nacTasa != null && <ReferenceLine x={nacTasa} stroke={EMP_NAC_COLOR} strokeWidth={2} strokeDasharray="5 3" />}
                    <Bar dataKey="tasa" fill="rgba(220,38,38,.8)" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4">
                <h4 className="text-xs font-bold text-green-700 mb-3">Menor desocupación — Top 5</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={[...resumenSorted].reverse().slice(0, 5)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                    <YAxis type="category" dataKey="nombre" tick={{ fontSize: 9 }} width={120} />
                    <Tooltip formatter={v => [fmtN(v as number, 1) + '%', 'Tasa']} />
                    {nacTasa != null && <ReferenceLine x={nacTasa} stroke={EMP_NAC_COLOR} strokeWidth={2} strokeDasharray="5 3" />}
                    <Bar dataKey="tasa" fill="rgba(22,163,74,.8)" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4">
                <h4 className="text-xs font-bold text-gray-700 mb-3">Mayor cantidad desocupados — Top 5</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={[...resumenSorted].sort((a, b) => (b.desocupados ?? 0) - (a.desocupados ?? 0)).slice(0, 5)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="nombre" tick={{ fontSize: 9 }} width={120} />
                    <Tooltip formatter={v => [fmtN(v as number), 'Desocupados (miles)']} />
                    <Bar dataKey="desocupados" fill="rgba(239,68,68,.75)" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Tabla ranking completo */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-800">Ranking completo — {fmtEmpPer(effPeriodo)}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-800 text-white">
                      <th className="px-3 py-2.5 text-left font-medium">#</th>
                      <th className="px-3 py-2.5 text-left font-medium">Región</th>
                      <th className="px-3 py-2.5 text-right font-medium">Tasa %</th>
                      <th className="px-3 py-2.5 text-right font-medium">Trim. móvil %</th>
                      <th className="px-3 py-2.5 text-right font-medium">Var. mensual (pp)</th>
                      <th className="px-3 py-2.5 text-right font-medium">Var. anual (pp)</th>
                      <th className="px-3 py-2.5 text-right font-medium">Desocupados</th>
                      <th className="px-3 py-2.5 text-right font-medium">Ocupados</th>
                      <th className="px-3 py-2.5 text-right font-medium">FT*</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Fila nacional */}
                    <tr className="bg-blue-50 font-bold border-l-4 border-blue-700">
                      <td className="px-3 py-2 text-blue-800">—</td>
                      <td className="px-3 py-2 text-blue-800">🇨🇱 Nacional (pond. INE)</td>
                      <td className="px-3 py-2 text-right text-blue-800">{fmtN(nacTasa, 2)}%</td>
                      <td className="px-3 py-2 text-right text-blue-800">{fmtN(nacTasaTm, 2)}%</td>
                      <td className="px-3 py-2 text-right text-blue-800">
                        {nac && perIdx >= 1 && nac.tasa[perIdx] != null && nac.tasa[perIdx-1] != null
                          ? fmtPp(nac.tasa[perIdx]! - nac.tasa[perIdx-1]!) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-blue-800">
                        {nac && perIdx >= 12 && nac.tasa[perIdx] != null && nac.tasa[perIdx-12] != null
                          ? fmtPp(nac.tasa[perIdx]! - nac.tasa[perIdx-12]!) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-red-700">{fmtN(nacDesoc)}</td>
                      <td className="px-3 py-2 text-right text-blue-800">{fmtN(nacOcup)}</td>
                      <td className="px-3 py-2 text-right text-blue-800">{fmtN(nacFT)}</td>
                    </tr>
                    {resumenSorted.map((r, i) => {
                      const sobreProm = nacTasa != null && r.tasa != null && r.tasa > nacTasa
                      const vm = varMensual(r.nombre)
                      const va = varAnual(r.nombre)
                      return (
                        <tr key={r.nombre} className={sobreProm ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                          <td className="px-3 py-2 font-medium text-gray-700">{r.nombre}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold"
                            style={{ color: sobreProm ? '#dc2626' : '#16a34a' }}>
                            {fmtN(r.tasa, 1)}%
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.tasa_tm != null ? fmtN(r.tasa_tm, 1) + '%' : '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium"
                            style={{ color: vm == null ? '#94a3b8' : vm > 0 ? '#dc2626' : '#16a34a' }}>
                            {fmtPp(vm)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium"
                            style={{ color: va == null ? '#94a3b8' : va > 0 ? '#dc2626' : '#16a34a' }}>
                            {fmtPp(va)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums"
                            style={{ color: sobreProm ? '#dc2626' : undefined }}>{fmtN(r.desocupados)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtN(r.ocupados)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtN(r.ft)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="px-5 py-1.5 text-[10px] text-gray-400 italic">
                * FT = Ocupados / (1 − Tasa/100). Var. mensual/anual en pp (puntos porcentuales).
              </p>
            </div>
          </>
        ))}
      </Contenido>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// CASEN 2024
// ══════════════════════════════════════════════════════════════
const CASEN_TABS: { id: CasenTab; label: string }[] = [
  { id: 'pobreza',  label: 'Pobreza' },
  { id: 'p_severa', label: 'Pobreza severa' },
  { id: 'multi',    label: 'Multidimensional' },
  { id: 'ingresos', label: 'Ingresos' },
  { id: 'salud',    label: 'Salud' },
]

function CasenModule() {
  const [activeTab, setActiveTab] = useState<CasenTab>('pobreza')
  return (
    <div>
      <SubTabs tabs={CASEN_TABS} active={activeTab} onSelect={setActiveTab} color="#e11d48" />
      <Contenido>
        <SinDatos
          titulo="Módulo CASEN 2024 — En construcción"
          mensaje="Los datos de la CASEN 2024 (casen_regiones.json) aún no están cargados en Supabase. Una vez disponibles, este módulo mostrará pobreza, pobreza severa, multidimensional, ingresos y salud por región."
        />
      </Contenido>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default function MetricasView() {
  const [activeModule, setActiveModule] = useState<ModuleId>('resumen')

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-auto">
      <div className="bg-slate-900 px-6 py-3 shrink-0">
        <h1 className="text-sm font-semibold text-white tracking-wide">📊 Dashboard Regional · Chile</h1>
      </div>
      <ModuleNav active={activeModule} onSelect={setActiveModule} />
      <UltimaActualizacionBar />
      <div className="flex-1 overflow-auto">
        {activeModule === 'resumen'   && <ResumenModule />}
        {activeModule === 'seguridad' && <SeguridadModule />}
        {activeModule === 'pib'       && <PibModule />}
        {activeModule === 'censo'     && <CensoModule />}
        {activeModule === 'empleo'    && <EmpleoModule />}
        {activeModule === 'casen'     && <CasenModule />}
      </div>
    </div>
  )
}
