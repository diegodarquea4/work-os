import {
  Document, Page, Text, View, StyleSheet,
} from '@react-pdf/renderer'
import type { Region } from '@/lib/regions'
import type { RegionMetrics } from '@/lib/types'
import type { FichaRegionalContent, LeystopMinuta } from '@/lib/minutaAI'

// ── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#111',
    paddingTop: 50,
    paddingBottom: 50,
    paddingHorizontal: 56,
  },
  headerBlock: { alignItems: 'center', marginBottom: 20 },
  headerLine: { fontSize: 10, fontFamily: 'Helvetica-Bold', textDecoration: 'underline', marginBottom: 2 },
  headerOrg: { fontSize: 10, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 1 },
  headerOrgSub: { fontSize: 10, textAlign: 'center', marginBottom: 8 },
  headerTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', textDecoration: 'underline', textAlign: 'center', marginBottom: 14 },
  intro: { fontSize: 10, lineHeight: 1.6, textAlign: 'justify', marginBottom: 16 },
  sectionHead: { fontSize: 10, fontFamily: 'Helvetica-Bold', textDecoration: 'underline', marginTop: 12, marginBottom: 6 },
  item: { flexDirection: 'row', marginBottom: 4, paddingLeft: 24 },
  itemNum: { width: 20, fontSize: 10 },
  itemText: { flex: 1, fontSize: 10, lineHeight: 1.5 },
  subItem: { flexDirection: 'row', marginBottom: 2, paddingLeft: 48 },
  subItemLetter: { width: 18, fontSize: 10 },
  subItemText: { flex: 1, fontSize: 10, lineHeight: 1.4 },
  footer: {
    position: 'absolute', bottom: 24, left: 56, right: 56,
    flexDirection: 'row', justifyContent: 'flex-end',
  },
  footerTxt: { fontSize: 9, color: '#666' },
})

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmt(val?: number | null): string {
  if (val == null) return ''
  return val.toLocaleString('es-CL')
}

function pct1(val?: number | null): string {
  if (val == null) return ''
  return `${(Math.round(val * 10) / 10).toString().replace('.', ',')}%`
}

function dec1(val?: number | null): string {
  if (val == null) return ''
  return (Math.round(val * 10) / 10).toString().replace('.', ',')
}

function regionFullName(region: Region): string {
  const OVERRIDES: Record<string, string> = {
    RM: 'Región Metropolitana de Santiago',
    XI: 'Región de Aysén del Gral. Carlos Ibáñez del Campo',
    XII: 'Región de Magallanes y de la Antártica Chilena',
  }
  return OVERRIDES[region.cod] ?? `Región de ${region.nombre}`
}

// Section builder helpers
function SH({ num, title }: { num: string; title: string }) {
  return (
    <View style={{ flexDirection: 'row', marginTop: 12, marginBottom: 6 }}>
      <Text style={s.sectionHead}>{num}  </Text>
      <Text style={s.sectionHead}>{title}:</Text>
    </View>
  )
}

function Item({ num, children }: { num: number; children: React.ReactNode }) {
  return (
    <View style={s.item}>
      <Text style={s.itemNum}>{num}.</Text>
      <Text style={s.itemText}>{children}</Text>
    </View>
  )
}

function SubItem({ letter, text }: { letter: string; text: string }) {
  return (
    <View style={s.subItem}>
      <Text style={s.subItemLetter}>{letter}.</Text>
      <Text style={s.subItemText}>{text}</Text>
    </View>
  )
}

// ── Props ───────────────────────────────────────────────────────────────────
type Props = {
  region: Region
  metrics?: RegionMetrics | null
  leystopData?: LeystopMinuta | null
  fecha: string
  aiContent?: FichaRegionalContent | null | unknown
}

// ── Component ───────────────────────────────────────────────────────────────
export default function FichaRegional({ region, metrics, leystopData, fecha, aiContent }: Props) {
  const ai = (aiContent && typeof aiContent === 'object' && 'introduccion' in aiContent)
    ? aiContent as FichaRegionalContent : null
  const m = metrics ?? null
  const ls = leystopData ?? null

  type ItemEntry = { text: React.ReactNode; subs?: string[] }

  // ── I. Geográficos ──
  const geoItems: ItemEntry[] = []
  if (m?.superficie_km2 != null) {
    const pctTxt = m.pct_territorio_nacional != null ? `, que representa el ${pct1(m.pct_territorio_nacional)} del territorio nacional` : ''
    geoItems.push({ text: <>Consta de una superficie total de {fmt(m.superficie_km2)} km²{pctTxt}.</> })
  }
  geoItems.push({ text: <>Su capital es {region.capital}{m?.poblacion_total != null ? ` y concentra la mayor cantidad de habitantes de la Región` : ''}.</> })
  if (m?.comunas_n != null) {
    const provTxt = m.provincias_n != null ? `, distribuidas en ${m.provincias_n} provincias` : ''
    geoItems.push({ text: <>La Región está dividida en {m.comunas_n} comunas{provTxt}.</> })
  }
  if (m?.densidad_poblacional != null) {
    geoItems.push({ text: <>Densidad poblacional: {dec1(m.densidad_poblacional)} hab/km².</> })
  }

  // ── II. Demográficos ──
  const demoItems: ItemEntry[] = []
  if (m?.poblacion_total != null) {
    demoItems.push({ text: <>En la Región habitan {fmt(m.poblacion_total)} personas (Censo 2024).</> })
  }
  if (m?.pct_hombres != null && m?.pct_mujeres != null && m?.poblacion_total != null) {
    const hombres = Math.round(m.poblacion_total * m.pct_hombres / 100)
    const mujeres = Math.round(m.poblacion_total * m.pct_mujeres / 100)
    const ratio = m.pct_hombres > 0 && m.pct_mujeres > 0 ? (m.pct_hombres / m.pct_mujeres * 100).toFixed(1).replace('.', ',') : '?'
    demoItems.push({ text: <>De ese total, {fmt(mujeres)} son mujeres y {fmt(hombres)} hombres, con una razón de {ratio} hombres por cada 100 mujeres (Censo 2024).</> })
  }
  if (m?.prom_edad != null || m?.promedio_edad != null) {
    const edad = m?.prom_edad ?? m?.promedio_edad
    demoItems.push({ text: <>El promedio de edad es de {dec1(edad)} años (Censo 2024).</> })
  }
  if (m?.pct_edad_60_mas != null) {
    demoItems.push({ text: <>Un {pct1(m.pct_edad_60_mas)} de la población tiene 60 años o más (Censo 2024).</> })
  }
  if (m?.pct_urbana != null && m?.pct_rural != null) {
    demoItems.push({ text: <>Distribución territorial: {pct1(m.pct_urbana)} urbana y {pct1(m.pct_rural)} rural.</> })
  }
  if (m?.n_inmigrantes != null) {
    const pctTxt = m.pct_inmigrantes != null ? `, correspondiente al ${pct1(m.pct_inmigrantes)} de la población` : ''
    demoItems.push({ text: <>Un {pct1(m.pct_inmigrantes)} de la población es inmigrante, correspondiente a {fmt(m.n_inmigrantes)} personas{pctTxt} (Censo 2024).</> })
  }
  if (m?.n_pueblos_orig != null) {
    const pctTxt = m.pct_indigena != null ? `El ${pct1(m.pct_indigena)} de la población` : `${fmt(m.n_pueblos_orig)} personas`
    demoItems.push({ text: <>{pctTxt} es o se considera perteneciente a un pueblo indígena (Censo 2024).</> })
  }
  if (m?.pct_jefatura_mujer != null) {
    demoItems.push({ text: <>El {pct1(m.pct_jefatura_mujer)} de los hogares tiene jefatura femenina (Censo 2024).</> })
  }

  // ── III. Población Vulnerable ──
  const vulnItems: ItemEntry[] = []
  if (m?.n_discapacidad != null) {
    const pctTxt = m.poblacion_total != null && m.poblacion_total > 0 ? ` (${pct1(m.n_discapacidad / m.poblacion_total * 100)} de la población)` : ''
    vulnItems.push({ text: <>{fmt(m.n_discapacidad)} personas presentan algún tipo de discapacidad{pctTxt} (Censo 2024).</> })
  }
  if (m?.hogares_rsh_tramo40 != null) {
    const pctTxt = m.pct_rsh_tramo40 != null ? `el ${pct1(m.pct_rsh_tramo40)} de las personas se encuentran en el tramo del 40% más vulnerable del RSH` : `${fmt(m.hogares_rsh_tramo40)} hogares en el tramo 40% más vulnerable del RSH`
    vulnItems.push({ text: <>{pctTxt}.</> })
  }
  if (m?.pct_pobreza_severa != null) {
    vulnItems.push({ text: <>La pobreza severa —que considera simultáneamente pobreza por ingresos y multidimensional— alcanza {pct1(m.pct_pobreza_severa)} en la Región (CASEN 2024).</> })
  }
  if (m?.pct_pobreza_ingresos != null) {
    const extTxt = m.pct_pobreza_extrema != null ? `; mientras el ${pct1(m.pct_pobreza_extrema)} se encuentra en pobreza extrema` : ''
    vulnItems.push({ text: <>El {pct1(m.pct_pobreza_ingresos)} de la población se encuentra en situación de pobreza por ingresos{extTxt} (CASEN 2024).</> })
  }
  if (m?.pct_pobreza_multidimensional != null) {
    vulnItems.push({ text: <>En cuanto a pobreza multidimensional, el {pct1(m.pct_pobreza_multidimensional)} de la población de la Región se encuentra en esta condición (CASEN 2024).</> })
  }

  // ── IV. Economía ──
  const econItems: ItemEntry[] = []
  if (m?.pib_regional != null) {
    const pctTxt = m.pct_pib_nacional != null ? `, equivalente al ${pct1(m.pct_pib_nacional)} del PIB nacional` : ''
    econItems.push({ text: <>El PIB de la Región alcanza {fmt(m.pib_regional)} MM${pctTxt}.</> })
  }
  if (m?.sectores_productivos_principales) {
    econItems.push({ text: <>Sus principales sectores productivos son: {m.sectores_productivos_principales}.</> })
  }
  if (m?.tasa_participacion_laboral != null) {
    econItems.push({ text: <>La tasa de participación laboral es de {pct1(m.tasa_participacion_laboral)}.</> })
  }
  if (m?.tasa_desocupacion != null) {
    econItems.push({ text: <>La tasa de desocupación es de {pct1(m.tasa_desocupacion)}.</> })
  }
  if (m?.tasa_ocupacion != null) {
    econItems.push({ text: <>La tasa de ocupación es de {pct1(m.tasa_ocupacion)}.</> })
  }
  if (m?.tasa_ocupacion_informal != null) {
    econItems.push({ text: <>La tasa de ocupación informal alcanza {pct1(m.tasa_ocupacion_informal)}.</> })
  }
  if (m?.n_ocupado != null && m?.n_desocupado != null) {
    econItems.push({ text: <>{fmt(m.n_ocupado)} personas ocupadas y {fmt(m.n_desocupado)} desocupadas (Censo 2024).</> })
  }
  if (m?.variacion_interanual != null) {
    econItems.push({ text: <>La variación interanual de actividad económica es de {m.variacion_interanual}%.</> })
  }
  if (m?.inversion_publica_ejecutada != null) {
    econItems.push({ text: <>Inversión pública ejecutada: {fmt(m.inversion_publica_ejecutada)} MM$.</> })
  }
  if (m?.inversion_fndr != null) {
    econItems.push({ text: <>Inversión FNDR: {fmt(m.inversion_fndr)} MM$.</> })
  }
  if (m?.vocacion_regional) {
    econItems.push({ text: <>Vocación regional: {m.vocacion_regional}.</> })
  }

  // ── V. Educación ──
  const eduItems: ItemEntry[] = []
  if (m?.anios_escolaridad_promedio != null) {
    eduItems.push({ text: <>La Región presenta {dec1(m.anios_escolaridad_promedio)} años de escolaridad promedio por habitante (Censo 2024).</> })
  }
  if (m?.pct_educacion_superior != null) {
    eduItems.push({ text: <>El {pct1(m.pct_educacion_superior)} de la población cuenta con educación terciaria, maestría o doctorado (Censo 2024).</> })
  }
  if (m?.tasa_alfabetismo != null) {
    eduItems.push({ text: <>Tasa de alfabetismo: {pct1(m.tasa_alfabetismo)}.</> })
  }
  if (m?.matricula_escolar_total != null) {
    eduItems.push({ text: <>Matrícula escolar total: {fmt(m.matricula_escolar_total)} estudiantes.</> })
  }
  if (m?.cobertura_parvularia_pct != null) {
    eduItems.push({ text: <>Cobertura de matrícula parvularia: {pct1(m.cobertura_parvularia_pct)}.</> })
  }

  // ── VI. Salud ──
  const saludItems: ItemEntry[] = []
  if (m?.hospitales_n != null) {
    saludItems.push({ text: <>La Región posee {m.hospitales_n} hospitales.</> })
  }
  if (m?.camas_por_1000_hab != null) {
    saludItems.push({ text: <>{dec1(m.camas_por_1000_hab)} camas hospitalarias por cada 1.000 habitantes.</> })
  }
  if (m?.pct_fonasa != null) {
    saludItems.push({ text: <>El {pct1(m.pct_fonasa)} de la población está adscrita a FONASA.</> })
  }
  if (m?.lista_espera_n != null) {
    saludItems.push({ text: <>{fmt(m.lista_espera_n)} personas en lista de espera de salud.</> })
  }

  // ── VII. Vivienda ──
  const vivItems: ItemEntry[] = []
  if (m?.deficit_habitacional != null) {
    vivItems.push({ text: <>Déficit habitacional: {fmt(m.deficit_habitacional)} viviendas.</> })
  }
  if (m?.n_deficit_cuantitativo != null) {
    vivItems.push({ text: <>Déficit cuantitativo: {fmt(m.n_deficit_cuantitativo)} viviendas (Censo 2024).</> })
  }
  if (m?.pct_hacinamiento != null || m?.pct_viv_hacinadas != null) {
    const hac = m?.pct_hacinamiento ?? m?.pct_viv_hacinadas
    vivItems.push({ text: <>Hacinamiento: {pct1(hac)} de las viviendas (Censo 2024).</> })
  }
  if (m?.pct_viv_irrecuperables != null) {
    vivItems.push({ text: <>Viviendas irrecuperables: {pct1(m.pct_viv_irrecuperables)} (Censo 2024).</> })
  }
  if (m?.pct_tenencia_arrendada != null) {
    vivItems.push({ text: <>Tenencia arrendada: {pct1(m.pct_tenencia_arrendada)} de hogares (Censo 2024).</> })
  }
  if (m?.pct_acceso_agua_publica != null) {
    vivItems.push({ text: <>Acceso a agua de red pública: {pct1(m.pct_acceso_agua_publica)} de viviendas (Censo 2024).</> })
  }

  // ── VIII. Conectividad ──
  const conItems: ItemEntry[] = []
  if (m?.pct_hogares_internet != null) {
    conItems.push({ text: <>El {pct1(m.pct_hogares_internet)} de los hogares tiene acceso a internet (Censo 2024).</> })
  }
  if (m?.pct_internet_movil != null) {
    conItems.push({ text: <>Internet móvil: {pct1(m.pct_internet_movil)} de hogares (Censo 2024).</> })
  }
  if (m?.pct_internet_fijo != null) {
    conItems.push({ text: <>Internet fijo: {pct1(m.pct_internet_fijo)} de hogares (Censo 2024).</> })
  }
  if (m?.localidades_aisladas_n != null) {
    conItems.push({ text: <>{m.localidades_aisladas_n} localidades aisladas en la Región.</> })
  }

  // ── IX. Medio Ambiente ──
  const maItems: ItemEntry[] = []
  if (m?.pct_superficie_protegida != null) {
    maItems.push({ text: <>Superficie protegida: {pct1(m.pct_superficie_protegida)} del territorio regional.</> })
  }
  if (m?.residuos_domiciliarios_percapita != null) {
    maItems.push({ text: <>Residuos domiciliarios per cápita: {dec1(m.residuos_domiciliarios_percapita)} kg/hab/día.</> })
  }

  // ── X. Seguridad ──
  const segItems: ItemEntry[] = []
  if (m?.pct_hogares_victimas_dmcs != null) {
    segItems.push({ text: <>Tasa de victimización: {pct1(m.pct_hogares_victimas_dmcs)} de hogares víctimas de delitos de mayor connotación social, DMCS (ENUSC).</> })
  }
  if (m?.pct_percepcion_inseguridad != null) {
    segItems.push({ text: <>Percepción de aumento de la delincuencia: {pct1(m.pct_percepcion_inseguridad)} (ENUSC).</> })
  }
  if (m?.tasa_denuncias_100k != null) {
    segItems.push({ text: <>Tasa de denuncias: {fmt(m.tasa_denuncias_100k)} por cada 100.000 habitantes.</> })
  }
  if (m?.tasa_delitos_100k != null) {
    segItems.push({ text: <>Tasa de delitos: {fmt(m.tasa_delitos_100k)} por cada 100.000 habitantes.</> })
  }
  // LeyStop / Carabineros
  if (ls) {
    if (ls.tasa_registro != null) {
      segItems.push({ text: <>Tasa de registro LeyStop: {ls.tasa_registro.toFixed(0)} casos por 100.000 hab ({ls.semana ?? 'última semana disponible'}) (Carabineros).</> })
    }
    if (ls.casos_ultima_semana != null) {
      const varSem = ls.var_ultima_semana != null ? ` (${ls.var_ultima_semana > 0 ? '+' : ''}${ls.var_ultima_semana.toFixed(1)}% vs semana anterior)` : ''
      segItems.push({ text: <>{fmt(ls.casos_ultima_semana)} casos registrados en la última semana{varSem} (Carabineros).</> })
    }
    if (ls.casos_anno_fecha != null && ls.casos_anno_fecha_anterior != null) {
      const varAnno = ls.var_anno_fecha != null ? ` (${ls.var_anno_fecha > 0 ? '+' : ''}${ls.var_anno_fecha.toFixed(1)}%)` : ''
      segItems.push({ text: <>Casos año a la fecha: {fmt(ls.casos_anno_fecha)} vs {fmt(ls.casos_anno_fecha_anterior)} mismo período año anterior{varAnno} (Carabineros).</> })
    }
    const topDelitos = [
      ls.mayor_registro_1 ? `${ls.mayor_registro_1} (${ls.pct_1?.toFixed(0) ?? '?'}%)` : null,
      ls.mayor_registro_2 ? `${ls.mayor_registro_2} (${ls.pct_2?.toFixed(0) ?? '?'}%)` : null,
      ls.mayor_registro_3 ? `${ls.mayor_registro_3} (${ls.pct_3?.toFixed(0) ?? '?'}%)` : null,
      ls.mayor_registro_4 ? `${ls.mayor_registro_4} (${ls.pct_4?.toFixed(0) ?? '?'}%)` : null,
      ls.mayor_registro_5 ? `${ls.mayor_registro_5} (${ls.pct_5?.toFixed(0) ?? '?'}%)` : null,
    ].filter(Boolean)
    if (topDelitos.length > 0) {
      segItems.push({ text: <>Delitos más frecuentes: {topDelitos.join(', ')} (Carabineros).</> })
    }
    if (ls.controles != null) {
      segItems.push({ text: <>Actividad operativa: {fmt(ls.controles)} controles ({fmt(ls.controles_identidad)} de identidad, {fmt(ls.controles_vehicular)} vehiculares), {fmt(ls.fiscalizaciones)} fiscalizaciones (Carabineros).</> })
    }
    if (ls.incautaciones != null) {
      segItems.push({ text: <>Incautaciones: {fmt(ls.incautaciones)} ({fmt(ls.incaut_fuego)} armas de fuego, {fmt(ls.incaut_blancas)} armas blancas) (Carabineros).</> })
    }
    const annoItems: string[] = []
    if (ls.allanamientos_anno != null) annoItems.push(`${fmt(ls.allanamientos_anno)} allanamientos`)
    if (ls.vehiculos_recuperados_anno != null) annoItems.push(`${fmt(ls.vehiculos_recuperados_anno)} vehículos recuperados`)
    if (ls.decomisos_anno != null) annoItems.push(`${fmt(ls.decomisos_anno)} decomisos`)
    if (annoItems.length > 0) {
      segItems.push({ text: <>Año a la fecha: {annoItems.join(', ')} (Carabineros).</> })
    }
  }

  const sections = [
    { num: 'I.',    title: 'Geográficos',          items: geoItems },
    { num: 'II.',   title: 'Demográficos',          items: demoItems },
    { num: 'III.',  title: 'Población Vulnerable',   items: vulnItems },
    { num: 'IV.',   title: 'Economía',               items: econItems },
    { num: 'V.',    title: 'Educación',              items: eduItems },
    { num: 'VI.',   title: 'Salud',                  items: saludItems },
    { num: 'VII.',  title: 'Vivienda',               items: vivItems },
    { num: 'VIII.', title: 'Conectividad',           items: conItems },
    { num: 'IX.',   title: 'Medio Ambiente',          items: maItems },
    { num: 'X.',    title: 'Seguridad',               items: segItems },
  ].filter(s => s.items.length > 0)

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Header */}
        <View style={s.headerBlock}>
          <Text style={s.headerLine}>FICHA REGIONAL</Text>
          <Text style={s.headerOrg}>Unidad de Regiones - División de Coordinación Interministerial</Text>
          <Text style={s.headerOrgSub}>Ministerio del Interior</Text>
          <Text style={s.headerTitle}>Data {regionFullName(region)} - {fecha}</Text>
        </View>

        {/* Intro paragraph (AI-generated) */}
        {ai?.introduccion ? (
          <Text style={s.intro}>{ai.introduccion}</Text>
        ) : null}

        {/* Numbered sections */}
        {sections.map(sec => (
          <View key={sec.num}>
            <SH num={sec.num} title={sec.title} />
            {sec.items.map((item, i) => (
              <View key={i}>
                <Item num={i + 1}>{item.text}</Item>
                {item.subs?.map((sub, j) => (
                  <SubItem key={j} letter={String.fromCharCode(97 + j)} text={sub} />
                ))}
              </View>
            ))}
          </View>
        ))}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerTxt} render={({ pageNumber }) => `${pageNumber}`} />
        </View>

      </Page>
    </Document>
  )
}
