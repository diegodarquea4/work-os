import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer'
import type { Project } from '@/lib/projects'
import type { Region } from '@/lib/regions'
import type { RegionMetrics } from '@/lib/types'

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
  headerInst: {
    textAlign: 'center',
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  headerSub: {
    fontSize: 9,
    color: '#444',
    marginBottom: 2,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    marginTop: 10,
    marginBottom: 14,
  },

  // Título de la minuta
  minutaTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    textDecoration: 'underline',
    marginBottom: 10,
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

  // Tabla de prioridades
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    color: '#fff',
    padding: 5,
    marginTop: 8,
    marginBottom: 0,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#ddd',
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  tableRowAlt: {
    backgroundColor: '#f7f7f7',
  },
  colN: { width: '5%', fontSize: 8 },
  colEje: { width: '25%', fontSize: 8, paddingRight: 4 },
  colMeta: { width: '48%', fontSize: 8, paddingRight: 4 },
  colPrioridad: { width: '10%', fontSize: 8, textAlign: 'center' },
  colPlazo: { width: '12%', fontSize: 8, textAlign: 'center' },
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
type Props = {
  region: Region
  projects: Project[]
  metrics?: RegionMetrics | null
  fecha: string  // e.g. "Abril 2026"
}

const EJE_PRIORITY_ORDER = [
  'Seguridad y Orden Público',
  'Infraestructura y Conectividad',
  'Desarrollo Económico y Empleo',
  'Vivienda y Urbanismo',
  'Energía y Transición Energética',
  'Medio Ambiente y Territorio',
  'Desarrollo Social y Familia',
  'Modernización e Innovación',
]

export default function MinutaDocument({ region, projects, metrics, fecha }: Props) {
  const alta  = projects.filter(p => p.prioridad === 'Alta')
  const media = projects.filter(p => p.prioridad === 'Media')
  const m = metrics ?? null

  const sorted = [...projects].sort((a, b) => {
    if (a.prioridad !== b.prioridad) return a.prioridad === 'Alta' ? -1 : 1
    return EJE_PRIORITY_ORDER.indexOf(a.eje) - EJE_PRIORITY_ORDER.indexOf(b.eje)
  })

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Header institucional ── */}
        <View style={s.headerInst}>
          <Text style={s.headerTitle}>MINUTA</Text>
          <Text style={s.headerSub}>Unidad de Regiones - División de Coordinación Interministerial</Text>
          <Text style={s.headerSub}>Ministerio del Interior</Text>
        </View>
        <View style={s.divider} />

        <Text style={s.minutaTitle}>
          Data Región de {region.nombre} — {fecha}
        </Text>

        {/* ── Intro ── */}
        <Text style={s.intro}>
          La Región de {region.nombre} se ubica en la zona {region.zona} de Chile
          {m?.superficie_km2 ? `, con una superficie de ${n(m.superficie_km2)} km² (${pct(m.pct_territorio_nacional)} del territorio nacional)` : ''}.
          A continuación se presentan datos relevantes de la Región, incluyendo sus prioridades
          territoriales para el período 2026–2028.
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
        <Bullet>{`Total prioridades: ${projects.length} (${alta.length} alta prioridad, ${media.length} media prioridad)`}</Bullet>

        {/* Table header */}
        <View style={s.tableHeader}>
          <Text style={[s.colN, s.tableHeaderText]}>#</Text>
          <Text style={[s.colEje, s.tableHeaderText]}>Eje Estratégico</Text>
          <Text style={[s.colMeta, s.tableHeaderText]}>Meta / Acción</Text>
          <Text style={[s.colPrioridad, s.tableHeaderText]}>Prioridad</Text>
          <Text style={[s.colPlazo, s.tableHeaderText]}>Plazo</Text>
        </View>

        {sorted.map((p, i) => (
          <View key={p.n} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
            <Text style={s.colN}>{i + 1}</Text>
            <Text style={s.colEje}>{p.eje}</Text>
            <Text style={s.colMeta}>{p.meta}</Text>
            <Text style={s.colPrioridad}>{p.prioridad}</Text>
            <Text style={s.colPlazo}>{p.plazo}</Text>
          </View>
        ))}

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
