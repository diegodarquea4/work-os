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

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#1a1a1a',
    paddingTop: 50,
    paddingBottom: 60,
    paddingHorizontal: 60,
    lineHeight: 1.5,
  },

  // Header institucional
  headerBand: {
    backgroundColor: '#1a2744',
    paddingVertical: 10,
    paddingHorizontal: 60,
    marginBottom: 0,
    marginHorizontal: -60,
  },
  headerRepublica: {
    fontSize: 7.5,
    color: '#a0aec0',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  headerMinisterio: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
    letterSpacing: 0.3,
    marginBottom: 1,
  },
  headerDivision: {
    fontSize: 8,
    color: '#90cdf4',
    marginBottom: 0,
  },
  divider: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#cbd5e0',
    marginTop: 14,
    marginBottom: 12,
  },

  // Bloque título de la minuta
  minutaBlock: {
    marginBottom: 12,
  },
  minutaLabel: {
    fontSize: 8,
    color: '#718096',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 3,
  },
  minutaTitle: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#1a2744',
    marginBottom: 2,
  },
  minutaSubtitle: {
    fontSize: 9,
    color: '#4a5568',
    marginBottom: 0,
  },

  // Ficha técnica de la región
  fichaBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#f7fafc',
    borderWidth: 0.5,
    borderColor: '#cbd5e0',
    borderRadius: 3,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginBottom: 16,
    gap: 0,
  },
  fichaItem: {
    width: '33%',
    marginBottom: 5,
  },
  fichaLabel: {
    fontSize: 7,
    color: '#718096',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 1,
  },
  fichaValue: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#1a202c',
  },

  // Párrafo introductorio
  intro: {
    fontSize: 10,
    marginBottom: 16,
    textAlign: 'justify',
  },

  // Secciones
  sectionTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    textDecoration: 'underline',
    marginTop: 14,
    marginBottom: 6,
  },

  // Bullet items
  bulletRow: {
    flexDirection: 'row',
    marginBottom: 3,
    paddingLeft: 10,
  },
  bulletDot: {
    width: 14,
    color: '#444',
  },
  bulletText: {
    flex: 1,
    fontSize: 10,
  },

  // Placeholder (sin dato)
  placeholder: {
    color: '#888',
    fontStyle: 'italic',
  },

  // Tabla compacta (SEIA / MOP)
  compactHeader: {
    flexDirection: 'row',
    backgroundColor: '#3a3a3a',
    color: '#fff',
    paddingVertical: 4,
    paddingHorizontal: 4,
    marginTop: 6,
  },
  compactRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#e0e0e0',
    paddingVertical: 3,
    paddingHorizontal: 4,
  },
  compactRowAlt: { backgroundColor: '#f7f7f7' },
  colNombre:    { flex: 1,      fontSize: 7, paddingRight: 4 },
  colEstado:    { width: '18%', fontSize: 7 },
  colInversion: { width: '15%', fontSize: 7, textAlign: 'right' },
  colFecha:     { width: '13%', fontSize: 7, textAlign: 'center' },
  colServicio:  { width: '22%', fontSize: 7, paddingRight: 4 },
  colEtapa:     { width: '14%', fontSize: 7 },
  compactHeaderText: { color: '#fff', fontSize: 7, fontFamily: 'Helvetica-Bold' },
  subNote: { fontSize: 8, color: '#555', fontStyle: 'italic', marginBottom: 4 },

  // Tabla resumen por eje
  summaryHeader: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    paddingVertical: 4,
    paddingHorizontal: 5,
    marginTop: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#e0e0e0',
    paddingVertical: 4,
    paddingHorizontal: 5,
  },
  summaryRowAlt: { backgroundColor: '#f7f7f7' },
  sumColEje:     { flex: 1,      fontSize: 8, paddingRight: 4 },
  sumColTotal:   { width: '8%',  fontSize: 8, textAlign: 'center' },
  sumColSem:     { width: '8%',  fontSize: 8, textAlign: 'center' },
  sumColAvance:  { width: '12%', fontSize: 8, textAlign: 'center' },
  summaryHeaderText: { color: '#fff', fontSize: 8, fontFamily: 'Helvetica-Bold' },

  // Detalle agrupado por eje
  ejeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2d3748',
    paddingVertical: 5,
    paddingHorizontal: 6,
    marginTop: 10,
  },
  ejeHeaderText: {
    color: '#ffffff',
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    flex: 1,
  },
  ejeHeaderCount: {
    color: '#cbd5e0',
    fontSize: 8,
  },
  detailRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#e8e8e8',
    paddingVertical: 4,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  detailRowAlt: { backgroundColor: '#f9f9f9' },
  detColGob:     { width: '13%', fontSize: 8 },
  detColSem:     { width: '15%', fontSize: 8 },
  detColNombre:  { flex: 1,      fontSize: 8, paddingRight: 4 },
  detColPrior:   { width: '10%', fontSize: 8, textAlign: 'center' },
  detColAvance:  { width: '9%',  fontSize: 8, textAlign: 'center' },
  tableHeaderText: { color: '#fff', fontSize: 8, fontFamily: 'Helvetica-Bold' },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 60,
    right: 60,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: '#bbb',
    paddingTop: 6,
  },
  footerText: {
    fontSize: 8,
    color: '#888',
  },
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function Bullet({ children }: { children: string }) {
  return (
    <View style={s.bulletRow}>
      <Text style={s.bulletDot}>•</Text>
      <Text style={s.bulletText}>{children}</Text>
    </View>
  )
}

function DataBullet({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === '') {
    return (
      <View style={s.bulletRow}>
        <Text style={s.bulletDot}>•</Text>
        <Text style={[s.bulletText, s.placeholder]}>{label}: [sin datos]</Text>
      </View>
    )
  }
  return (
    <View style={s.bulletRow}>
      <Text style={s.bulletDot}>•</Text>
      <Text style={s.bulletText}>{label}: {value}</Text>
    </View>
  )
}

function SectionTitle({ num, title }: { num: string; title: string }) {
  return (
    <Text style={s.sectionTitle}>
      {num}.   {title}
    </Text>
  )
}

// Official full region name: most use "Región de X", exceptions handled explicitly
function regionFullName(region: Region): string {
  const OVERRIDES: Record<string, string> = {
    RM:   'Región Metropolitana de Santiago',
    XI:   'Región de Aysén del General Carlos Ibáñez del Campo',
    XII:  'Región de Magallanes y de la Antártica Chilena',
  }
  return OVERRIDES[region.cod] ?? `Región de ${region.nombre}`
}

// Format number with thousands separator (e.g. 1234567 → "1.234.567")
function n(val: number | null | undefined): string | null {
  if (val === null || val === undefined) return null
  return val.toLocaleString('es-CL')
}

// Format percentage (e.g. 12.5 → "12,5%")
function pct(val: number | null | undefined): string | null {
  if (val === null || val === undefined) return null
  return `${String(val).replace('.', ',')}%`
}

function truncStr(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s
}

function fmtMesAnio(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso + 'T12:00:00')
  return new Intl.DateTimeFormat('es-CL', { month: 'short', year: 'numeric' }).format(d)
}

function fmtInversionSeia(mm: number | null | undefined): string {
  if (mm === null || mm === undefined) return '—'
  if (mm >= 1000) return `$${(mm / 1000).toFixed(1)} MM MM$`
  return `$${mm.toFixed(1)} MM$`
}

function fmtInversionMop(miles: number | null | undefined): string {
  if (miles === null || miles === undefined) return '—'
  if (miles >= 1_000_000) return `$${(miles / 1_000_000).toFixed(1)} MM MM$`
  if (miles >= 1_000)     return `$${(miles / 1_000).toFixed(0)} M MM$`
  return `$${miles.toLocaleString('es-CL')} miles`
}

function abrevServicio(s: string | null | undefined): string {
  if (!s) return '—'
  return s.replace('Dirección de ', 'Dir. ').replace('Subdirección de ', 'Sub. ')
}

// Semáforo text indicator for PDF (no colors in react-pdf without SVG)
function semLabel(sem: string | null): string {
  if (sem === 'verde') return '● Verde'
  if (sem === 'ambar') return '◑ Ambar'
  if (sem === 'rojo')  return '○ Rojo'
  return '  —'
}

// Short eje label: strip "Eje N: " prefix if present
function ejeShort(eje: string): string {
  return eje.replace(/^Eje \d+:\s*/i, '')
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
type Props = {
  region: Region
  projects: Iniciativa[]
  metrics?: RegionMetrics | null
  seiaProjects?: SeiaProject[] | null
  mopProjects?: MopProject[] | null
  fecha: string  // e.g. "Abril 2026"
}

const EJE_PRIORITY_ORDER = [
  'Eje 1: Infraestructura y Conectividad',
  'Eje 2: Energía y Medio Ambiente',
  'Eje 3: Salud y Servicios Básicos',
  'Eje 4: Seguridad y Soberanía',
  'Eje 5: Desarrollo Productivo e Innovación',
  'Eje 6: Familia, Educación y Equidad Territorial',
]

export default function MinutaDocument({ region, projects, metrics, seiaProjects, mopProjects, fecha }: Props) {
  const alta  = projects.filter(p => p.prioridad === 'Alta')
  const media = projects.filter(p => p.prioridad === 'Media')
  const m = metrics ?? null

  // Sort by eje order first, then Alta before Media within each eje
  const sorted = [...projects].sort((a, b) => {
    const ejeA = EJE_PRIORITY_ORDER.indexOf(a.eje)
    const ejeB = EJE_PRIORITY_ORDER.indexOf(b.eje)
    if (ejeA !== ejeB) return (ejeA === -1 ? 999 : ejeA) - (ejeB === -1 ? 999 : ejeB)
    if (a.prioridad !== b.prioridad) return a.prioridad === 'Alta' ? -1 : 1
    return a.n - b.n
  })

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Header institucional ── */}
        <View style={s.headerBand}>
          <Text style={s.headerRepublica}>República de Chile</Text>
          <Text style={s.headerMinisterio}>Ministerio del Interior y Seguridad Pública</Text>
          <Text style={s.headerDivision}>División de Coordinación Interregional</Text>
        </View>

        <View style={s.divider} />

        {/* ── Título del documento ── */}
        <View style={s.minutaBlock}>
          <Text style={s.minutaLabel}>Minuta Ejecutiva · Uso Interno</Text>
          <Text style={s.minutaTitle}>{regionFullName(region)}</Text>
          <Text style={s.minutaSubtitle}>Informe de Prioridades Territoriales 2026–2028  ·  {fecha}</Text>
        </View>

        {/* ── Ficha técnica de la región ── */}
        <View style={s.fichaBox}>
          <View style={s.fichaItem}>
            <Text style={s.fichaLabel}>Capital regional</Text>
            <Text style={s.fichaValue}>{region.capital}</Text>
          </View>
          <View style={s.fichaItem}>
            <Text style={s.fichaLabel}>Zona</Text>
            <Text style={s.fichaValue}>{region.zona}</Text>
          </View>
          {m?.superficie_km2 != null && (
            <View style={s.fichaItem}>
              <Text style={s.fichaLabel}>Superficie</Text>
              <Text style={s.fichaValue}>{n(m.superficie_km2)} km²</Text>
            </View>
          )}
          {m?.poblacion_total != null && (
            <View style={s.fichaItem}>
              <Text style={s.fichaLabel}>Población (Censo 2024)</Text>
              <Text style={s.fichaValue}>{n(m.poblacion_total)} hab.</Text>
            </View>
          )}
          {m?.comunas_n != null && (
            <View style={s.fichaItem}>
              <Text style={s.fichaLabel}>Comunas</Text>
              <Text style={s.fichaValue}>{m.comunas_n}</Text>
            </View>
          )}
          <View style={s.fichaItem}>
            <Text style={s.fichaLabel}>Prioridades territoriales</Text>
            <Text style={s.fichaValue}>{projects.length} iniciativas</Text>
          </View>
        </View>

        {/* ── Intro ── */}
        <Text style={s.intro}>
          La presente minuta resume el estado de avance de las prioridades territoriales de la
          {regionFullName(region)} para el período 2026–2028, junto con indicadores
          socioeconómicos y proyectos de inversión pública relevantes en la región.
        </Text>

        {/* ── I. Geográficos ── */}
        <SectionTitle num="I" title="Geográficos" />
        <DataBullet label="Superficie total (km²)" value={m?.superficie_km2 != null ? n(m.superficie_km2) : null} />
        <DataBullet label="% del territorio nacional" value={pct(m?.pct_territorio_nacional)} />
        <Bullet>{`Capital regional: ${region.capital}`}</Bullet>
        <DataBullet label="Número de provincias" value={m?.provincias_n} />
        <DataBullet label="Número de comunas" value={m?.comunas_n} />

        {/* ── II. Demográficos ── */}
        <SectionTitle num="II" title="Demográficos" />
        <DataBullet label="Población total (Censo 2024)" value={m?.poblacion_total != null ? n(m.poblacion_total) : null} />
        <DataBullet label="Densidad poblacional (hab/km²)" value={m?.densidad_poblacional} />
        <DataBullet label="% población urbana / rural" value={m?.pct_urbana != null && m?.pct_rural != null ? `${pct(m.pct_urbana)} / ${pct(m.pct_rural)}` : null} />
        <DataBullet label="Promedio de edad" value={m?.promedio_edad != null ? `${m.promedio_edad} años` : null} />
        <DataBullet label="% población inmigrante" value={pct(m?.pct_inmigrantes)} />
        <DataBullet label="% perteneciente a pueblo indígena" value={pct(m?.pct_indigena)} />

        {/* ── III. Población Vulnerable ── */}
        <SectionTitle num="III" title="Población Vulnerable" />
        <DataBullet label="Pobreza por ingresos (%)" value={pct(m?.pct_pobreza_ingresos)} />
        <DataBullet label="Pobreza extrema (%)" value={pct(m?.pct_pobreza_extrema)} />
        <DataBullet label="Pobreza multidimensional (%)" value={pct(m?.pct_pobreza_multidimensional)} />
        <DataBullet label="Pobreza severa (%)" value={pct(m?.pct_pobreza_severa)} />
        <DataBullet label="% hogares en tramo 40 del RSH" value={pct(m?.pct_rsh_tramo40)} />

        {/* ── IV. Economía ── */}
        <SectionTitle num="IV" title="Economía" />
        <DataBullet label="PIB regional (miles de millones de pesos)" value={m?.pib_regional != null ? n(m.pib_regional) : null} />
        <DataBullet label="% del PIB nacional" value={pct(m?.pct_pib_nacional)} />
        <DataBullet label="Variación interanual actividad económica" value={m?.variacion_interanual != null ? `${m.variacion_interanual}%` : null} />
        <DataBullet label="Tasa de desocupación (%)" value={pct(m?.tasa_desocupacion)} />
        <DataBullet label="Tasa de participación laboral (%)" value={pct(m?.tasa_participacion_laboral)} />
        <DataBullet label="Tasa de ocupación informal (%)" value={pct(m?.tasa_ocupacion_informal)} />
        {m?.sectores_productivos_principales ? (
          <Bullet>{`Sectores productivos: ${m.sectores_productivos_principales}`}</Bullet>
        ) : (
          <DataBullet label="Sectores productivos principales" value={null} />
        )}
        {m?.vocacion_regional ? (
          <Bullet>{`Vocación regional: ${m.vocacion_regional}`}</Bullet>
        ) : null}

        {/* ── V. Educación ── */}
        <SectionTitle num="V" title="Educación" />
        <DataBullet label="Años de escolaridad promedio" value={m?.anios_escolaridad_promedio != null ? `${m.anios_escolaridad_promedio} años` : null} />
        <DataBullet label="Tasa de alfabetismo (15 años o más)" value={pct(m?.tasa_alfabetismo)} />
        <DataBullet label="Matrícula escolar total" value={m?.matricula_escolar_total != null ? n(m.matricula_escolar_total) : null} />
        <DataBullet label="Cobertura educación parvularia (%)" value={pct(m?.cobertura_parvularia_pct)} />

        {/* ── VI. Salud ── */}
        <SectionTitle num="VI" title="Salud" />
        <DataBullet label="Población FONASA (%)" value={pct(m?.pct_fonasa)} />
        <DataBullet label="Hospitales / establecimientos hospitalarios" value={m?.hospitales_n} />
        <DataBullet label="Camas hospitalarias por 1.000 hab." value={m?.camas_por_1000_hab} />
        <DataBullet label="Lista de espera (N° personas)" value={m?.lista_espera_n != null ? n(m.lista_espera_n) : null} />

        {/* ── VII. Vivienda ── */}
        <SectionTitle num="VII" title="Vivienda" />
        <DataBullet label="Déficit habitacional" value={m?.deficit_habitacional != null ? n(m.deficit_habitacional) : null} />
        <DataBullet label="Hogares con hacinamiento (%)" value={pct(m?.pct_hacinamiento)} />
        <DataBullet label="% acceso a red pública de agua" value={pct(m?.pct_acceso_agua_publica)} />

        {/* ── VIII. Seguridad ── */}
        <SectionTitle num="VIII" title="Seguridad" />
        <DataBullet label="Hogares víctimas DMCS (%)" value={pct(m?.pct_hogares_victimas_dmcs)} />
        <DataBullet label="Percepción de inseguridad (%)" value={pct(m?.pct_percepcion_inseguridad)} />
        <DataBullet label="Tasa de denuncias por 100.000 hab." value={m?.tasa_denuncias_100k} />
        <DataBullet label="Tasa de registro delitos por 100.000 hab." value={m?.tasa_delitos_100k} />

        {/* ── IX. Prioridades Territoriales ── */}
        <SectionTitle num="IX" title="Prioridades Territoriales 2026–2028" />
        <Bullet>{`Total: ${projects.length} iniciativas (${alta.length} alta prioridad, ${media.length} media)`}</Bullet>

        {/* ── IX-A. Tabla resumen ejecutivo por eje ── */}
        <Text style={[s.sectionTitle, { fontSize: 9, marginTop: 10 }]}>
          Resumen por Eje Estratégico
        </Text>
        <View style={s.summaryHeader}>
          <Text style={[s.sumColEje,    s.summaryHeaderText]}>Eje Regional</Text>
          <Text style={[{ width: '13%', fontSize: 8 }, s.summaryHeaderText]}>Eje Gobierno</Text>
          <Text style={[s.sumColTotal,  s.summaryHeaderText]}>Total</Text>
          <Text style={[s.sumColSem,    s.summaryHeaderText]}>Rojo</Text>
          <Text style={[s.sumColSem,    s.summaryHeaderText]}>Ambar</Text>
          <Text style={[s.sumColSem,    s.summaryHeaderText]}>Verde</Text>
          <Text style={[s.sumColSem,    s.summaryHeaderText]}>S/E</Text>
          <Text style={[s.sumColAvance, s.summaryHeaderText]}>Avance prom.</Text>
        </View>
        {(() => {
          const ejes = Array.from(new Set(sorted.map(p => p.eje)))
          return ejes.map((eje, i) => {
            const items = sorted.filter(p => p.eje === eje)
            const rojo  = items.filter(p => p.estado_semaforo === 'rojo').length
            const ambar = items.filter(p => p.estado_semaforo === 'ambar').length
            const verde = items.filter(p => p.estado_semaforo === 'verde').length
            const gris  = items.filter(p => p.estado_semaforo === 'gris').length
            const avgAvance = Math.round(items.reduce((sum, p) => sum + (p.pct_avance ?? 0), 0) / items.length)
            return (
              <View key={eje} style={[s.summaryRow, i % 2 === 1 ? s.summaryRowAlt : {}]}>
                <Text style={s.sumColEje}>{ejeShort(eje)}</Text>
                <Text style={{ width: '13%', fontSize: 8 }}>{items[0]?.eje_gobierno ?? '—'}</Text>
                <Text style={s.sumColTotal}>{items.length}</Text>
                <Text style={s.sumColSem}>{rojo  > 0 ? rojo  : '—'}</Text>
                <Text style={s.sumColSem}>{ambar > 0 ? ambar : '—'}</Text>
                <Text style={s.sumColSem}>{verde > 0 ? verde : '—'}</Text>
                <Text style={s.sumColSem}>{gris  > 0 ? gris  : '—'}</Text>
                <Text style={s.sumColAvance}>{avgAvance}%</Text>
              </View>
            )
          })
        })()}

        {/* ── IX-B. Detalle agrupado por eje ── */}
        <Text style={[s.sectionTitle, { fontSize: 9, marginTop: 14 }]}>
          Detalle de Iniciativas por Eje
        </Text>
        {(() => {
          const ejes = Array.from(new Set(sorted.map(p => p.eje)))
          return ejes.map(eje => {
            const items = sorted.filter(p => p.eje === eje)
            return (
              <View key={eje}>
                <View style={s.ejeHeader}>
                  <Text style={s.ejeHeaderText}>{eje}</Text>
                  <Text style={s.ejeHeaderCount}>{items.length} iniciativa{items.length !== 1 ? 's' : ''}</Text>
                </View>
                {/* Detail column headers */}
                <View style={[s.detailRow, { backgroundColor: '#e2e8f0' }]}>
                  <Text style={[s.detColGob,    s.tableHeaderText, { color: '#374151' }]}>Eje Gobierno</Text>
                  <Text style={[s.detColSem,    s.tableHeaderText, { color: '#374151' }]}>Estado actual</Text>
                  <Text style={[s.detColNombre,  s.tableHeaderText, { color: '#374151' }]}>Iniciativa</Text>
                  <Text style={[s.detColPrior,   s.tableHeaderText, { color: '#374151' }]}>Prioridad</Text>
                  <Text style={[s.detColAvance,  s.tableHeaderText, { color: '#374151' }]}>Avance</Text>
                </View>
                {items.map((p, i) => (
                  <View key={p.n} style={[s.detailRow, i % 2 === 1 ? s.detailRowAlt : {}]}>
                    <Text style={s.detColGob}>{p.eje_gobierno ?? '—'}</Text>
                    <Text style={s.detColSem}>{semLabel(p.estado_semaforo)}</Text>
                    <Text style={s.detColNombre}>{p.nombre}</Text>
                    <Text style={s.detColPrior}>{p.prioridad}</Text>
                    <Text style={s.detColAvance}>{p.pct_avance ?? 0}%</Text>
                  </View>
                ))}
              </View>
            )
          })
        })()}

        {/* ── X. Proyectos SEIA ── */}
        <SectionTitle num="X" title="Proyectos en Evaluación Ambiental (SEIA)" />
        {seiaProjects && seiaProjects.length > 0 ? (
          <View>
            <Text style={s.subNote}>
              Mostrando {seiaProjects.length} proyecto{seiaProjects.length > 1 ? 's' : ''} más recientes registrados en SEIA.
            </Text>
            <View style={s.compactHeader}>
              <Text style={[s.colNombre,    s.compactHeaderText]}>Nombre</Text>
              <Text style={[s.colEstado,    s.compactHeaderText]}>Estado</Text>
              <Text style={[s.colInversion, s.compactHeaderText]}>Inversión</Text>
              <Text style={[s.colFecha,     s.compactHeaderText]}>Presentación</Text>
            </View>
            {seiaProjects.map((p, i) => (
              <View key={p.id} style={[s.compactRow, i % 2 === 1 ? s.compactRowAlt : {}]}>
                <Text style={s.colNombre}>{truncStr(p.nombre, 60)}</Text>
                <Text style={s.colEstado}>{truncStr(p.estado ?? '—', 24)}</Text>
                <Text style={s.colInversion}>{fmtInversionSeia(p.inversion_mm)}</Text>
                <Text style={s.colFecha}>{fmtMesAnio(p.fecha_presentacion)}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={s.subNote}>Sin proyectos registrados en SEIA para esta región.</Text>
        )}

        {/* ── XI. Proyectos MOP ── */}
        <SectionTitle num="XI" title="Proyectos de Obras Públicas (MOP)" />
        {mopProjects && mopProjects.length > 0 ? (
          <View>
            <Text style={s.subNote}>
              Mostrando {mopProjects.length} proyecto{mopProjects.length > 1 ? 's' : ''} registrados en MOP.
            </Text>
            <View style={s.compactHeader}>
              <Text style={[s.colNombre,    s.compactHeaderText]}>Nombre</Text>
              <Text style={[s.colServicio,  s.compactHeaderText]}>Servicio</Text>
              <Text style={[s.colEtapa,     s.compactHeaderText]}>Etapa</Text>
              <Text style={[s.colInversion, s.compactHeaderText]}>Inversión</Text>
            </View>
            {mopProjects.map((p, i) => (
              <View key={p.cod_p} style={[s.compactRow, i % 2 === 1 ? s.compactRowAlt : {}]}>
                <Text style={s.colNombre}>{truncStr(p.nombre, 60)}</Text>
                <Text style={s.colServicio}>{abrevServicio(p.servicio)}</Text>
                <Text style={s.colEtapa}>{p.etapa ?? '—'}</Text>
                <Text style={s.colInversion}>{fmtInversionMop(p.inversion_miles)}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={s.subNote}>Sin proyectos registrados en MOP para esta región.</Text>
        )}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>Ministerio del Interior — Uso interno</Text>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  )
}
