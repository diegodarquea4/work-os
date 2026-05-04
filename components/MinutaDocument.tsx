import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer'
import type { Iniciativa } from '@/lib/projects'
import type { Region } from '@/lib/regions'
import type { RegionMetrics, SeiaProject, MopProject } from '@/lib/types'
import type { MinutaCompletaContent } from '@/lib/minutaAI'

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
  navy:       '#1a2744',
  red:        '#C8102E',
  ejeHdr:     '#1e3a5f',
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

// ── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily:        'Helvetica',
    fontSize:          9,
    color:             C.textDark,
    paddingTop:        32,
    paddingBottom:     52,
    paddingHorizontal: 44,
  },

  // ── Header ──
  header: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    marginBottom:   8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           10,
  },
  logoPlaceholder: {
    width: 40, height: 40,
    backgroundColor: C.navy,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoPlaceholderText: {
    color: C.white,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.5,
  },
  orgBlock: { justifyContent: 'center' },
  orgBold:  { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.navy },
  orgLight: { fontSize: 7, color: C.textLight, marginTop: 1 },
  headerDate: { fontSize: 8, color: C.textLight, textAlign: 'right' },

  divider: {
    borderBottomWidth: 1.5,
    borderBottomColor: C.navy,
    marginBottom:      12,
  },

  // ── Title block ──
  titleBlock: {
    alignItems:    'center',
    marginBottom:  14,
  },
  titleSupra: {
    fontSize:      7.5,
    color:         C.textLight,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom:  3,
  },
  titleMain: {
    fontSize:      14,
    fontFamily:    'Helvetica-Bold',
    color:         C.navy,
    textTransform: 'uppercase',
    textAlign:     'center',
    marginBottom:  2,
  },
  titleSub: {
    fontSize:   10,
    fontFamily: 'Helvetica-Bold',
    color:      C.textMid,
    textAlign:  'center',
    marginBottom: 2,
  },
  titleMeta: {
    fontSize: 8,
    color:    C.textLight,
    textAlign:'center',
  },

  // ── Resumen box ──
  resumenBox: {
    backgroundColor: C.lightBlue,
    borderLeftWidth: 3,
    borderLeftColor: C.navy,
    paddingHorizontal: 10,
    paddingVertical:    7,
    marginBottom:      14,
  },
  resumenLabel: {
    fontSize:      7.5,
    fontFamily:    'Helvetica-Bold',
    color:         C.navy,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom:  3,
  },
  resumenText: {
    fontSize:   9,
    color:      C.textDark,
    lineHeight: 1.5,
    textAlign:  'justify',
  },

  // ── Section heading ──
  sectionTitle: {
    fontSize:        10,
    fontFamily:      'Helvetica-Bold',
    textDecoration:  'underline',
    color:           C.navy,
    marginTop:       14,
    marginBottom:    7,
  },

  // ── Letter subsections (a. b. c.) ──
  subRow:     { flexDirection: 'row', marginBottom: 9, paddingLeft: 4 },
  subLetter:  { width: 18, fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: C.textDark },
  subContent: { flex: 1 },
  subTitle:   { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: C.textDark, marginBottom: 2 },
  subText:    { fontSize: 9, color: C.textMid, lineHeight: 1.55, textAlign: 'justify' },

  // ── Bullets ──
  bulletRow: { flexDirection: 'row', marginBottom: 3, paddingLeft: 6 },
  bulletDot: { width: 10, fontSize: 9, color: C.textMid },
  bulletText:{ flex: 1, fontSize: 9, color: C.textMid, lineHeight: 1.5 },

  // ── Stats summary table (Section II) ──
  statsHdr: {
    flexDirection:     'row',
    backgroundColor:   C.navy,
    paddingVertical:   3,
    paddingHorizontal: 5,
  },
  statsRow: {
    flexDirection:     'row',
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
    paddingVertical:   2.5,
    paddingHorizontal: 5,
  },
  statsRowAlt:  { backgroundColor: C.bg },
  statsRowTotal:{ backgroundColor: '#e8eef5' },
  statsHdrTxt:  { color: C.white, fontSize: 7.5, fontFamily: 'Helvetica-Bold' },
  statsColEje:  { flex: 1, fontSize: 7.5 },
  statsColN:    { width: '9%',  fontSize: 7.5, textAlign: 'center' },
  statsColPct:  { width: '11%', fontSize: 7.5, textAlign: 'center' },
  statsColR:    { width: '9%',  fontSize: 7.5, textAlign: 'center', color: C.rojo },
  statsColA:    { width: '9%',  fontSize: 7.5, textAlign: 'center', color: C.amber },
  statsColV:    { width: '9%',  fontSize: 7.5, textAlign: 'center', color: C.verde },

  // ── Eje header band ──
  ejeHeader: {
    backgroundColor:  C.ejeHdr,
    paddingVertical:  5,
    paddingHorizontal:8,
    marginTop:        10,
  },
  ejeHeaderText: {
    color:      C.white,
    fontSize:   9,
    fontFamily: 'Helvetica-Bold',
  },
  ejeResumenBox: {
    backgroundColor:   '#EEF3F8',
    paddingHorizontal: 8,
    paddingVertical:   5,
    marginBottom:      3,
  },
  ejeResumenText: {
    fontSize:   8.5,
    color:      C.textMid,
    fontStyle:  'italic',
    lineHeight: 1.5,
  },

  // ── Mini table (eje fallback) ──
  miniHdr: {
    flexDirection:     'row',
    backgroundColor:   '#374151',
    paddingVertical:   3,
    paddingHorizontal: 5,
  },
  miniRow: {
    flexDirection:     'row',
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
    paddingVertical:   2.5,
    paddingHorizontal: 5,
  },
  miniRowAlt:   { backgroundColor: C.bg },
  miniHdrTxt:   { color: C.white, fontSize: 7.5, fontFamily: 'Helvetica-Bold' },
  miniColNombre:{ flex: 1, fontSize: 7.5, paddingRight: 4 },
  miniColSem:   { width: '14%', fontSize: 7.5 },
  miniColPct:   { width: '10%', fontSize: 7.5, textAlign: 'right' },

  // ── GPS table ──
  gpsIntro: {
    fontSize:   9,
    color:      C.textMid,
    lineHeight: 1.5,
    marginBottom: 6,
    textAlign:  'justify',
  },
  gpsHdr: {
    flexDirection:     'row',
    backgroundColor:   '#2d4a6e',
    paddingVertical:   4,
    paddingHorizontal: 4,
    marginTop:         4,
  },
  gpsRow: {
    flexDirection:     'row',
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
    paddingVertical:   3,
    paddingHorizontal: 4,
  },
  gpsRowAlt:  { backgroundColor: C.bg },
  gpsHdrTxt:  { color: C.white, fontSize: 7.5, fontFamily: 'Helvetica-Bold' },
  gpsColFuente:{ width: '9%',  fontSize: 7.5 },
  gpsColNombre:{ flex: 1,      fontSize: 7.5, paddingRight: 4 },
  gpsColSector:{ width: '18%', fontSize: 7.5, paddingRight: 3 },
  gpsColInv:   { width: '15%', fontSize: 7.5, textAlign: 'right' },
  gpsColEtapa: { width: '14%', fontSize: 7.5 },
  gpsLabel: {
    fontSize:  7,
    color:     C.textLight,
    fontStyle: 'italic',
    marginTop: 2,
    marginBottom: 6,
  },

  // ── Alertas / Recomendaciones ──
  alertRow:   { flexDirection: 'row', marginBottom: 4, paddingLeft: 4 },
  alertMarker:{ width: 14, fontSize: 9, color: C.alertRed, fontFamily: 'Helvetica-Bold' },
  alertText:  { flex: 1, fontSize: 9, color: C.textMid },
  recRow:     { flexDirection: 'row', marginBottom: 4, paddingLeft: 4 },
  recMarker:  { width: 14, fontSize: 9, color: C.recGreen, fontFamily: 'Helvetica-Bold' },
  recText:    { flex: 1, fontSize: 9, color: C.textMid },

  // ── Hitos ──
  hitosHdr: {
    flexDirection:     'row',
    backgroundColor:   '#7c3f00',
    paddingVertical:   4,
    paddingHorizontal: 4,
    marginTop:         4,
  },
  hitosRow: {
    flexDirection:     'row',
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
    paddingVertical:   3,
    paddingHorizontal: 4,
  },
  hitosRowAlt:    { backgroundColor: C.bg },
  hitosHdrTxt:    { color: C.white, fontSize: 7.5, fontFamily: 'Helvetica-Bold' },
  hitosColNombre: { flex: 1, fontSize: 7.5, paddingRight: 4 },
  hitosColHito:   { flex: 1, fontSize: 7.5, paddingRight: 4 },
  hitosColFecha:  { width: '14%', fontSize: 7.5, textAlign: 'center' },

  // ── Annex ──
  annexHdr: {
    flexDirection:     'row',
    backgroundColor:   C.navy,
    paddingVertical:   4,
    paddingHorizontal: 5,
    marginTop:         6,
  },
  annexRow: {
    flexDirection:     'row',
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
    paddingVertical:   3,
    paddingHorizontal: 5,
  },
  annexRowAlt:  { backgroundColor: C.bg },
  annexColLabel:{ flex: 1,      fontSize: 8, color: C.textMid },
  annexColValue:{ width: '35%', fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.textDark, textAlign: 'right' },
  annexHdrTxt:  { color: C.white, fontSize: 8, fontFamily: 'Helvetica-Bold' },

  // ── Footer ──
  footer: {
    position: 'absolute',
    bottom:   0,
    left:     0,
    right:    0,
  },
  footerNavy:  { height: 3, backgroundColor: C.navy },
  footerRed:   { height: 3, backgroundColor: C.red },
  footerBrand: {
    fontSize:        7.5,
    fontFamily:      'Helvetica-Bold',
    color:           C.navy,
    textAlign:       'center',
    letterSpacing:   1.5,
    paddingVertical: 3,
    backgroundColor: C.white,
  },

  placeholder: { fontSize: 8.5, color: C.textLight, fontStyle: 'italic' },
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function tr(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}

function n(val?: number | null): string | null {
  if (val == null) return null
  return val.toLocaleString('es-CL')
}

function pct(val?: number | null): string | null {
  if (val == null) return null
  return `${String(val).replace('.', ',')}%`
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
  if (mm >= 1_000) return `USD ${(mm / 1_000).toFixed(1)}B`
  return `USD ${mm.toFixed(0)}M`
}

function fmtMop(miles?: number | null): string {
  if (miles == null) return '—'
  if (miles >= 1_000_000) return `$${(miles / 1_000_000).toFixed(1)}B`
  if (miles >= 1_000)     return `$${(miles / 1_000).toFixed(0)}M`
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

function Bullet({ children }: { children: string }) {
  return (
    <View style={s.bulletRow}>
      <Text style={s.bulletDot}>•</Text>
      <Text style={s.bulletText}>{children}</Text>
    </View>
  )
}

// ── Props ────────────────────────────────────────────────────────────────────

type Props = {
  region:       Region
  projects:     Iniciativa[]
  metrics?:     RegionMetrics | null
  seiaProjects?:SeiaProject[]  | null
  mopProjects?: MopProject[]   | null
  fecha:        string
  aiContent?:   MinutaCompletaContent | null | unknown
}

// ── Component ────────────────────────────────────────────────────────────────

export default function MinutaDocument({
  region, projects, metrics, seiaProjects, mopProjects, fecha, aiContent,
}: Props) {

  const ai = (
    aiContent &&
    typeof aiContent === 'object' &&
    'cifras' in aiContent
  ) ? aiContent as MinutaCompletaContent : null

  const m = metrics ?? null

  // Sort projects by eje number, then prioridad, then n
  const sorted = [...projects].sort((a, b) => {
    const na = ejeNum(a.eje), nb = ejeNum(b.eje)
    if (na !== nb) return na - nb
    if (a.prioridad !== b.prioridad) return a.prioridad === 'Alta' ? -1 : 1
    return a.n - b.n
  })

  const ejes = Array.from(new Set(sorted.map(p => p.eje)))

  // Próximos hitos
  const hitos = sorted
    .filter(p => p.proximo_hito && p.fecha_proximo_hito)
    .sort((a, b) => (a.fecha_proximo_hito ?? '') < (b.fecha_proximo_hito ?? '') ? -1 : 1)
    .slice(0, 10)

  // GPS combined (SEIA top 5 + MOP top 5)
  const seiaTop = (seiaProjects ?? []).slice(0, 5)
  const mopTop  = (mopProjects  ?? []).slice(0, 5)
  const hasGps  = seiaTop.length > 0 || mopTop.length > 0

  // Summary stats
  const totalInit = projects.length
  const avgPct    = totalInit
    ? Math.round(projects.reduce((acc, p) => acc + (p.pct_avance ?? 0), 0) / totalInit)
    : 0
  const totalRojo  = projects.filter(p => p.estado_semaforo === 'rojo').length
  const totalAmbar = projects.filter(p => p.estado_semaforo === 'ambar').length
  const totalVerde = projects.filter(p => p.estado_semaforo === 'verde').length

  // Cifras fallback (from metrics)
  const cifraFallback: { label: string; val: string | null }[] = [
    { label: 'PIB regional',                  val: m?.pib_regional != null ? `${n(m.pib_regional)} MM$` : null },
    { label: '% PIB nacional',                val: pct(m?.pct_pib_nacional) },
    { label: 'Variación actividad económica', val: m?.variacion_interanual != null ? `${m.variacion_interanual}%` : null },
    { label: 'Tasa desocupación',             val: pct(m?.tasa_desocupacion) },
    { label: 'Tasa participación laboral',    val: pct(m?.tasa_participacion_laboral) },
    { label: 'Ocupación informal',            val: pct(m?.tasa_ocupacion_informal) },
    { label: 'Pobreza por ingresos',          val: pct(m?.pct_pobreza_ingresos) },
    { label: 'Pobreza multidimensional',      val: pct(m?.pct_pobreza_multidimensional) },
    { label: 'Déficit habitacional',          val: m?.deficit_habitacional != null ? n(m.deficit_habitacional) : null },
    { label: 'Hogares víctimas DMCS',         val: pct(m?.pct_hogares_victimas_dmcs) },
    { label: 'Sectores productivos',          val: m?.sectores_productivos_principales ?? null },
  ]

  // Annex indicators
  const annexRows: { label: string; val: string }[] = ([
    ['Población total',              m?.poblacion_total      != null ? `${n(m.poblacion_total)} hab.` : '—'],
    ['Superficie (km²)',             m?.superficie_km2        != null ? `${n(m.superficie_km2)} km²` : '—'],
    ['Comunas',                      m?.comunas_n             != null ? String(m.comunas_n) : '—'],
    ['PIB regional (MM$)',           m?.pib_regional          != null ? n(m.pib_regional) ?? '—' : '—'],
    ['% PIB nacional',               pct(m?.pct_pib_nacional) ?? '—'],
    ['Variación actividad económica',m?.variacion_interanual  != null ? `${m.variacion_interanual}%` : '—'],
    ['Tasa desocupación',            pct(m?.tasa_desocupacion) ?? '—'],
    ['Participación laboral',        pct(m?.tasa_participacion_laboral) ?? '—'],
    ['Ocupación informal',           pct(m?.tasa_ocupacion_informal) ?? '—'],
    ['Pobreza por ingresos',         pct(m?.pct_pobreza_ingresos) ?? '—'],
    ['Pobreza extrema',              pct(m?.pct_pobreza_extrema) ?? '—'],
    ['Pobreza multidimensional',     pct(m?.pct_pobreza_multidimensional) ?? '—'],
    ['Déficit habitacional',         m?.deficit_habitacional  != null ? n(m.deficit_habitacional) ?? '—' : '—'],
    ['Hacinamiento (%)',             pct(m?.pct_hacinamiento) ?? '—'],
    ['Lista de espera (salud)',      m?.lista_espera_n        != null ? n(m.lista_espera_n) ?? '—' : '—'],
    ['Camas hosp. / 1.000 hab.',     m?.camas_por_1000_hab    != null ? String(m.camas_por_1000_hab) : '—'],
    ['Población FONASA (%)',         pct(m?.pct_fonasa) ?? '—'],
    ['Años escolaridad promedio',    m?.anios_escolaridad_promedio != null ? `${m.anios_escolaridad_promedio} años` : '—'],
    ['Alfabetismo',                  pct(m?.tasa_alfabetismo) ?? '—'],
    ['Hogares víctimas DMCS',        pct(m?.pct_hogares_victimas_dmcs) ?? '—'],
    ['Percepción de inseguridad',    pct(m?.pct_percepcion_inseguridad) ?? '—'],
    ['Tasa denuncias / 100k hab.',   m?.tasa_denuncias_100k   != null ? String(m.tasa_denuncias_100k) : '—'],
  ] as [string, string][]).map(([label, val]) => ({ label, val }))

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* HEADER                                                              */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <View style={s.logoPlaceholder}>
              <Text style={s.logoPlaceholderText}>GOB</Text>
            </View>
            <View style={s.orgBlock}>
              <Text style={s.orgBold}>Ministerio del Interior y Seguridad Pública</Text>
              <Text style={s.orgLight}>División de Coordinación Interregional</Text>
              <Text style={s.orgLight}>República de Chile</Text>
            </View>
          </View>
          <Text style={s.headerDate}>{fecha}</Text>
        </View>
        <View style={s.divider} />

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TITLE BLOCK                                                         */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <View style={s.titleBlock}>
          <Text style={s.titleSupra}>Informe de Avances</Text>
          <Text style={s.titleMain}>Plan Regional de Gobierno</Text>
          <Text style={s.titleSub}>{regionFullName(region).toUpperCase()}</Text>
          <Text style={s.titleMeta}>
            Actualizado al {fecha}  ·  {totalInit} iniciativas  ·  {avgPct}% avance promedio
          </Text>
        </View>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* RESUMEN EJECUTIVO (AI)                                              */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {ai?.resumen_ejecutivo ? (
          <View style={s.resumenBox}>
            <Text style={s.resumenLabel}>Resumen</Text>
            <Text style={s.resumenText}>{ai.resumen_ejecutivo}</Text>
          </View>
        ) : null}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* COMPROMISOS DEL PLAN REGIONAL (AI — extraídos del PDF)             */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {ai?.compromisos_plan?.length ? (
          <View>
            <Text style={[s.sectionTitle, { marginTop: 4 }]}>
              Compromisos del Plan Regional de Gobierno
            </Text>
            {ai.compromisos_plan.map((c, i) => (
              <Bullet key={i}>{c}</Bullet>
            ))}
          </View>
        ) : null}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* I. PRINCIPALES CIFRAS EN LA REGIÓN                                 */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <Text style={s.sectionTitle}>I.   Principales cifras en la región</Text>

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
        ) : (
          <View>
            {cifraFallback.filter(r => r.val !== null).map((r, i) => (
              <Bullet key={i}>{`${r.label}: ${r.val}`}</Bullet>
            ))}
            {cifraFallback.every(r => r.val === null) && (
              <Text style={s.placeholder}>
                Indicadores socioeconómicos no disponibles para esta región.
              </Text>
            )}
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* I-bis. TENDENCIAS Y POSICIÓN NACIONAL (new)                         */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {(ai?.tendencias || ai?.posicion_nacional) && (
          <View>
            <Text style={s.sectionTitle}>{ai?.tendencias?.titulo ?? 'Tendencias y Evolución'}</Text>
            {ai?.tendencias?.texto && (
              <View style={{ backgroundColor: C.lightBlue, padding: 10, borderLeftWidth: 3, borderLeftColor: C.navy, marginBottom: 6, borderRadius: 2 }}>
                <Text style={{ fontSize: 9, color: C.textDark, lineHeight: 1.5 }}>{ai.tendencias.texto}</Text>
              </View>
            )}
            {ai?.posicion_nacional && (
              <Text style={{ fontSize: 9, color: C.textMid, lineHeight: 1.5, marginBottom: 8 }}>{ai.posicion_nacional}</Text>
            )}
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* II. ESTADO DEL PLAN REGIONAL                                        */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <Text style={s.sectionTitle}>II.   Estado del Plan Regional</Text>

        <View>
          {/* Header row */}
          <View style={s.statsHdr}>
            <Text style={[s.statsColEje, s.statsHdrTxt]}>Eje Estratégico</Text>
            <Text style={[s.statsColN,   s.statsHdrTxt, { textAlign: 'center' }]}>N°</Text>
            <Text style={[s.statsColPct, s.statsHdrTxt, { textAlign: 'center' }]}>Avance</Text>
            <Text style={[s.statsColR,   s.statsHdrTxt, { color: C.white }]}>Rojo</Text>
            <Text style={[s.statsColA,   s.statsHdrTxt, { color: C.white }]}>Ámbar</Text>
            <Text style={[s.statsColV,   s.statsHdrTxt, { color: C.white }]}>Verde</Text>
          </View>

          {ejes.map((eje, i) => {
            const items = sorted.filter(p => p.eje === eje)
            const r     = items.filter(p => p.estado_semaforo === 'rojo').length
            const a     = items.filter(p => p.estado_semaforo === 'ambar').length
            const v     = items.filter(p => p.estado_semaforo === 'verde').length
            const avg   = Math.round(items.reduce((acc, p) => acc + (p.pct_avance ?? 0), 0) / items.length)
            return (
              <View key={eje} style={[s.statsRow, i % 2 === 1 ? s.statsRowAlt : {}]}>
                <Text style={s.statsColEje}>{tr(eje, 52)}</Text>
                <Text style={[s.statsColN,  { textAlign: 'center' }]}>{items.length}</Text>
                <Text style={[s.statsColPct,{ textAlign: 'center' }]}>{avg}%</Text>
                <Text style={s.statsColR}>{r > 0 ? r : '—'}</Text>
                <Text style={s.statsColA}>{a > 0 ? a : '—'}</Text>
                <Text style={s.statsColV}>{v > 0 ? v : '—'}</Text>
              </View>
            )
          })}

          {/* Total row */}
          <View style={[s.statsRow, s.statsRowTotal]}>
            <Text style={[s.statsColEje, { fontFamily: 'Helvetica-Bold' }]}>TOTAL</Text>
            <Text style={[s.statsColN,   { textAlign: 'center', fontFamily: 'Helvetica-Bold' }]}>{totalInit}</Text>
            <Text style={[s.statsColPct, { textAlign: 'center', fontFamily: 'Helvetica-Bold' }]}>{avgPct}%</Text>
            <Text style={[s.statsColR,   { fontFamily: 'Helvetica-Bold' }]}>{totalRojo  > 0 ? totalRojo  : '—'}</Text>
            <Text style={[s.statsColA,   { fontFamily: 'Helvetica-Bold' }]}>{totalAmbar > 0 ? totalAmbar : '—'}</Text>
            <Text style={[s.statsColV,   { fontFamily: 'Helvetica-Bold' }]}>{totalVerde > 0 ? totalVerde : '—'}</Text>
          </View>
        </View>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* III. PRINCIPALES AVANCES DEL PLAN                                  */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <Text style={s.sectionTitle}>III.   Principales avances del Plan</Text>

        {ejes.map(eje => {
          const items  = sorted.filter(p => p.eje === eje)
          const r      = items.filter(p => p.estado_semaforo === 'rojo').length
          const a      = items.filter(p => p.estado_semaforo === 'ambar').length
          const v      = items.filter(p => p.estado_semaforo === 'verde').length
          const avg    = Math.round(items.reduce((acc, p) => acc + (p.pct_avance ?? 0), 0) / items.length)
          // Normalized lookup (handles minor name differences between AI output and data)
          const aiEje  = ai?.avances_ejes?.[eje] ??
            Object.entries(ai?.avances_ejes ?? {})
              .find(([k]) => k.toLowerCase().trim() === eje.toLowerCase().trim())?.[1]

          return (
            <View key={eje}>
              {/* Eje band */}
              <View style={s.ejeHeader}>
                <Text style={s.ejeHeaderText}>
                  {eje.toUpperCase()}  ·  {items.length} iniciativas  ·  {avg}% avance promedio
                  {r > 0 ? `  ·  ${r} rojo`  : ''}
                  {a > 0 ? `  ·  ${a} ámbar` : ''}
                  {v > 0 ? `  ·  ${v} verde` : ''}
                </Text>
              </View>

              {/* AI resumen italics */}
              {aiEje?.resumen ? (
                <View style={s.ejeResumenBox}>
                  <Text style={s.ejeResumenText}>{aiEje.resumen}</Text>
                </View>
              ) : null}

              {/* AI logros bullets OR fallback mini table */}
              {aiEje?.logros?.length ? (
                <View style={{ paddingLeft: 4, paddingTop: 3, paddingBottom: 6 }}>
                  {aiEje.logros.map((logro, i) => (
                    <Bullet key={i}>{logro}</Bullet>
                  ))}
                </View>
              ) : (
                <View>
                  <View style={s.miniHdr}>
                    <Text style={[s.miniColNombre, s.miniHdrTxt]}>Iniciativa</Text>
                    <Text style={[s.miniColSem,    s.miniHdrTxt]}>Estado</Text>
                    <Text style={[s.miniColPct,    s.miniHdrTxt]}>Avance</Text>
                  </View>
                  {items.slice(0, 20).map((p, i) => (
                    <View key={p.n} style={[s.miniRow, i % 2 === 1 ? s.miniRowAlt : {}]}>
                      <Text style={s.miniColNombre}>{tr(p.nombre, 65)}</Text>
                      <Text style={s.miniColSem}>{semLabel(p.estado_semaforo)}</Text>
                      <Text style={s.miniColPct}>{p.pct_avance ?? 0}%</Text>
                    </View>
                  ))}
                  {items.length > 20 && (
                    <Text style={[s.placeholder, { paddingLeft: 5, paddingTop: 2 }]}>
                      … y {items.length - 20} iniciativas adicionales
                    </Text>
                  )}
                </View>
              )}
            </View>
          )
        })}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* IV. PROYECTOS DE INVERSIÓN PRIVADA (GPS)                            */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <Text style={s.sectionTitle}>IV.   Proyectos de Inversión Privada (GPS)</Text>

        <Text style={s.gpsIntro}>
          {ai?.gps_narrativa
            ? ai.gps_narrativa
            : `La región registra ${seiaTop.length} proyecto${seiaTop.length !== 1 ? 's' : ''} en evaluación ambiental (SEIA) y ${mopTop.length} obra${mopTop.length !== 1 ? 's' : ''} del Ministerio de Obras Públicas (MOP) en el período vigente.`}
        </Text>

        {hasGps ? (
          <View>
            <View style={s.gpsHdr}>
              <Text style={[s.gpsColFuente, s.gpsHdrTxt]}>Fuente</Text>
              <Text style={[s.gpsColNombre, s.gpsHdrTxt]}>Proyecto</Text>
              <Text style={[s.gpsColSector, s.gpsHdrTxt]}>Sector / Servicio</Text>
              <Text style={[s.gpsColInv,    s.gpsHdrTxt]}>Inversión</Text>
              <Text style={[s.gpsColEtapa,  s.gpsHdrTxt]}>Etapa</Text>
            </View>
            {seiaTop.map((p, i) => (
              <View key={`seia-${p.id}`} style={[s.gpsRow, i % 2 === 1 ? s.gpsRowAlt : {}]}>
                <Text style={s.gpsColFuente}>SEIA</Text>
                <Text style={s.gpsColNombre}>{tr(p.nombre, 55)}</Text>
                <Text style={s.gpsColSector}>{tr(p.tipo ?? '—', 22)}</Text>
                <Text style={s.gpsColInv}>{fmtSeia(p.inversion_mm)}</Text>
                <Text style={s.gpsColEtapa}>{tr(p.estado ?? '—', 18)}</Text>
              </View>
            ))}
            {mopTop.map((p, i) => (
              <View key={`mop-${p.cod_p}`} style={[s.gpsRow, (seiaTop.length + i) % 2 === 1 ? s.gpsRowAlt : {}]}>
                <Text style={s.gpsColFuente}>MOP</Text>
                <Text style={s.gpsColNombre}>{tr(p.nombre, 55)}</Text>
                <Text style={s.gpsColSector}>{tr(p.servicio ?? '—', 22)}</Text>
                <Text style={s.gpsColInv}>{fmtMop(p.inversion_miles)}</Text>
                <Text style={s.gpsColEtapa}>{tr(p.etapa ?? '—', 18)}</Text>
              </View>
            ))}
            <Text style={s.gpsLabel}>
              Fuente: SEIA — Servicio de Evaluación Ambiental | MOP — Ministerio de Obras Públicas
            </Text>
          </View>
        ) : (
          <Text style={s.placeholder}>
            Sin proyectos de inversión privada registrados para esta región.
          </Text>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* V-pre. CAMBIOS DEL PERIODO (new)                                    */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {ai?.cambios_periodo?.length ? (
          <View>
            <Text style={s.sectionTitle}>Cambios del Periodo</Text>
            {ai.cambios_periodo.map((cambio, i) => (
              <View key={i} style={{ flexDirection: 'row', marginBottom: 3, paddingLeft: 4 }}>
                <Text style={{ fontSize: 9, color: C.navy, marginRight: 6, fontFamily: 'Helvetica-Bold' }}>△</Text>
                <Text style={{ fontSize: 9, color: C.textDark, lineHeight: 1.4, flex: 1 }}>{cambio}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* V. ALERTAS Y RECOMENDACIONES                                        */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {(ai?.alertas_criticas?.length || ai?.recomendaciones?.length || sorted.some(p => p.estado_semaforo === 'rojo')) ? (
          <View>
            <Text style={s.sectionTitle}>V.   Alertas y Recomendaciones</Text>

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
                  <Text style={s.alertText}>
                    {p.nombre} ({p.ministerio ?? '—'}) — avance {p.pct_avance ?? 0}%
                    {p.etapa_actual ? `, etapa: ${p.etapa_actual}` : ''}
                  </Text>
                </View>
              ))
            )}

            {ai?.recomendaciones?.length ? (
              <View style={{ marginTop: 6 }}>
                {ai.recomendaciones.map((rec, i) => (
                  <View key={i} style={s.recRow}>
                    <Text style={s.recMarker}>→</Text>
                    <Text style={s.recText}>{rec}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* PRÓXIMOS HITOS                                                      */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {hitos.length > 0 && (
          <View>
            <Text style={[s.sectionTitle, { color: '#7c3f00' }]}>Próximos Hitos</Text>
            <View style={s.hitosHdr}>
              <Text style={[s.hitosColNombre, s.hitosHdrTxt]}>Iniciativa</Text>
              <Text style={[s.hitosColHito,   s.hitosHdrTxt]}>Hito</Text>
              <Text style={[s.hitosColFecha,  s.hitosHdrTxt]}>Fecha</Text>
            </View>
            {hitos.map((p, i) => (
              <View key={p.n} style={[s.hitosRow, i % 2 === 1 ? s.hitosRowAlt : {}]}>
                <Text style={s.hitosColNombre}>{tr(p.nombre, 45)}</Text>
                <Text style={s.hitosColHito}>{tr(p.proximo_hito ?? '', 45)}</Text>
                <Text style={s.hitosColFecha}>{fmtDate(p.fecha_proximo_hito)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* ANEXO: INDICADORES REGIONALES                                       */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <Text style={[s.sectionTitle, { marginTop: 18 }]}>
          Anexo.   Principales indicadores regionales
        </Text>
        <View style={s.annexHdr}>
          <Text style={[s.annexColLabel, s.annexHdrTxt]}>Indicador</Text>
          <Text style={[s.annexColValue, s.annexHdrTxt, { textAlign: 'right' }]}>Valor regional</Text>
        </View>
        {annexRows.map((r, i) => (
          <View key={i} style={[s.annexRow, i % 2 === 1 ? s.annexRowAlt : {}]}>
            <Text style={s.annexColLabel}>{r.label}</Text>
            <Text style={s.annexColValue}>{r.val}</Text>
          </View>
        ))}
        {m?.sectores_productivos_principales ? (
          <Text style={[s.placeholder, { paddingTop: 4, paddingLeft: 5 }]}>
            Sectores productivos: {m.sectores_productivos_principales}
          </Text>
        ) : null}
        {m?.vocacion_regional ? (
          <Text style={[s.placeholder, { paddingLeft: 5 }]}>
            Vocación regional: {m.vocacion_regional}
          </Text>
        ) : null}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* FOOTER (fixed — aparece en todas las páginas)                       */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <View style={s.footer} fixed>
          <View style={s.footerNavy} />
          <View style={s.footerRed} />
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
