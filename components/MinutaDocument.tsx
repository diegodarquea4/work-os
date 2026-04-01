import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer'
import type { Project } from '@/lib/projects'
import type { Region } from '@/lib/regions'

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

  // Sub-bullet (nivel 2)
  subBulletRow: {
    flexDirection: 'row',
    marginBottom: 2,
    paddingLeft: 24,
  },
  subBulletDot: {
    width: 14,
    color: '#888',
    fontSize: 9,
  },
  subBulletText: {
    flex: 1,
    fontSize: 9,
    color: '#333',
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

  // Placeholder fields
  placeholder: {
    color: '#888',
    fontStyle: 'italic',
  },

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

function SubBullet({ children }: { children: string }) {
  return (
    <View style={s.subBulletRow}>
      <Text style={s.subBulletDot}>–</Text>
      <Text style={s.subBulletText}>{children}</Text>
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

function PlaceholderBullet({ label }: { label: string }) {
  return (
    <View style={s.bulletRow}>
      <Text style={s.bulletDot}>•</Text>
      <Text style={[s.bulletText, s.placeholder]}>{label}: [completar]</Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
type Props = {
  region: Region
  projects: Project[]
  fecha: string // e.g. "Marzo 2026"
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

export default function MinutaDocument({ region, projects, fecha }: Props) {
  const alta = projects.filter(p => p.prioridad === 'Alta')
  const media = projects.filter(p => p.prioridad === 'Media')

  // Sorted projects: Alta first, then by eje order
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
          La Región de {region.nombre} (la "Región") se ubica en la zona {region.zona} de Chile.
          A continuación se presentan datos relevantes de la Región, incluyendo sus prioridades
          territoriales para el período 2026–2028.
        </Text>

        {/* ── I. Geográficos ── */}
        <SectionTitle num="I" title="Geográficos" />
        <PlaceholderBullet label="Superficie total (km²)" />
        <PlaceholderBullet label="% del territorio nacional" />
        <PlaceholderBullet label="Capital regional" />
        <Bullet>{`Capital regional: ${region.capital}`}</Bullet>
        <PlaceholderBullet label="Número de comunas y provincias" />

        {/* ── II. Demográficos ── */}
        <SectionTitle num="II" title="Demográficos" />
        <PlaceholderBullet label="Población total y % nacional (Censo 2024)" />
        <PlaceholderBullet label="Distribución por sexo" />
        <PlaceholderBullet label="Edad promedio" />
        <PlaceholderBullet label="Distribución etaria (< 15, 15–64, 65+)" />
        <PlaceholderBullet label="% población inmigrante" />
        <PlaceholderBullet label="% perteneciente a pueblo indígena" />

        {/* ── III. Población Vulnerable ── */}
        <SectionTitle num="III" title="Población Vulnerable" />
        <PlaceholderBullet label="% con algún tipo de discapacidad (Censo 2024)" />
        <PlaceholderBullet label="% en el 40% más vulnerable del RSH" />
        <PlaceholderBullet label="Pobreza severa %" />
        <PlaceholderBullet label="Pobreza por ingresos % vs. promedio nacional" />
        <PlaceholderBullet label="Pobreza multidimensional %" />

        {/* ── IV. Economía ── */}
        <SectionTitle num="IV" title="Economía" />
        <PlaceholderBullet label="PIB regional (billones de pesos, 2024)" />
        <PlaceholderBullet label="Principales sectores productivos" />
        <PlaceholderBullet label="Tasa de participación laboral % vs. nacional" />
        <PlaceholderBullet label="Ingreso monetario promedio" />

        {/* ── V. Educación ── */}
        <SectionTitle num="V" title="Educación" />
        <PlaceholderBullet label="Años de escolaridad promedio" />
        <PlaceholderBullet label="% con escolaridad completa" />
        <PlaceholderBullet label="Establecimientos de educación básica y media" />
        <PlaceholderBullet label="Cobertura matrícula parvularia %" />

        {/* ── VI. Salud ── */}
        <SectionTitle num="VI" title="Salud" />
        <PlaceholderBullet label="Total establecimientos de salud" />
        <PlaceholderBullet label="Hospitales (alta y mediana complejidad)" />
        <PlaceholderBullet label="CESFAM y CECOSF" />
        <PlaceholderBullet label="Cobertura atención primaria %" />
        <PlaceholderBullet label="% adscrito a FONASA / Isapre" />

        {/* ── VII. Vivienda ── */}
        <SectionTitle num="VII" title="Vivienda" />
        <PlaceholderBullet label="Total viviendas (Censo 2024)" />
        <PlaceholderBullet label="% hogares con niños menores de 15 años" />
        <PlaceholderBullet label="% hogares de adultos mayores" />
        <PlaceholderBullet label="Número de campamentos y familias (TECHO)" />

        {/* ── VIII. Seguridad ── */}
        <SectionTitle num="VIII" title="Seguridad" />
        <PlaceholderBullet label="Tasa de victimización ENUSC 2024" />
        <PlaceholderBullet label="Delitos contra la vida o integridad (por 100.000 hab.)" />
        <PlaceholderBullet label="Delitos asociados a drogas" />
        <PlaceholderBullet label="Contra la propiedad no violentos" />
        <PlaceholderBullet label="Violencia intrafamiliar" />

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
          <Text style={s.footerText}>
            Ministerio del Interior — Uso interno
          </Text>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) =>
              `Página ${pageNumber} de ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  )
}
