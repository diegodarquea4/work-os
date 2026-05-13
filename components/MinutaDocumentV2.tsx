import {
  Document, Page, Text, View, StyleSheet,
} from '@react-pdf/renderer'
import type { Iniciativa } from '@/lib/projects'
import type { Region } from '@/lib/regions'
import type { RegionMetrics, SeiaProject, MopProject } from '@/lib/types'
import type { MinutaCompletaContent } from '@/lib/minutaAI'
import { getRegionColor } from '@/lib/regionColors'

// ── Helpers ──────────────────────────────────────────────────────────────────

function tr(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}

function fmt(val?: number | null): string | null {
  if (val == null) return null
  return val.toLocaleString('es-CL')
}

function pct(val?: number | null): string | null {
  if (val == null) return null
  const r = Math.round(val * 10) / 10
  return `${String(r).replace('.', ',')}%`
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
  return `USD ${mm.toLocaleString('es-CL')} MM`
}

function fmtMop(miles?: number | null): string {
  if (miles == null) return '—'
  const mmPesos = miles / 1_000
  if (mmPesos >= 1) return `$${mmPesos.toLocaleString('es-CL', { maximumFractionDigits: 0 })} MM`
  return `$${miles.toLocaleString('es-CL')} mil`
}

function semLabel(sem: string | null): string {
  if (sem === 'verde') return '● Verde'
  if (sem === 'ambar') return '◑ Ámbar'
  if (sem === 'rojo')  return '○ Rojo'
  return '  —'
}

function regionFullName(region: Region): string {
  const OVERRIDES: Record<string, string> = {
    RM:  'Región Metropolitana de Santiago',
    XI:  'Región de Aysén del Gral. Carlos Ibáñez del Campo',
    XII: 'Región de Magallanes y de la Antártica Chilena',
  }
  return OVERRIDES[region.cod] ?? `Región de ${region.nombre}`
}

function ejeNum(eje: string): number {
  const m = eje.match(/\d+/)
  return m ? parseInt(m[0], 10) : 99
}

const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f']

// ── Palette (dynamic per region) ────────────────────────────────────────────
const C = {
  red:        '#C8102E',
  lightBlue:  '#EFF6FF',
  bg:         '#f9fafb',
  border:     '#e5e7eb',
  textDark:   '#111827',
  textMid:    '#374151',
  textLight:  '#6b7280',
  white:      '#ffffff',
  alertRed:   '#b91c1c',
  recGreen:   '#15803d',
  amber:      '#d97706',
  verde:      '#16a34a',
  rojo:       '#dc2626',
}

// ── Shared styles (accent color injected at render time) ────────────────────
function createStyles(accent: string) {
  return StyleSheet.create({
    page: {
      fontFamily: 'Helvetica', fontSize: 9, color: C.textDark,
      paddingTop: 32, paddingBottom: 52, paddingHorizontal: 44,
    },

    // ── Header ──
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
    headerLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    logoBar: { width: 5, height: 40, backgroundColor: accent },
    orgBlock: { justifyContent: 'center' },
    orgBold:  { fontSize: 8, fontFamily: 'Helvetica-Bold', color: accent },
    orgLight: { fontSize: 7, color: C.textLight, marginTop: 1 },
    headerDate: { fontSize: 8, color: C.textLight, textAlign: 'right' },
    divider: { borderBottomWidth: 2, borderBottomColor: accent, marginBottom: 14 },

    // ── Portada ──
    portadaBlock: { alignItems: 'center', marginBottom: 16 },
    portadaSupra: { fontSize: 7.5, color: C.textLight, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 },
    portadaMain: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: accent, textTransform: 'uppercase', textAlign: 'center', marginBottom: 2 },
    portadaSub: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.textDark, textAlign: 'center', marginBottom: 2 },
    portadaMeta: { fontSize: 8, color: C.textLight, textAlign: 'center' },

    // ── Stat boxes ──
    statRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
    statBox: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 3, paddingVertical: 8, paddingHorizontal: 6, alignItems: 'center' },
    statValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: accent },
    statLabel: { fontSize: 7, color: C.textLight, textAlign: 'center', marginTop: 2 },

    // ── Resumen box ──
    resumenBox: { backgroundColor: C.lightBlue, borderLeftWidth: 3, borderLeftColor: accent, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 14 },
    resumenLabel: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: accent, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 3 },
    resumenText: { fontSize: 9, color: C.textDark, lineHeight: 1.5, textAlign: 'justify' },

    // ── Section heading ──
    sectionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', textDecoration: 'underline', color: accent, marginTop: 14, marginBottom: 7 },

    // ── Sub sections ──
    subRow: { flexDirection: 'row', marginBottom: 9, paddingLeft: 4 },
    subLetter: { width: 18, fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: C.textDark },
    subContent: { flex: 1 },
    subTitle: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: C.textDark, marginBottom: 2 },
    subText: { fontSize: 9, color: C.textMid, lineHeight: 1.55, textAlign: 'justify' },

    // ── Bullets ──
    bulletRow: { flexDirection: 'row', marginBottom: 3, paddingLeft: 6 },
    bulletDot: { width: 10, fontSize: 9, color: C.textMid },
    bulletText: { flex: 1, fontSize: 9, color: C.textMid, lineHeight: 1.5 },

    // ── Tables ──
    tHdr: { flexDirection: 'row', backgroundColor: accent, paddingVertical: 3, paddingHorizontal: 5 },
    tHdrTxt: { color: C.white, fontSize: 7.5, fontFamily: 'Helvetica-Bold' },
    tRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: C.border, paddingVertical: 2.5, paddingHorizontal: 5 },
    tRowAlt: { backgroundColor: C.bg },
    tRowTotal: { backgroundColor: '#e8eef5' },
    tColEje: { flex: 1, fontSize: 7.5 },
    tColN: { width: '9%', fontSize: 7.5, textAlign: 'center' },
    tColPct: { width: '11%', fontSize: 7.5, textAlign: 'center' },
    tColR: { width: '9%', fontSize: 7.5, textAlign: 'center', color: C.rojo },
    tColA: { width: '9%', fontSize: 7.5, textAlign: 'center', color: C.amber },
    tColV: { width: '9%', fontSize: 7.5, textAlign: 'center', color: C.verde },

    // ── Eje header band ──
    ejeHeader: { backgroundColor: accent, paddingVertical: 5, paddingHorizontal: 8, marginTop: 10 },
    ejeHeaderText: { color: C.white, fontSize: 9, fontFamily: 'Helvetica-Bold' },
    ejeResumenBox: { backgroundColor: '#EEF3F8', paddingHorizontal: 8, paddingVertical: 5, marginBottom: 3 },
    ejeResumenText: { fontSize: 8.5, color: C.textMid, fontStyle: 'italic', lineHeight: 1.5 },

    // ── GPS ──
    gpsIntro: { fontSize: 9, color: C.textMid, lineHeight: 1.5, marginBottom: 6, textAlign: 'justify' },
    gpsColFuente: { width: '9%', fontSize: 7.5 },
    gpsColNombre: { flex: 1, fontSize: 7.5, paddingRight: 4 },
    gpsColSector: { width: '18%', fontSize: 7.5, paddingRight: 3 },
    gpsColInv: { width: '15%', fontSize: 7.5, textAlign: 'right' },
    gpsColEtapa: { width: '14%', fontSize: 7.5 },
    gpsLabel: { fontSize: 7, color: C.textLight, fontStyle: 'italic', marginTop: 2, marginBottom: 6 },

    // ── Alertas ──
    alertRow: { flexDirection: 'row', marginBottom: 4, paddingLeft: 4 },
    alertMarker: { width: 14, fontSize: 9, color: C.alertRed, fontFamily: 'Helvetica-Bold' },
    alertText: { flex: 1, fontSize: 9, color: C.textMid },
    recRow: { flexDirection: 'row', marginBottom: 4, paddingLeft: 4 },
    recMarker: { width: 14, fontSize: 9, color: C.recGreen, fontFamily: 'Helvetica-Bold' },
    recText: { flex: 1, fontSize: 9, color: C.textMid },

    // ── Annex ──
    annexColLabel: { flex: 1, fontSize: 8, color: C.textMid },
    annexColValue: { width: '35%', fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.textDark, textAlign: 'right' },

    // ── Hitos ──
    hitosColNombre: { flex: 1, fontSize: 7.5, paddingRight: 4 },
    hitosColHito: { flex: 1, fontSize: 7.5, paddingRight: 4 },
    hitosColFecha: { width: '14%', fontSize: 7.5, textAlign: 'center' },

    // ── Mini table ──
    miniColNombre: { flex: 1, fontSize: 7.5, paddingRight: 4 },
    miniColSem: { width: '14%', fontSize: 7.5 },
    miniColPct: { width: '10%', fontSize: 7.5, textAlign: 'right' },

    // ── Footer ──
    footer: { position: 'absolute', bottom: 0, left: 0, right: 0 },
    footerBar: { height: 3, backgroundColor: accent },
    footerRedBar: { height: 3, backgroundColor: C.red },
    footerBrand: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: accent, textAlign: 'center', letterSpacing: 1.5, paddingVertical: 3, backgroundColor: C.white },

    placeholder: { fontSize: 8.5, color: C.textLight, fontStyle: 'italic' },
  })
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Bullet({ children, s: styles }: { children: string; s: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  )
}

// ── Props ───────────────────────────────────────────────────────────────────

type Autoridad = {
  cargo: string
  nombre: string
  partido: string | null
  territorio: string | null
}

type PeriodMetrics = {
  metric_name: string
  period_2018?: number | null
  period_2022?: number | null
  period_2026?: number | null
  current?: number | null
}

type Props = {
  region: Region
  projects: Iniciativa[]
  metrics?: RegionMetrics | null
  seiaProjects?: SeiaProject[] | null
  mopProjects?: MopProject[] | null
  fecha: string
  aiContent?: MinutaCompletaContent | null | unknown
  autoridades?: Autoridad[]
  periodMetrics?: PeriodMetrics[]
}

// ── Component ───────────────────────────────────────────────────────────────

export default function MinutaDocumentV2({
  region, projects, metrics, seiaProjects, mopProjects, fecha, aiContent,
  autoridades, periodMetrics,
}: Props) {

  const accent = getRegionColor(region.nombre)
  const s = createStyles(accent)

  const ai = (aiContent && typeof aiContent === 'object' && 'cifras' in aiContent)
    ? aiContent as MinutaCompletaContent : null

  const m = metrics ?? null
  const sorted = [...projects].sort((a, b) => {
    const na = ejeNum(a.eje), nb = ejeNum(b.eje)
    if (na !== nb) return na - nb
    if (a.prioridad !== b.prioridad) return a.prioridad === 'Alta' ? -1 : 1
    return a.n - b.n
  })

  const ejes = Array.from(new Set(sorted.map(p => p.eje)))
  const totalInit = projects.length
  const avgPct = totalInit ? Math.round(projects.reduce((acc, p) => acc + (p.pct_avance ?? 0), 0) / totalInit) : 0
  const totalRojo = projects.filter(p => p.estado_semaforo === 'rojo').length
  const totalAmbar = projects.filter(p => p.estado_semaforo === 'ambar').length
  const totalVerde = projects.filter(p => p.estado_semaforo === 'verde').length

  const hitos = sorted
    .filter(p => p.proximo_hito && p.fecha_proximo_hito)
    .sort((a, b) => (a.fecha_proximo_hito ?? '') < (b.fecha_proximo_hito ?? '') ? -1 : 1)
    .slice(0, 10)

  const seiaTop = (seiaProjects ?? []).slice(0, 5)
  const mopTop = (mopProjects ?? []).slice(0, 5)
  const hasGps = seiaTop.length > 0 || mopTop.length > 0

  // Annex indicators (only rows with data)
  const annexRows = ([
    ['Población total',              m?.poblacion_total != null ? `${fmt(m.poblacion_total)} hab.` : null],
    ['Superficie (km²)',             m?.superficie_km2 != null ? `${fmt(m.superficie_km2)} km²` : null],
    ['Comunas',                      m?.comunas_n != null ? String(m.comunas_n) : null],
    ['PIB regional (MM$)',           m?.pib_regional != null ? fmt(m.pib_regional) : null],
    ['% PIB nacional',               pct(m?.pct_pib_nacional)],
    ['Tasa desocupación',            pct(m?.tasa_desocupacion)],
    ['Participación laboral',        pct(m?.tasa_participacion_laboral)],
    ['Ocupación informal',           pct(m?.tasa_ocupacion_informal)],
    ['Pobreza por ingresos',         pct(m?.pct_pobreza_ingresos)],
    ['Pobreza extrema',              pct(m?.pct_pobreza_extrema)],
    ['Pobreza multidimensional',     pct(m?.pct_pobreza_multidimensional)],
    ['Déficit habitacional',         m?.deficit_habitacional != null ? fmt(m.deficit_habitacional) : null],
    ['Hacinamiento (%)',             pct(m?.pct_hacinamiento ?? m?.pct_viv_hacinadas)],
    ['Población FONASA (%)',         pct(m?.pct_fonasa)],
    ['Escolaridad promedio',         m?.anios_escolaridad_promedio != null ? `${m.anios_escolaridad_promedio} años` : null],
    ['Hogares víctimas DMCS',        pct(m?.pct_hogares_victimas_dmcs)],
    ['Percepción inseguridad',       pct(m?.pct_percepcion_inseguridad)],
    ['Tasa denuncias (cada 100 mil hab.)', m?.tasa_denuncias_100k != null ? String(m.tasa_denuncias_100k) : null],
  ] as [string, string | null][]).filter(([, v]) => v != null).map(([label, val]) => ({ label, val: val! }))

  // Autoridades grouped by cargo type
  const autoridadGroups = autoridades?.length ? (() => {
    const ORDER = ['gobernador', 'delegado_regional', 'delegado_provincial', 'alcalde', 'senador', 'diputado']
    const LABELS: Record<string, string> = {
      gobernador: 'Gobernador Regional',
      delegado_regional: 'Delegado Presidencial Regional',
      delegado_provincial: 'Delegado Presidencial Provincial',
      alcalde: 'Alcalde',
      senador: 'Senador',
      diputado: 'Diputado',
    }
    const grouped = new Map<string, Autoridad[]>()
    for (const a of autoridades) {
      const arr = grouped.get(a.cargo) ?? []
      arr.push(a)
      grouped.set(a.cargo, arr)
    }
    return ORDER.filter(c => grouped.has(c)).map(c => ({
      cargoLabel: LABELS[c] ?? c,
      items: grouped.get(c)!,
    }))
  })() : null

  // ── RENDER ───────────────────────────────────────────────────────────────

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ══════════ HEADER ══════════ */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <View style={s.logoBar} />
            <View style={s.orgBlock}>
              <Text style={s.orgBold}>Ministerio del Interior y Seguridad Pública</Text>
              <Text style={s.orgLight}>División de Coordinación Interregional</Text>
              <Text style={s.orgLight}>República de Chile</Text>
            </View>
          </View>
          <Text style={s.headerDate}>{fecha}</Text>
        </View>
        <View style={s.divider} />

        {/* ══════════ PORTADA ══════════ */}
        <View style={s.portadaBlock}>
          <Text style={s.portadaSupra}>Kit de Viaje Regional</Text>
          <Text style={s.portadaMain}>{regionFullName(region)}</Text>
          {totalInit > 0 && (
            <Text style={s.portadaMeta}>
              {fecha}  ·  {totalInit} iniciativas  ·  {avgPct}% avance promedio
            </Text>
          )}
        </View>

        {/* Stat boxes */}
        <View style={s.statRow}>
          <View style={s.statBox}>
            <Text style={s.statValue}>{m?.poblacion_total != null ? fmt(m.poblacion_total) : 'N/D'}</Text>
            <Text style={s.statLabel}>Población</Text>
          </View>
          <View style={s.statBox}>
            <Text style={s.statValue}>{m?.pib_regional != null ? `${fmt(m.pib_regional)} MM$` : 'N/D'}</Text>
            <Text style={s.statLabel}>PIB Regional{m?.pct_pib_nacional != null ? ` (${pct(m.pct_pib_nacional)} país)` : ''}</Text>
          </View>
          <View style={s.statBox}>
            <Text style={s.statValue}>{pct(m?.tasa_desocupacion) ?? 'N/D'}</Text>
            <Text style={s.statLabel}>Desempleo</Text>
          </View>
          <View style={s.statBox}>
            <Text style={s.statValue}>{pct(m?.pct_pobreza_ingresos) ?? 'N/D'}</Text>
            <Text style={s.statLabel}>Pobreza por ingresos</Text>
          </View>
        </View>

        {/* AI contexto rápido */}
        {(ai as MinutaCompletaContent & { contexto_rapido?: string })?.contexto_rapido ? (
          <Text style={{ fontSize: 9, color: C.textMid, textAlign: 'center', marginBottom: 14, fontStyle: 'italic' }}>
            {(ai as MinutaCompletaContent & { contexto_rapido?: string }).contexto_rapido}
          </Text>
        ) : ai?.posicion_nacional ? (
          <Text style={{ fontSize: 9, color: C.textMid, textAlign: 'center', marginBottom: 14, fontStyle: 'italic' }}>
            {ai.posicion_nacional}
          </Text>
        ) : null}

        {/* ══════════ SECCIÓN I — SÍNTESIS DE INDICADORES (tabla temporal) ══════════ */}
        {periodMetrics && periodMetrics.length > 0 && (
          <View>
            <Text style={s.sectionTitle}>I.   Síntesis de indicadores regionales</Text>
            <View style={s.tHdr}>
              <Text style={[s.tColEje, s.tHdrTxt]}>Indicador</Text>
              <Text style={[s.tColPct, s.tHdrTxt, { textAlign: 'center' }]}>2018-2022</Text>
              <Text style={[s.tColPct, s.tHdrTxt, { textAlign: 'center' }]}>2022-2026</Text>
              <Text style={[s.tColPct, s.tHdrTxt, { textAlign: 'center', fontFamily: 'Helvetica-Bold' }]}>Actual</Text>
            </View>
            {periodMetrics.map((pm, i) => {
              const LABELS: Record<string, string> = {
                tasa_desocupacion: 'Desempleo (%)',
                pib_regional: 'PIB Regional (MM$)',
                tasa_delictual: 'Tasa delictual',
              }
              return (
                <View key={pm.metric_name} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]}>
                  <Text style={[s.tColEje, { fontFamily: 'Helvetica-Bold' }]}>{LABELS[pm.metric_name] ?? pm.metric_name}</Text>
                  <Text style={[s.tColPct, { textAlign: 'center' }]}>{pm.period_2018 != null ? String(Math.round(pm.period_2018 * 10) / 10) : '—'}</Text>
                  <Text style={[s.tColPct, { textAlign: 'center' }]}>{pm.period_2022 != null ? String(Math.round(pm.period_2022 * 10) / 10) : '—'}</Text>
                  <Text style={[s.tColPct, { textAlign: 'center', fontFamily: 'Helvetica-Bold' }]}>{pm.current != null ? String(Math.round(pm.current * 10) / 10) : '—'}</Text>
                </View>
              )
            })}
          </View>
        )}

        {/* ══════════ SECCIÓN II — PERFIL DE LA REGIÓN ══════════ */}
        <Text style={s.sectionTitle}>
          {periodMetrics?.length ? 'II.' : 'I.'}   Perfil de la Región
        </Text>

        {/* AI resumen ejecutivo */}
        {ai?.resumen_ejecutivo ? (
          <View style={s.resumenBox}>
            <Text style={s.resumenLabel}>Resumen</Text>
            <Text style={s.resumenText}>{ai.resumen_ejecutivo}</Text>
          </View>
        ) : null}

        {/* Compromisos del Plan */}
        {ai?.compromisos_plan?.length ? (
          <View>
            <Text style={[s.sectionTitle, { marginTop: 4, fontSize: 9.5 }]}>
              Compromisos del Plan Regional de Gobierno
            </Text>
            {ai.compromisos_plan.map((c, i) => (
              <Bullet key={i} s={s}>{c}</Bullet>
            ))}
          </View>
        ) : null}

        {/* Cifras (AI or fallback) */}
        {ai?.cifras?.length ? (
          ai.cifras.map((c, i) => (
            <View key={i} style={s.subRow}>
              <Text style={s.subLetter}>{LETTERS[i] ?? String(i + 1)}.</Text>
              <View style={s.subContent}>
                <Text style={s.subTitle}>{c.titulo}:</Text>
                <Text style={s.subText}>{c.texto}</Text>
              </View>
            </View>
          ))
        ) : null}

        {/* Tendencias + posición nacional (fusionadas) */}
        {ai?.tendencias?.texto && (
          <View style={{ backgroundColor: C.lightBlue, padding: 10, borderLeftWidth: 3, borderLeftColor: accent, marginBottom: 6, borderRadius: 2 }}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: accent, marginBottom: 3 }}>{ai.tendencias.titulo ?? 'Evolución de indicadores clave'}</Text>
            <Text style={{ fontSize: 9, color: C.textDark, lineHeight: 1.5 }}>{ai.tendencias.texto}</Text>
          </View>
        )}

        {/* ══════════ SECCIÓN III — AUTORIDADES REGIONALES ══════════ */}
        {autoridadGroups && (
          <View>
            <Text style={s.sectionTitle}>
              {periodMetrics?.length ? 'III.' : 'II.'}   Autoridades Regionales
            </Text>
            <View style={s.tHdr}>
              <Text style={[{ flex: 1 }, s.tHdrTxt]}>Cargo</Text>
              <Text style={[{ flex: 1 }, s.tHdrTxt]}>Nombre</Text>
            </View>
            {autoridadGroups.flatMap(group =>
              group.items.map((a, i) => (
                <View key={`${group.cargoLabel}-${i}`} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]}>
                  <Text style={[{ flex: 1, fontSize: 7.5, fontFamily: 'Helvetica-Bold' }]}>
                    {i === 0 ? (a.territorio ? `${group.cargoLabel} ${a.territorio}` : group.cargoLabel) : (a.territorio ? `${group.cargoLabel} ${a.territorio}` : '')}
                  </Text>
                  <Text style={[{ flex: 1, fontSize: 7.5 }]}>
                    {a.nombre}{a.partido ? ` (${a.partido})` : ''}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}

        {/* ══════════ SECCIÓN IV — ESTADO DEL PLAN REGIONAL ══════════ */}
        {totalInit > 0 && (
          <View>
            <Text style={s.sectionTitle}>Estado del Plan Regional</Text>
            <View style={s.tHdr}>
              <Text style={[s.tColEje, s.tHdrTxt]}>Eje Estratégico</Text>
              <Text style={[s.tColN, s.tHdrTxt, { textAlign: 'center' }]}>N°</Text>
              <Text style={[s.tColPct, s.tHdrTxt, { textAlign: 'center' }]}>Avance</Text>
              <Text style={[s.tColR, s.tHdrTxt, { color: C.white }]}>Rojo</Text>
              <Text style={[s.tColA, s.tHdrTxt, { color: C.white }]}>Ámbar</Text>
              <Text style={[s.tColV, s.tHdrTxt, { color: C.white }]}>Verde</Text>
            </View>
            {ejes.map((eje, i) => {
              const items = sorted.filter(p => p.eje === eje)
              const r = items.filter(p => p.estado_semaforo === 'rojo').length
              const a = items.filter(p => p.estado_semaforo === 'ambar').length
              const v = items.filter(p => p.estado_semaforo === 'verde').length
              const avg = Math.round(items.reduce((acc, p) => acc + (p.pct_avance ?? 0), 0) / items.length)
              return (
                <View key={eje} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]}>
                  <Text style={s.tColEje}>{tr(eje, 52)}</Text>
                  <Text style={[s.tColN, { textAlign: 'center' }]}>{items.length}</Text>
                  <Text style={[s.tColPct, { textAlign: 'center' }]}>{avg}%</Text>
                  <Text style={s.tColR}>{r > 0 ? r : '—'}</Text>
                  <Text style={s.tColA}>{a > 0 ? a : '—'}</Text>
                  <Text style={s.tColV}>{v > 0 ? v : '—'}</Text>
                </View>
              )
            })}
            <View style={[s.tRow, s.tRowTotal]}>
              <Text style={[s.tColEje, { fontFamily: 'Helvetica-Bold' }]}>TOTAL</Text>
              <Text style={[s.tColN, { textAlign: 'center', fontFamily: 'Helvetica-Bold' }]}>{totalInit}</Text>
              <Text style={[s.tColPct, { textAlign: 'center', fontFamily: 'Helvetica-Bold' }]}>{avgPct}%</Text>
              <Text style={[s.tColR, { fontFamily: 'Helvetica-Bold' }]}>{totalRojo > 0 ? totalRojo : '—'}</Text>
              <Text style={[s.tColA, { fontFamily: 'Helvetica-Bold' }]}>{totalAmbar > 0 ? totalAmbar : '—'}</Text>
              <Text style={[s.tColV, { fontFamily: 'Helvetica-Bold' }]}>{totalVerde > 0 ? totalVerde : '—'}</Text>
            </View>
          </View>
        )}

        {/* ══════════ SECCIÓN V — AVANCES POR EJE ══════════ */}
        {totalInit > 0 && ejes.map(eje => {
          const items = sorted.filter(p => p.eje === eje)
          const r = items.filter(p => p.estado_semaforo === 'rojo').length
          const a = items.filter(p => p.estado_semaforo === 'ambar').length
          const v = items.filter(p => p.estado_semaforo === 'verde').length
          const avg = Math.round(items.reduce((acc, p) => acc + (p.pct_avance ?? 0), 0) / items.length)
          const aiEje = ai?.avances_ejes?.[eje] ??
            Object.entries(ai?.avances_ejes ?? {})
              .find(([k]) => k.toLowerCase().trim() === eje.toLowerCase().trim())?.[1]

          return (
            <View key={eje}>
              <View style={s.ejeHeader}>
                <Text style={s.ejeHeaderText}>
                  {eje.toUpperCase()}  ·  {items.length} iniciativas  ·  {avg}% avance
                  {r > 0 ? `  ·  ${r} rojo` : ''}{a > 0 ? `  ·  ${a} ámbar` : ''}{v > 0 ? `  ·  ${v} verde` : ''}
                </Text>
              </View>
              {aiEje?.resumen ? (
                <View style={s.ejeResumenBox}>
                  <Text style={s.ejeResumenText}>{aiEje.resumen}</Text>
                </View>
              ) : null}
              {aiEje?.logros?.length ? (
                <View style={{ paddingLeft: 4, paddingTop: 3, paddingBottom: 6 }}>
                  {aiEje.logros.map((logro, i) => <Bullet key={i} s={s}>{logro}</Bullet>)}
                </View>
              ) : (
                <View>
                  <View style={[s.tHdr, { backgroundColor: '#374151' }]}>
                    <Text style={[s.miniColNombre, s.tHdrTxt]}>Iniciativa</Text>
                    <Text style={[s.miniColSem, s.tHdrTxt]}>Estado</Text>
                    <Text style={[s.miniColPct, s.tHdrTxt]}>Avance</Text>
                  </View>
                  {items.slice(0, 20).map((p, i) => (
                    <View key={p.n} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]}>
                      <Text style={s.miniColNombre}>{tr(p.nombre, 65)}</Text>
                      <Text style={s.miniColSem}>{semLabel(p.estado_semaforo)}</Text>
                      <Text style={s.miniColPct}>{p.pct_avance ?? 0}%</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )
        })}

        {/* ══════════ SECCIÓN VI — INVERSIÓN Y PROYECTOS (GPS) ══════════ */}
        <Text style={s.sectionTitle}>Inversión y Proyectos (GPS)</Text>
        <Text style={s.gpsIntro}>
          {ai?.gps_narrativa
            ? ai.gps_narrativa
            : `La región registra ${seiaTop.length} proyecto${seiaTop.length !== 1 ? 's' : ''} SEIA y ${mopTop.length} obra${mopTop.length !== 1 ? 's' : ''} MOP en el período vigente.`}
        </Text>
        {hasGps && (
          <View>
            <View style={s.tHdr}>
              <Text style={[s.gpsColFuente, s.tHdrTxt]}>Fuente</Text>
              <Text style={[s.gpsColNombre, s.tHdrTxt]}>Proyecto</Text>
              <Text style={[s.gpsColSector, s.tHdrTxt]}>Sector / Servicio</Text>
              <Text style={[s.gpsColInv, s.tHdrTxt]}>Inversión</Text>
              <Text style={[s.gpsColEtapa, s.tHdrTxt]}>Etapa</Text>
            </View>
            {seiaTop.map((p, i) => (
              <View key={`seia-${p.id}`} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]}>
                <Text style={s.gpsColFuente}>SEIA</Text>
                <Text style={s.gpsColNombre}>{tr(p.nombre, 55)}</Text>
                <Text style={s.gpsColSector}>{tr(p.tipo ?? '—', 22)}</Text>
                <Text style={s.gpsColInv}>{fmtSeia(p.inversion_mm)}</Text>
                <Text style={s.gpsColEtapa}>{tr(p.estado ?? '—', 18)}</Text>
              </View>
            ))}
            {mopTop.map((p, i) => (
              <View key={`mop-${p.cod_p}`} style={[s.tRow, (seiaTop.length + i) % 2 === 1 ? s.tRowAlt : {}]}>
                <Text style={s.gpsColFuente}>MOP</Text>
                <Text style={s.gpsColNombre}>{tr(p.nombre, 55)}</Text>
                <Text style={s.gpsColSector}>{tr(p.servicio ?? '—', 22)}</Text>
                <Text style={s.gpsColInv}>{fmtMop(p.inversion_miles)}</Text>
                <Text style={s.gpsColEtapa}>{tr(p.etapa ?? '—', 18)}</Text>
              </View>
            ))}
            <Text style={s.gpsLabel}>Fuente: SEIA — Servicio de Evaluación Ambiental | MOP — Ministerio de Obras Públicas</Text>
          </View>
        )}

        {/* ══════════ SECCIÓN VII — ALERTAS, CAMBIOS Y RECOMENDACIONES ══════════ */}
        {(ai?.alertas_criticas?.length || ai?.cambios_periodo?.length || ai?.recomendaciones?.length || sorted.some(p => p.estado_semaforo === 'rojo')) && (
          <View>
            <Text style={s.sectionTitle}>Alertas y Recomendaciones</Text>

            {/* Alertas */}
            {ai?.alertas_criticas?.length ? (
              ai.alertas_criticas.map((alerta, i) => (
                <View key={i} style={s.alertRow}>
                  <Text style={s.alertMarker}>⚠</Text>
                  <Text style={s.alertText}>{alerta}</Text>
                </View>
              ))
            ) : (
              sorted.filter(p => p.estado_semaforo === 'rojo').slice(0, 5).map((p, i) => (
                <View key={i} style={s.alertRow}>
                  <Text style={s.alertMarker}>⚠</Text>
                  <Text style={s.alertText}>{p.nombre} ({p.ministerio ?? '—'}) — avance {p.pct_avance ?? 0}%</Text>
                </View>
              ))
            )}

            {/* Cambios del periodo */}
            {ai?.cambios_periodo?.length ? (
              <View style={{ marginTop: 6 }}>
                <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: accent, marginBottom: 3 }}>Cambios del periodo</Text>
                {ai.cambios_periodo.map((cambio, i) => (
                  <View key={i} style={{ flexDirection: 'row', marginBottom: 3, paddingLeft: 4 }}>
                    <Text style={{ fontSize: 9, color: accent, marginRight: 6, fontFamily: 'Helvetica-Bold' }}>△</Text>
                    <Text style={{ fontSize: 9, color: C.textDark, lineHeight: 1.4, flex: 1 }}>{cambio}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Recomendaciones */}
            {ai?.recomendaciones?.length ? (
              <View style={{ marginTop: 6 }}>
                <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.recGreen, marginBottom: 3 }}>Recomendaciones</Text>
                {ai.recomendaciones.map((rec, i) => (
                  <View key={i} style={s.recRow}>
                    <Text style={s.recMarker}>→</Text>
                    <Text style={s.recText}>{rec}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        )}

        {/* ══════════ SECCIÓN VIII — PRÓXIMOS HITOS ══════════ */}
        {hitos.length > 0 && (
          <View>
            <Text style={[s.sectionTitle, { color: '#7c3f00' }]}>Próximos Hitos</Text>
            <View style={[s.tHdr, { backgroundColor: '#7c3f00' }]}>
              <Text style={[s.hitosColNombre, s.tHdrTxt]}>Iniciativa</Text>
              <Text style={[s.hitosColHito, s.tHdrTxt]}>Hito</Text>
              <Text style={[s.hitosColFecha, s.tHdrTxt]}>Fecha</Text>
            </View>
            {hitos.map((p, i) => (
              <View key={p.n} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]}>
                <Text style={s.hitosColNombre}>{tr(p.nombre, 45)}</Text>
                <Text style={s.hitosColHito}>{tr(p.proximo_hito ?? '', 45)}</Text>
                <Text style={s.hitosColFecha}>{fmtDate(p.fecha_proximo_hito)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ══════════ ANEXO ══════════ */}
        <Text style={[s.sectionTitle, { marginTop: 18 }]}>Anexo.   Principales indicadores regionales</Text>
        <View style={s.tHdr}>
          <Text style={[s.annexColLabel, s.tHdrTxt]}>Indicador</Text>
          <Text style={[s.annexColValue, s.tHdrTxt, { textAlign: 'right' }]}>Valor regional</Text>
        </View>
        {annexRows.map((r, i) => (
          <View key={i} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]}>
            <Text style={s.annexColLabel}>{r.label}</Text>
            <Text style={s.annexColValue}>{r.val}</Text>
          </View>
        ))}
        {m?.sectores_productivos_principales ? (
          <Text style={[s.placeholder, { paddingTop: 4, paddingLeft: 5 }]}>Sectores productivos: {m.sectores_productivos_principales}</Text>
        ) : null}
        {m?.vocacion_regional ? (
          <Text style={[s.placeholder, { paddingLeft: 5 }]}>Vocación regional: {m.vocacion_regional}</Text>
        ) : null}

        {/* ══════════ FOOTER ══════════ */}
        <View style={s.footer} fixed>
          <View style={s.footerBar} />
          <View style={s.footerRedBar} />
          <Text
            style={s.footerBrand}
            render={({ pageNumber, totalPages }) =>
              `\u2261  GOBIERNO DE CHILE  \u2261    p. ${pageNumber} / ${totalPages}`
            }
          />
        </View>

      </Page>
    </Document>
  )
}
