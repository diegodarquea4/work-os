'use client'

/**
 * Sección "Métricas clave" (Desocupación, PIB Regional, Seguridad) — misma
 * fuente de datos que la pestaña Métricas (registros_bce, registros_bce_empleo,
 * registros_leystop/_delitos). Compartida entre Mi Región (VistaRegional) y el
 * preview del Mapa (RegionPreviewPanel) para no duplicar ~150 líneas de hooks
 * y cálculos en ambos lugares.
 */

import { useColegaSeguridadAll } from '@/lib/hooks/useColegaSeguridad'
import { useColegaDelitosAll, DMCS_LISTA } from '@/lib/hooks/useColegaDelitos'
import { useMetricasEmpleoTodas } from '@/lib/hooks/useMetricasEmpleo'
import { useMetricasPibRegion, useMetricasPibNacional, parsePeriodo, PIB_UNIDAD_ENC, PIB_UNIDAD_NOM } from '@/lib/hooks/useMetricasPib'
import { useUltimaActualizacionMetricas, fmtUltimaActualizacion } from '@/lib/hooks/useUltimaActualizacionMetricas'
import { INE_CODE } from '@/lib/regions'
import type { Region } from '@/lib/regions'

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ data, color = '#3B82F6', height = 22 }: { data: number[]; color?: string; height?: number }) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const W = 64
  const pad = 2
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (W - pad * 2)
    const y = pad + ((max - v) / range) * (height - pad * 2)
    return `${x},${y}`
  })
  return (
    <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} className="overflow-visible block ml-auto">
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

// ── MetricCard ────────────────────────────────────────────────────────────────

export function MetricCard({ title, subtitle, value, trend, trendLabel, trendDown, trendSuffix = 'pp', sparkData, sparkColor, comparisonLabel, comparisonDelta, comparisonGood, ranking, compact }: {
  title: string
  subtitle: string    // incluye el período considerado, ej. "BCCh trimestre móvil mayo-2026"
  value: string
  trend: number | null
  trendLabel?: string     // ej. "vs mes anterior" — se agrega en la misma línea que la variación
  trendDown: boolean      // true = going down is good (desocupación, criminalidad)
  trendSuffix?: string
  sparkData?: number[]
  sparkColor?: string
  comparisonLabel?: string    // ej. "Desocupación nacional 9.2%" — siempre gris
  comparisonDelta?: string    // ej. "(-2.3 pp)" — coloreado según comparisonGood
  comparisonGood?: boolean | null
  ranking?: string | null
  /** Modo denso para el preview del Mapa: fuente bajo el título (no se corta), letra más chica. */
  compact?: boolean
}) {
  const trendGood = trend === null ? null : (trendDown ? trend < 0 : trend > 0)
  const trendIcon = trend === null ? null : trend > 0 ? '↑' : trend < 0 ? '↓' : '→'
  const trendCls  = trendGood === null ? '' : trendGood ? 'text-green-600' : 'text-red-600'
  const compCls   = comparisonGood == null ? 'text-gray-500' : comparisonGood ? 'text-green-600' : 'text-red-600'

  const hasSpark = !!sparkData && sparkData.length >= 2
  const smallTextCls = compact ? 'text-[10px]' : 'text-xs'

  return (
    <div className={`bg-slate-50/70 rounded-xl border border-gray-100 shadow-sm flex flex-col h-full ${compact ? 'p-2.5' : 'p-4'}`}>
      {compact ? (
        <div className="mb-1.5">
          <p className="text-[11px] font-semibold text-gray-700 truncate">{title}</p>
          <p className="text-[9px] text-gray-400 truncate">{subtitle}</p>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="text-xs font-semibold text-gray-700 truncate">{title}</p>
          <div className="text-right shrink-0">
            <p className="text-[9px] text-gray-400">{subtitle}</p>
            {hasSpark && (
              <div className="mt-1 w-16">
                <Sparkline data={sparkData!} color={sparkColor} />
              </div>
            )}
          </div>
        </div>
      )}
      <p className={`${compact ? 'text-lg' : 'text-fluid-2xl'} font-bold text-slate-900 leading-tight`}>{value}</p>
      {trend !== null && (
        <p className={`${smallTextCls} mt-1 ${trendCls}`}>
          {trendIcon} {Math.abs(trend).toFixed(1)}{trendSuffix}{trendLabel ? ` ${trendLabel}` : ''}
        </p>
      )}
      {(comparisonLabel || comparisonDelta) && (
        <p className={`${smallTextCls} mt-1 font-medium text-gray-500`}>
          {comparisonLabel}
          {comparisonDelta && <span className={compCls}> {comparisonDelta}</span>}
        </p>
      )}
      {ranking && <p className={`${smallTextCls} mt-1 font-medium text-gray-500`}>{ranking}</p>}
    </div>
  )
}

// ── SeguridadSplitCard ────────────────────────────────────────────────────────
// Tarjeta ancha con dos mitades: delitos generales (LeyStop) a la izquierda y
// DMCS a la derecha, separadas por un borde vertical. Mismo look que MetricCard.

function SeguridadSplitCard({
  subtitle,
  tasaDelitos,
  varDelitosAnual,
  delitosRanking,
  tasaDmcs,
  varDmcs,
  dmcsRanking,
  compact,
}: {
  subtitle: string
  tasaDelitos: number | null
  varDelitosAnual: number | null
  delitosRanking: string | null
  tasaDmcs: number | null
  varDmcs: number | null
  dmcsRanking: string | null
  /** Modo denso para el preview del Mapa: "/100 mil hab." bajo el número, letra más chica. */
  compact?: boolean
}) {
  const varDelitosCls = varDelitosAnual == null ? 'text-gray-400' : varDelitosAnual < 0 ? 'text-green-600' : 'text-red-600'
  const varDelitosIcon = varDelitosAnual == null ? '' : varDelitosAnual > 0 ? '↑' : varDelitosAnual < 0 ? '↓' : '→'
  const varDmcsCls = varDmcs == null ? 'text-gray-400' : varDmcs < 0 ? 'text-green-600' : 'text-red-600'
  const varDmcsIcon = varDmcs == null ? '' : varDmcs > 0 ? '↑' : varDmcs < 0 ? '↓' : '→'
  const smallTextCls = compact ? 'text-[10px]' : 'text-xs'
  const valueCls = compact ? 'text-lg' : 'text-fluid-2xl'

  return (
    <div className={`bg-slate-50/70 rounded-xl border border-gray-100 shadow-sm flex flex-col h-full ${compact ? 'p-2' : 'p-3'}`}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className={`${compact ? 'text-[11px]' : 'text-xs'} font-semibold text-gray-700 truncate`}>Seguridad</p>
        <p className="text-[9px] text-gray-400 text-right shrink-0">{subtitle}</p>
      </div>
      <div className={`grid grid-cols-2 flex-1 ${compact ? 'gap-2' : 'gap-3'}`}>
        {/* Delitos generales */}
        <div className="min-w-0 flex flex-col">
          <p className="text-[9px] font-semibold text-gray-400 tracking-wide mb-1 whitespace-nowrap">Total Delitos</p>
          {compact ? (
            <>
              <p className={`${valueCls} font-bold text-slate-900 leading-tight`}>
                {tasaDelitos != null ? tasaDelitos.toFixed(1) : 'N/D'}
              </p>
              <span className="text-[9px] text-gray-400">/ 100 mil hab.</span>
            </>
          ) : (
            <div className="flex items-baseline gap-1">
              <p className={`${valueCls} font-bold text-slate-900 leading-tight`}>
                {tasaDelitos != null ? tasaDelitos.toFixed(1) : 'N/D'}
              </p>
              <span className="text-[9px] text-gray-400">/ 100 mil hab.</span>
            </div>
          )}
          {varDelitosAnual != null && (
            <p className={`${smallTextCls} mt-1 ${varDelitosCls}`}>
              {varDelitosIcon} {Math.abs(varDelitosAnual).toFixed(1)}% vs año anterior
            </p>
          )}
          {delitosRanking && (
            <p className={`${smallTextCls} mt-1 font-medium text-gray-500`}>{delitosRanking}</p>
          )}
        </div>

        {/* DMCS */}
        <div className={`min-w-0 flex flex-col border-l border-gray-200 ${compact ? 'pl-2' : 'pl-3'}`}>
          <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide mb-1 whitespace-nowrap">
            DMCS<span className="text-[7px] align-super">*</span>
          </p>
          {compact ? (
            <>
              <p className={`${valueCls} font-bold text-slate-900 leading-tight`}>
                {tasaDmcs != null ? tasaDmcs.toFixed(1) : 'N/D'}
              </p>
              <span className="text-[9px] text-gray-400">/ 100 mil hab.</span>
            </>
          ) : (
            <div className="flex items-baseline gap-1">
              <p className={`${valueCls} font-bold text-slate-900 leading-tight`}>
                {tasaDmcs != null ? tasaDmcs.toFixed(1) : 'N/D'}
              </p>
              <span className="text-[9px] text-gray-400">/ 100 mil hab.</span>
            </div>
          )}
          {varDmcs != null && (
            <p className={`${smallTextCls} mt-1 ${varDmcsCls}`}>
              {varDmcsIcon} {Math.abs(varDmcs).toFixed(1)}% vs año anterior
            </p>
          )}
          {dmcsRanking && (
            <p className={`${smallTextCls} mt-1 font-medium text-gray-500`}>{dmcsRanking}</p>
          )}
        </div>
      </div>
      <p className="text-[8px] text-gray-400 mt-2 leading-tight">* Delitos de Mayor Connotación Social</p>
    </div>
  )
}

// ── MetricasClaveSection ─────────────────────────────────────────────────────

export default function MetricasClaveSection({ region, compact, onVerMasIndicadores }: {
  region: Region | null
  compact?: boolean
  /** Si se pasa, reemplaza "Última actualización" por un link a la derecha (usado desde el Mapa). */
  onVerMasIndicadores?: () => void
}) {
  const selectedCod = region?.cod ?? null

  const { rows: allLeystop } = useColegaSeguridadAll()
  const { rows: delitosRows } = useColegaDelitosAll()
  const { periodos: empPeriodos, datos: empDatosTodas, loading: empLoading } = useMetricasEmpleoTodas()
  const { rows: pibRowsReg, loading: pibRegLoading } = useMetricasPibRegion(region?.nombre ?? null)
  const { valores: pibNacVal } = useMetricasPibNacional()
  const { fecha: ultimaActualizacionMetricas } = useUltimaActualizacionMetricas()

  const metricsLoading = empLoading || pibRegLoading

  // ── Desocupación — misma fuente que la pestaña Métricas (registros_bce_empleo) ──
  const empUltIdx = empPeriodos.length - 1
  const empReg = region ? empDatosTodas[region.nombre] : null
  const empNac = empDatosTodas['__NACIONAL__']
  const desocValor = empReg?.tasa_tm[empUltIdx] ?? null
  const desocValorPrev = empUltIdx >= 1 ? (empReg?.tasa_tm[empUltIdx - 1] ?? null) : null
  const desocTrend = desocValor != null && desocValorPrev != null ? desocValor - desocValorPrev : null
  const desocNac = empNac?.tasa_tm[empUltIdx] ?? null
  const desocDelta = desocValor != null && desocNac != null ? desocValor - desocNac : null
  const desocPeriodo = empPeriodos[empUltIdx] ?? undefined
  const desocPeriodoLabel = (() => {
    if (!desocPeriodo) return null
    try {
      const mes = new Date(`${desocPeriodo}T12:00:00`).toLocaleDateString('es-CL', { month: 'long' })
      return `${mes}-${desocPeriodo.slice(0, 4)}`
    } catch { return null }
  })()
  const desocRanking = (() => {
    if (!region || desocValor == null) return null
    const vals = Object.entries(empDatosTodas)
      .filter(([k]) => k !== '__NACIONAL__')
      .map(([nombre, d]) => ({ nombre, v: d.tasa_tm[empUltIdx] }))
      .filter((r): r is { nombre: string; v: number } => r.v != null)
      .sort((a, b) => a.v - b.v)
    const idx = vals.findIndex(r => r.nombre === region.nombre)
    return idx === -1 ? null : `${idx + 1}° de las ${vals.length} regiones`
  })()

  // ── PIB Regional — misma fuente que la pestaña Métricas (registros_bce) ──
  const pibAnualReal = pibRowsReg
    .filter(r => r.indicador_limpio === 'PIB' && r.unidad_limpia === PIB_UNIDAD_ENC && r.series_id?.endsWith('A'))
    .map(r => ({ year: parsePeriodo(r.periodo).year, val: r.valor_corregido ?? 0 }))
    .sort((a, b) => a.year.localeCompare(b.year))
  const pibAnualNom = pibRowsReg
    .filter(r => r.indicador_limpio === 'PIB' && r.unidad_limpia === PIB_UNIDAD_NOM && r.series_id?.endsWith('A'))
    .map(r => ({ year: parsePeriodo(r.periodo).year, val: r.valor_corregido ?? 0 }))

  const pibLastYear = pibAnualReal.at(-1)?.year
  const pibValReal = pibAnualReal.at(-1)?.val ?? null
  const pibValRealPrev = pibAnualReal.length >= 2 ? pibAnualReal[pibAnualReal.length - 2].val : null
  const pibCrecimientoReal = pibValReal != null && pibValRealPrev != null && pibValRealPrev > 0
    ? (pibValReal - pibValRealPrev) / pibValRealPrev * 100 : null

  const pibValNom = pibLastYear ? (pibAnualNom.find(r => r.year === pibLastYear)?.val ?? null) : null
  const pibBillNom = pibValNom != null ? pibValNom / 1000 : null

  // % del PIB nacional: se calcula sobre la serie REAL (encadenada), igual que la
  // pestaña Métricas (MetricasView: pibLast/nacTotal sobre PIB_UNIDAD_ENC). Usar
  // nominal acá daba un número distinto al del tab para regiones con brecha
  // real↔nominal marcada (mineras) — rompía la unificación que busca esta sección.
  const pibNacTotalReal = pibLastYear
    ? Object.values(pibNacVal).reduce((s, rv) => s + (rv[pibLastYear] ?? 0), 0)
    : 0
  const pibPctNacional = pibValReal != null && pibNacTotalReal > 0 ? pibValReal / pibNacTotalReal * 100 : null

  const pibRanking = (() => {
    if (!pibLastYear || pibValReal == null) return null
    const vals = Object.values(pibNacVal)
      .map(rv => rv[pibLastYear] ?? 0)
      .filter(v => v > 0)
      .sort((a, b) => b - a)
    const pos = vals.findIndex(v => Math.abs(v - pibValReal) < 0.01) + 1
    return pos > 0 ? `${pos}° de las ${vals.length} regiones` : null
  })()

  // ── Seguridad — misma fuente que la pestaña Métricas (registros_leystop / registros_leystop_delitos) ──
  const regionLeystop = allLeystop.find(r => INE_CODE[selectedCod ?? ''] === r.id_region)
  const delitosRegion = region ? delitosRows.filter(r => r.nombre_region === region.nombre) : []

  const tasaDelitos100k = regionLeystop?.tasa_registro ?? null
  const varDelitosAnual = regionLeystop?.var_anno_fecha ?? null

  const delitosRanking = (() => {
    if (!regionLeystop) return null
    const sorted = [...allLeystop]
      .filter(r => r.tasa_registro != null)
      .sort((a, b) => (b.tasa_registro ?? 0) - (a.tasa_registro ?? 0))
    const idx = sorted.findIndex(r => r.id_region === regionLeystop.id_region)
    if (idx === -1) return null
    return compact ? `${idx + 1}°/${sorted.length}` : `${idx + 1}° de las ${sorted.length} regiones`
  })()

  const dmcsRegionRows = delitosRegion.filter(r => DMCS_LISTA.includes(r.nombre_delito))
  const dmcsTotalAnno = dmcsRegionRows.reduce((s, r) => s + (r.anno_fecha ?? 0), 0)
  const dmcsTotalAnt = dmcsRegionRows.reduce((s, r) => s + (r.anno_fecha_ant ?? 0), 0)
  const varDmcsAnual = dmcsTotalAnt > 0 ? (dmcsTotalAnno - dmcsTotalAnt) / dmcsTotalAnt * 100 : null

  const tasaDmcs = (() => {
    if (!regionLeystop?.tasa_registro || regionLeystop.tasa_registro <= 0 || !regionLeystop.casos_anno_fecha || regionLeystop.casos_anno_fecha <= 0) return null
    const pob = regionLeystop.casos_anno_fecha / regionLeystop.tasa_registro * 100000
    return dmcsTotalAnno / pob * 100000
  })()

  const dmcsRanking = (() => {
    if (!region || tasaDmcs == null) return null
    const tasas = allLeystop.flatMap(sr => {
      if (!sr.tasa_registro || sr.tasa_registro <= 0 || !sr.casos_anno_fecha || sr.casos_anno_fecha <= 0) return []
      const dmcsSum = delitosRows
        .filter(d => d.nombre_region === sr.nombre_region && DMCS_LISTA.includes(d.nombre_delito))
        .reduce((s, d) => s + (d.anno_fecha ?? 0), 0)
      const pob = sr.casos_anno_fecha / sr.tasa_registro * 100000
      return [{ region: sr.nombre_region, tasa: dmcsSum / pob * 100000 }]
    }).sort((a, b) => b.tasa - a.tasa)
    const idx = tasas.findIndex(r => r.region === region.nombre)
    if (idx === -1) return null
    return compact ? `${idx + 1}°/${tasas.length}` : `${idx + 1}° de las ${tasas.length} regiones`
  })()

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className={`${compact ? 'text-[10px]' : 'text-xs'} font-semibold text-gray-500 uppercase tracking-wider`}>Métricas clave</h3>
        {onVerMasIndicadores ? (
          <button
            onClick={onVerMasIndicadores}
            className="text-[9px] font-semibold text-blue-600 hover:text-blue-700 hover:underline shrink-0"
          >
            Ver más indicadores →
          </button>
        ) : ultimaActualizacionMetricas && (
          <span className="text-[9px] text-gray-400">
            Última actualización: {fmtUltimaActualizacion(ultimaActualizacionMetricas)}
          </span>
        )}
      </div>
      <div className={`grid grid-cols-1 sm:grid-cols-3 ${compact ? 'gap-2' : 'gap-3'}`}>
        <MetricCard
          title="Desocupación"
          subtitle={desocPeriodoLabel ? `BCCh trimestre móvil ${desocPeriodoLabel}` : 'BCCh trimestre móvil'}
          value={desocValor != null ? `${desocValor.toFixed(1)}%` : metricsLoading ? '…' : 'N/D'}
          trend={desocTrend}
          trendLabel="vs mes anterior"
          trendDown={true}
          comparisonLabel={desocNac != null ? `Nacional ${desocNac.toFixed(1)}%` : undefined}
          comparisonDelta={desocDelta != null ? `(${desocDelta > 0 ? '+' : ''}${desocDelta.toFixed(1)} pp)` : undefined}
          comparisonGood={desocDelta != null ? desocDelta < 0 : null}
          ranking={desocRanking}
          compact={compact}
        />
        <MetricCard
          title="PIB Regional"
          subtitle={pibLastYear ? `BCCh Nominal anual ${pibLastYear}` : 'BCCh Nominal anual'}
          value={pibBillNom != null ? `$${pibBillNom.toLocaleString('es-CL', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} bill.` : metricsLoading ? '…' : 'N/D'}
          trend={pibCrecimientoReal}
          trendLabel="crecimiento real vs año anterior"
          trendSuffix="%"
          trendDown={false}
          comparisonLabel={pibPctNacional != null ? `${pibPctNacional.toFixed(1)}% del PIB nacional` : undefined}
          ranking={pibRanking}
          compact={compact}
        />
        <SeguridadSplitCard
          subtitle={regionLeystop?.semana
            ? `Semana ${regionLeystop.semana.replace(/^SEMANA\s+/i, '')}/${regionLeystop.anno} · LeyStop`
            : 'LeyStop · año a la fecha'}
          tasaDelitos={tasaDelitos100k}
          varDelitosAnual={varDelitosAnual}
          delitosRanking={delitosRanking}
          tasaDmcs={tasaDmcs}
          varDmcs={varDmcsAnual}
          dmcsRanking={dmcsRanking}
          compact={compact}
        />
      </div>
      {onVerMasIndicadores && ultimaActualizacionMetricas && (
        <p className="text-[8px] text-gray-400 text-right mt-1">
          Última actualización: {fmtUltimaActualizacion(ultimaActualizacionMetricas)}
        </p>
      )}
    </div>
  )
}
