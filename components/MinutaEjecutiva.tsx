import {
  Document, Page, Text, View, StyleSheet, Svg, Path, Rect, Circle,
} from '@react-pdf/renderer'
import type { Iniciativa } from '@/lib/projects'
import type { Region } from '@/lib/regions'
import type { RegionMetrics, SeiaProject, MopProject } from '@/lib/types'
import type { MinutaEjecutivaContent } from '@/lib/minutaAI'

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  greenHdr:  '#3d6b2e',
  orangeHdr: '#b85d0a',
  navy:      '#1a2744',
  red:       '#dc2626',
  amber:     '#d97706',
  verde:     '#16a34a',
  gris:      '#9ca3af',
  white:     '#ffffff',
  border:    '#dddddd',
  bgLight:   '#f5f5f5',
  textDark:  '#111111',
  textMid:   '#555555',
  textLight: '#888888',
} as const

// ── Utilities ─────────────────────────────────────────────────────────────────
const tr = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + '…' : s

function regionLabel(region: Region): string {
  if (region.cod === 'RM') return 'Región Metropolitana de Santiago'
  return `Región de ${region.nombre}`
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', {
      day: '2-digit', month: 'short', year: '2-digit',
    })
  } catch { return iso.slice(0, 10) }
}

function fmtSeia(mm?: number | null): string {
  if (mm == null) return '—'
  if (mm >= 1_000_000) return `USD ${(mm / 1_000_000).toFixed(1)}B MM`
  if (mm >= 1_000)     return `USD ${(mm / 1_000).toFixed(0)}M MM`
  return `${mm.toFixed(0)} MM$`
}

function fmtMop(miles?: number | null): string {
  if (miles == null) return '—'
  if (miles >= 1_000_000) return `$${(miles / 1_000_000).toFixed(2)}B MM`
  if (miles >= 1_000)     return `$${(miles / 1_000).toFixed(0)}M MM`
  return `$${miles} mil`
}

function arcPath(cx: number, cy: number, r: number, a1: number, a2: number): string {
  const rad = (d: number) => (d * Math.PI) / 180
  const sweep = Math.min(a2 - a1, 359.99)
  const x1 = cx + r * Math.cos(rad(a1))
  const y1 = cy + r * Math.sin(rad(a1))
  const x2 = cx + r * Math.cos(rad(a1 + sweep))
  const y2 = cy + r * Math.sin(rad(a1 + sweep))
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}

// ── Stylesheet ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica', fontSize: 9,
    color: C.textDark, backgroundColor: C.white, paddingBottom: 34,
  },

  // Page header
  ph: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    paddingHorizontal: 22, paddingVertical: 9,
    borderBottomWidth: 1.5, borderBottomColor: '#c0c0c0', marginBottom: 14,
  },
  phOrg:    { fontSize: 7,  color: C.textLight },
  phBold:   { fontSize: 8,  fontFamily: 'Helvetica-Bold', color: C.navy },
  phR:      { alignItems: 'flex-end' },
  phRegion: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.navy },
  phDate:   { fontSize: 8,  color: C.textLight },
  phChip:   { backgroundColor: C.navy, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2, marginTop: 3 },
  phChipTx: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: C.white, letterSpacing: 0.5 },

  // Section headers
  sh:    { backgroundColor: C.greenHdr,  paddingVertical: 4, paddingHorizontal: 8, marginBottom: 7 },
  sho:   { backgroundColor: C.orangeHdr, paddingVertical: 4, paddingHorizontal: 8, marginBottom: 7 },
  shTxt: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.white },

  // Layout
  body: { paddingHorizontal: 22 },
  row:  { flexDirection: 'row', gap: 14 },
  colL: { flex: 55 },
  colR: { flex: 45 },

  // Bullets
  bl:    { flexDirection: 'row', marginBottom: 5 },
  blDot: { width: 12, flexShrink: 0, color: C.textMid },
  blTxt: { flex: 1, fontSize: 9, lineHeight: 1.5 },
  blBold:{ fontFamily: 'Helvetica-Bold' },
  boldSub: { fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 6, marginTop: 1 },

  // Stat boxes (right col)
  statRow: { flexDirection: 'row', gap: 4, marginBottom: 10 },
  statBox: { flex: 1, alignItems: 'center', paddingVertical: 5, borderWidth: 0.5, borderColor: C.border, borderRadius: 2 },
  statN:   { fontSize: 15, fontFamily: 'Helvetica-Bold', color: C.navy },
  statNR:  { fontSize: 15, fontFamily: 'Helvetica-Bold', color: C.red   },
  statNA:  { fontSize: 15, fontFamily: 'Helvetica-Bold', color: C.amber },
  statNV:  { fontSize: 15, fontFamily: 'Helvetica-Bold', color: C.verde },
  statNGr: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: C.gris  },
  statL:   { fontSize: 6.5, color: C.textLight, textAlign: 'center', marginTop: 1 },

  // Donut center overlay
  dc:    { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  dcPct: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  dcN:   { fontSize: 20, fontFamily: 'Helvetica-Bold', color: C.navy },
  dcSub: { fontSize: 7.5, color: C.textLight },

  // Legend
  leg:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 3, marginBottom: 8 },
  legItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  legTxt:  { fontSize: 7.5, color: C.textMid },

  // Metrics table (right col)
  mTitle: {
    fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.textDark,
    marginTop: 8, marginBottom: 4,
    borderBottomWidth: 0.5, borderBottomColor: C.border, paddingBottom: 2,
  },
  mRow:  { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2.5, borderBottomWidth: 0.5, borderBottomColor: '#eeeeee' },
  mLbl:  { fontSize: 7.5, color: C.textMid },
  mVal:  { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.navy },

  // Tables (page 2)
  tHdr:    { flexDirection: 'row', backgroundColor: '#e2e2e2', paddingVertical: 3.5, paddingHorizontal: 5, marginTop: 4 },
  tHdrTxt: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#222' },
  tRow:    { flexDirection: 'row', paddingVertical: 3.5, paddingHorizontal: 5, borderBottomWidth: 0.5, borderBottomColor: '#e8e8e8' },
  tRowAlt: { backgroundColor: '#f8f8f8' },
  tTxt:    { fontSize: 7.5, color: '#333' },

  // GPS side-by-side
  gpsRow: { flexDirection: 'row', gap: 12, marginTop: 6 },
  gpsSub: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.textDark, marginBottom: 4 },

  // AI highlight box
  aiBox: {
    backgroundColor: '#f0f7ec',
    borderLeftWidth: 2.5, borderLeftColor: C.verde,
    paddingHorizontal: 7, paddingVertical: 5,
    marginBottom: 8, marginTop: 2,
  },
  aiBoxTxt: { fontSize: 8, color: '#2d5a20', lineHeight: 1.5 },

  // Footer
  foot:    { position: 'absolute', bottom: 12, left: 22, right: 22, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: '#bbbbbb', paddingTop: 4 },
  footTxt: { fontSize: 7, color: C.textLight },
})

// ── Sub-components ────────────────────────────────────────────────────────────

function PH({ region, fecha }: { region: Region; fecha: string }) {
  return (
    <View style={s.ph}>
      <View>
        <Text style={s.phOrg}>República de Chile</Text>
        <Text style={s.phBold}>Ministerio del Interior y Seguridad Pública</Text>
        <Text style={s.phOrg}>División de Coordinación Interregional</Text>
      </View>
      <View style={s.phR}>
        <Text style={s.phRegion}>{regionLabel(region)}</Text>
        <Text style={s.phDate}>{fecha}</Text>
        <View style={s.phChip}><Text style={s.phChipTx}>MINUTA EJECUTIVA</Text></View>
      </View>
    </View>
  )
}

function SH({ t }: { t: string }) {
  return <View style={s.sh}><Text style={s.shTxt}>{t}</Text></View>
}

function SHO({ t }: { t: string }) {
  return <View style={s.sho}><Text style={s.shTxt}>{t}</Text></View>
}

function BL({ text, bold }: { text: string; bold?: string }) {
  return (
    <View style={s.bl}>
      <Text style={s.blDot}>•</Text>
      {bold
        ? <Text style={s.blTxt}><Text style={s.blBold}>{bold}</Text>{text}</Text>
        : <Text style={s.blTxt}>{text}</Text>
      }
    </View>
  )
}

function LegItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={s.legItem}>
      <Svg width={9} height={9}>
        <Rect x={0} y={0} width={9} height={9} fill={color} />
      </Svg>
      <Text style={s.legTxt}>{label}</Text>
    </View>
  )
}

function DonutChart({ rojo, ambar, verde, gris }: { rojo: number; ambar: number; verde: number; gris: number }) {
  const total = rojo + ambar + verde + gris
  if (total === 0) return null

  const cx = 62, cy = 62, r = 47, sw = 15, sz = 124
  const segs = [
    { val: rojo,  color: C.red   },
    { val: ambar, color: C.amber },
    { val: verde, color: C.verde },
    { val: gris,  color: C.gris  },
  ]
  let cum = 0
  const verdePct = Math.round((verde / total) * 100)
  const maxVal   = Math.max(verde, ambar, rojo, gris)
  const domColor = maxVal === verde ? C.verde : maxVal === ambar ? C.amber : maxVal === rojo ? C.red : C.gris
  const domPct   = Math.round((maxVal / total) * 100)

  return (
    <View style={{ alignItems: 'center', marginBottom: 4 }}>
      <View>
        <Svg width={sz} height={sz}>
          <Circle cx={cx} cy={cy} r={r} fill="none" stroke="#e8e8e8" strokeWidth={sw} />
          {segs.map((seg, i) => {
            if (seg.val === 0) return null
            const a1 = (cum / total) * 360 - 90
            const a2 = ((cum + seg.val) / total) * 360 - 90
            cum += seg.val
            return <Path key={i} d={arcPath(cx, cy, r, a1, a2)} fill="none" stroke={seg.color} strokeWidth={sw} />
          })}
        </Svg>
        <View style={[s.dc, { top: 30 }]}>
          <Text style={[s.dcPct, { color: domColor }]}>{domPct}%</Text>
          <Text style={s.dcN}>{total}</Text>
          <Text style={s.dcSub}>iniciativas</Text>
          <Text style={[s.dcSub, { color: C.verde, fontFamily: 'Helvetica-Bold', fontSize: 8 }]}>
            {verdePct}% verde
          </Text>
        </View>
      </View>
    </View>
  )
}

function EjeChart({ projects }: { projects: Iniciativa[] }) {
  const BAR_W = 130, BAR_H = 10
  const ejes = Array.from(new Set(projects.map(p => p.eje))).filter(Boolean)

  return (
    <View>
      {/* Column labels */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 }}>
        <Text style={{ width: 110, fontSize: 6.5, color: C.textLight, fontFamily: 'Helvetica-Bold' }}>EJE REGIONAL</Text>
        <Text style={{ width: 130, fontSize: 6.5, color: C.textLight, fontFamily: 'Helvetica-Bold', textAlign: 'center' }}>DISTRIBUCIÓN SEMÁFORO</Text>
        <Text style={{ width: 22, fontSize: 6.5, color: C.textLight, textAlign: 'right' }}>N°</Text>
        <Text style={{ width: 28, fontSize: 6.5, color: C.verde, textAlign: 'right' }}>Verde</Text>
      </View>

      {ejes.map(eje => {
        const items = projects.filter(p => p.eje === eje)
        const total = items.length
        if (!total) return null
        const r = items.filter(p => p.estado_semaforo === 'rojo').length
        const a = items.filter(p => p.estado_semaforo === 'ambar').length
        const v = items.filter(p => p.estado_semaforo === 'verde').length
        const g = total - r - a - v
        const segs = [
          { n: r, color: C.red   },
          { n: a, color: C.amber },
          { n: v, color: C.verde },
          { n: g, color: C.gris  },
        ]
        const verdePct = Math.round((v / total) * 100)
        return (
          <View key={eje} style={{ marginBottom: 9 }}>
            <Text style={{ fontSize: 7.5, color: C.textDark, marginBottom: 2 }}>{tr(eje, 30)}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ width: 110, fontSize: 0 }}>{/* spacer */}</Text>
              <Svg width={BAR_W} height={BAR_H}>
                <Rect x={0} y={0} width={BAR_W} height={BAR_H} fill="#e8e8e8" />
                {(() => {
                  let x = 0
                  return segs.map((seg, i) => {
                    if (!seg.n) return null
                    const w = (seg.n / total) * BAR_W
                    const el = <Rect key={i} x={x} y={0} width={w} height={BAR_H} fill={seg.color} />
                    x += w
                    return el
                  })
                })()}
              </Svg>
              <Text style={{ width: 22, fontSize: 8, textAlign: 'right', color: C.textMid }}>{total}</Text>
              <Text style={{ width: 28, fontSize: 7.5, color: verdePct > 0 ? C.verde : C.textLight, textAlign: 'right' }}>{verdePct}%</Text>
            </View>
          </View>
        )
      })}
    </View>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
type Props = {
  region: Region
  projects: Iniciativa[]
  metrics?: RegionMetrics | null
  seiaProjects?: SeiaProject[] | null
  mopProjects?: MopProject[] | null
  fecha: string
  aiContent?: MinutaEjecutivaContent | null | unknown
}

export default function MinutaEjecutiva({ region, projects, metrics, seiaProjects, mopProjects, fecha, aiContent }: Props) {
  const ai = (aiContent && typeof aiContent === 'object' && 'avances_relevantes' in aiContent)
    ? aiContent as MinutaEjecutivaContent : null

  const m = metrics ?? null
  const total = projects.length
  const rojo  = projects.filter(p => p.estado_semaforo === 'rojo').length
  const ambar = projects.filter(p => p.estado_semaforo === 'ambar').length
  const verde = projects.filter(p => p.estado_semaforo === 'verde').length
  const gris  = projects.filter(p => p.estado_semaforo === 'gris').length

  const avgPct = Math.round(projects.reduce((acc, p) => acc + p.pct_avance, 0) / (total || 1))

  // Próximos hitos — next 8 ordered by date
  const hitos = [...projects]
    .filter(p => p.fecha_proximo_hito)
    .sort((a, b) => new Date(a.fecha_proximo_hito!).getTime() - new Date(b.fecha_proximo_hito!).getTime())
    .slice(0, 8)

  // Rojo/critical initiatives for alertas table
  const rojoItems = projects.filter(p => p.estado_semaforo === 'rojo').slice(0, 6)

  // Fallback bullets derived from data (when no AI)
  const fallbackBullets: string[] = []
  if (!ai) {
    const alta = projects.filter(p => p.prioridad === 'Alta').length
    fallbackBullets.push(`${total} iniciativas territoriales activas en ${regionLabel(region)}.`)
    if (alta > 0) fallbackBullets.push(`${alta} iniciativas de alta prioridad bajo seguimiento activo.`)
    if (rojo > 0)  fallbackBullets.push(`${rojo} iniciativa${rojo !== 1 ? 's' : ''} en estado crítico (rojo) requieren atención inmediata.`)
    if (verde > 0) fallbackBullets.push(`${verde} iniciativa${verde !== 1 ? 's' : ''} con avance en verde, dentro de los plazos establecidos.`)
    fallbackBullets.push(`Avance promedio de las iniciativas: ${avgPct}%.`)
  }
  const bullets = ai?.avances_relevantes?.length ? ai.avances_relevantes : fallbackBullets

  // Alertas fallback
  const fallbackAlertas: string[] = []
  if (!ai && rojo > 0) {
    fallbackAlertas.push(`${rojo} iniciativa${rojo !== 1 ? 's' : ''} presenta${rojo === 1 ? '' : 'n'} semáforo rojo y requieren intervención activa del nivel central.`)
  }
  const alertas = ai?.alertas?.length ? ai.alertas : fallbackAlertas

  return (
    <Document>
      {/* ── PÁGINA 1 ──────────────────────────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <PH region={region} fecha={fecha} />

        <View style={s.body}>
          <View style={s.row}>

            {/* ── COLUMNA IZQUIERDA ── */}
            <View style={s.colL}>
              <SH t="Avance Plan Región" />
              <Text style={s.boldSub}>Los avances más relevantes del periodo fueron:</Text>
              {bullets.map((b, i) => <BL key={i} text={b} />)}

              <View style={{ marginTop: 14 }}>
                <SH t="Avance Sectorial" />
                {/* Legend */}
                <View style={[s.leg, { marginBottom: 8 }]}>
                  <LegItem color={C.red}   label="Rojo"       />
                  <LegItem color={C.amber} label="Ambar"      />
                  <LegItem color={C.verde} label="Verde"      />
                  <LegItem color={C.gris}  label="Sin evaluar"/>
                </View>
                <EjeChart projects={projects} />
              </View>
            </View>

            {/* ── COLUMNA DERECHA ── */}
            <View style={s.colR}>
              <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 2 }}>
                Estado de Avance Iniciativas Plan Región
              </Text>
              <Text style={{ fontSize: 8, color: C.textMid, marginBottom: 8 }}>
                Total Iniciativas: {total}
              </Text>

              {/* Stat boxes */}
              <View style={s.statRow}>
                <View style={[s.statBox, { borderColor: C.red   }]}><Text style={s.statNR}>{rojo}</Text><Text  style={s.statL}>Rojo</Text></View>
                <View style={[s.statBox, { borderColor: C.amber }]}><Text style={s.statNA}>{ambar}</Text><Text style={s.statL}>Ambar</Text></View>
                <View style={[s.statBox, { borderColor: C.verde }]}><Text style={s.statNV}>{verde}</Text><Text style={s.statL}>Verde</Text></View>
                <View style={[s.statBox, { borderColor: C.border}]}><Text style={s.statNGr}>{gris}</Text><Text style={s.statL}>S/E</Text></View>
              </View>

              {/* Donut */}
              <DonutChart rojo={rojo} ambar={ambar} verde={verde} gris={gris} />

              {/* Legend */}
              <View style={s.leg}>
                <LegItem color={C.red}   label={`Rojo (${rojo})`}    />
                <LegItem color={C.amber} label={`Ambar (${ambar})`}  />
                <LegItem color={C.verde} label={`Verde (${verde})`}  />
                <LegItem color={C.gris}  label={`S/E (${gris})`}     />
              </View>

              {/* AI context box */}
              {ai?.contexto_region ? (
                <View style={s.aiBox}>
                  <Text style={s.aiBoxTxt}>{ai.contexto_region}</Text>
                </View>
              ) : null}

              {ai?.tendencia_general ? (
                <View style={{ backgroundColor: '#f0fdf4', padding: 6, borderLeftWidth: 2, borderLeftColor: C.greenHdr, borderRadius: 2, marginBottom: 6 }}>
                  <Text style={{ fontSize: 7.5, color: C.navy, fontFamily: 'Helvetica-Oblique', lineHeight: 1.4 }}>{ai.tendencia_general}</Text>
                </View>
              ) : null}

              {/* Métricas socioeconómicas */}
              {m && (
                <View>
                  <Text style={s.mTitle}>Contexto Socioeconómico</Text>
                  {m.poblacion_total         != null && <View style={s.mRow}><Text style={s.mLbl}>Población (Censo 2024)</Text><Text style={s.mVal}>{m.poblacion_total.toLocaleString('es-CL')} hab.</Text></View>}
                  {m.tasa_desocupacion       != null && <View style={s.mRow}><Text style={s.mLbl}>Tasa desocupación</Text><Text style={s.mVal}>{m.tasa_desocupacion}%</Text></View>}
                  {m.pct_pobreza_ingresos    != null && <View style={s.mRow}><Text style={s.mLbl}>Pobreza por ingresos</Text><Text style={s.mVal}>{m.pct_pobreza_ingresos}%</Text></View>}
                  {m.pct_pobreza_multidimensional != null && <View style={s.mRow}><Text style={s.mLbl}>Pobreza multidimensional</Text><Text style={s.mVal}>{m.pct_pobreza_multidimensional}%</Text></View>}
                  {m.pib_regional            != null && <View style={s.mRow}><Text style={s.mLbl}>PIB regional</Text><Text style={s.mVal}>{m.pib_regional.toLocaleString('es-CL', { maximumFractionDigits: 2 })} MM$</Text></View>}
                  {m.pct_pib_nacional        != null && <View style={s.mRow}><Text style={s.mLbl}>% PIB nacional</Text><Text style={s.mVal}>{m.pct_pib_nacional}%</Text></View>}
                </View>
              )}
            </View>

          </View>
        </View>

        <View style={s.foot} fixed>
          <Text style={s.footTxt}>División de Coordinación Interregional — Ministerio del Interior y Seguridad Pública</Text>
          <Text style={s.footTxt} render={({ pageNumber, totalPages }) => `${fecha}  ·  Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>

      {/* ── PÁGINA 2 ──────────────────────────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <PH region={region} fecha={fecha} />

        <View style={s.body}>

          {/* Alertas */}
          <SH t="Alertas Plan Región" />
          {alertas.length > 0
            ? alertas.map((a, i) => <BL key={i} text={a} />)
            : <BL text="Sin alertas activas registradas en este período." />
          }

          {/* Tabla iniciativas en rojo */}
          {rojoItems.length > 0 && (
            <View style={{ marginTop: 6, marginBottom: 12 }}>
              <View style={s.tHdr}>
                <Text style={[s.tHdrTxt, { flex: 1 }]}>Iniciativas con problemas</Text>
                <Text style={[s.tHdrTxt, { width: '16%' }]}>Estado</Text>
                <Text style={[s.tHdrTxt, { width: '24%' }]}>Etapa actual</Text>
                <Text style={[s.tHdrTxt, { width: '10%', textAlign: 'center' }]}>Avance</Text>
              </View>
              {rojoItems.map((p, i) => (
                <View key={p.n} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]}>
                  <Text style={[s.tTxt, { flex: 1 }]}>{tr(p.nombre, 55)}</Text>
                  <Text style={[s.tTxt, { width: '16%', color: C.red }]}>Rojo</Text>
                  <Text style={[s.tTxt, { width: '24%' }]}>{tr(p.etapa_actual ?? '—', 28)}</Text>
                  <Text style={[s.tTxt, { width: '10%', textAlign: 'center' }]}>{p.pct_avance}%</Text>
                </View>
              ))}
            </View>
          )}

          {/* Iniciativas destacadas AI */}
          {ai?.iniciativas_destacadas?.length ? (
            <View style={{ marginBottom: 12 }}>
              <Text style={s.boldSub}>Iniciativas destacadas</Text>
              {ai.iniciativas_destacadas.map((init, i) => <BL key={i} text={init} />)}
            </View>
          ) : null}

          {/* GPS */}
          {((seiaProjects && seiaProjects.length > 0) || (mopProjects && mopProjects.length > 0)) && (
            <View style={{ marginBottom: 12 }}>
              <SH t="Inversión Privada (GPS)" />
              <View style={s.gpsRow}>

                {seiaProjects && seiaProjects.length > 0 && (
                  <View style={{ flex: 1 }}>
                    <Text style={s.gpsSub}>SEIA — Evaluación Ambiental</Text>
                    <View style={s.tHdr}>
                      <Text style={[s.tHdrTxt, { flex: 1 }]}>Proyecto</Text>
                      <Text style={[s.tHdrTxt, { width: '26%' }]}>Estado</Text>
                      <Text style={[s.tHdrTxt, { width: '22%', textAlign: 'right' }]}>Inversión</Text>
                    </View>
                    {seiaProjects.slice(0, 5).map((p, i) => (
                      <View key={p.id} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]}>
                        <Text style={[s.tTxt, { flex: 1 }]}>{tr(p.nombre, 32)}</Text>
                        <Text style={[s.tTxt, { width: '26%' }]}>{tr(p.estado ?? '—', 22)}</Text>
                        <Text style={[s.tTxt, { width: '22%', textAlign: 'right' }]}>{fmtSeia(p.inversion_mm)}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {mopProjects && mopProjects.length > 0 && (
                  <View style={{ flex: 1 }}>
                    <Text style={s.gpsSub}>MOP — Obras Públicas</Text>
                    <View style={s.tHdr}>
                      <Text style={[s.tHdrTxt, { flex: 1 }]}>Proyecto</Text>
                      <Text style={[s.tHdrTxt, { width: '24%' }]}>Etapa</Text>
                      <Text style={[s.tHdrTxt, { width: '22%', textAlign: 'right' }]}>Inversión</Text>
                    </View>
                    {mopProjects.slice(0, 5).map((p, i) => (
                      <View key={p.cod_p} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]}>
                        <Text style={[s.tTxt, { flex: 1 }]}>{tr(p.nombre, 32)}</Text>
                        <Text style={[s.tTxt, { width: '24%' }]}>{tr(p.etapa ?? '—', 22)}</Text>
                        <Text style={[s.tTxt, { width: '22%', textAlign: 'right' }]}>{fmtMop(p.inversion_miles)}</Text>
                      </View>
                    ))}
                  </View>
                )}

              </View>
            </View>
          )}

          {/* Próximos Hitos */}
          {hitos.length > 0 && (
            <View>
              <SHO t="Próximos Hitos" />
              <View style={s.tHdr}>
                <Text style={[s.tHdrTxt, { flex: 1 }]}>Iniciativa</Text>
                <Text style={[s.tHdrTxt, { width: '12%' }]}>Comuna</Text>
                <Text style={[s.tHdrTxt, { width: '18%' }]}>Etapa actual</Text>
                <Text style={[s.tHdrTxt, { width: '22%' }]}>Hito</Text>
                <Text style={[s.tHdrTxt, { width: '12%', textAlign: 'center' }]}>Fecha</Text>
              </View>
              {hitos.map((p, i) => (
                <View key={p.n} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]}>
                  <Text style={[s.tTxt, { flex: 1 }]}>{tr(p.nombre, 40)}</Text>
                  <Text style={[s.tTxt, { width: '12%' }]}>{tr(p.comuna ?? '—', 14)}</Text>
                  <Text style={[s.tTxt, { width: '18%' }]}>{tr(p.etapa_actual ?? '—', 20)}</Text>
                  <Text style={[s.tTxt, { width: '22%' }]}>{tr(p.proximo_hito ?? '—', 26)}</Text>
                  <Text style={[s.tTxt, { width: '12%', textAlign: 'center' }]}>{fmtDate(p.fecha_proximo_hito)}</Text>
                </View>
              ))}
            </View>
          )}

        </View>

        <View style={s.foot} fixed>
          <Text style={s.footTxt}>División de Coordinación Interregional — Ministerio del Interior y Seguridad Pública</Text>
          <Text style={s.footTxt} render={({ pageNumber, totalPages }) => `${fecha}  ·  Minuta Ejecutiva  ·  Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
