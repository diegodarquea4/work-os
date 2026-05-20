import {
  Document, Page, Text, View, StyleSheet, Image,
} from '@react-pdf/renderer'
import type { Region } from '@/lib/regions'
import type { RegionMetrics } from '@/lib/types'
import type { FichaRegionalContent, LeystopMinuta, TrendSummaries } from '@/lib/minutaAI'

// ── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: { fontFamily: 'Carlito', fontSize: 10, color: '#111', paddingTop: 50, paddingBottom: 50, paddingHorizontal: 56 },
  // Header
  logoRow: { flexDirection: 'row', justifyContent: 'flex-start', marginBottom: 16 },
  logo: { width: 80, height: 'auto' },
  title: { fontSize: 13, fontWeight: 'bold', textAlign: 'center', marginBottom: 2 },
  titleRegion: { fontSize: 13, fontWeight: 'bold', textDecoration: 'underline', textAlign: 'center', marginBottom: 12 },
  introBlock: { fontSize: 10, lineHeight: 1.5, marginBottom: 8 },
  indexItem: { fontSize: 10, marginLeft: 40, marginBottom: 2 },
  // Sections
  sectionTitle: { fontSize: 11, fontWeight: 'bold', marginTop: 14, marginBottom: 8 },
  subSectionTitle: { fontSize: 10, fontWeight: 'bold', marginTop: 8, marginBottom: 4 },
  // Bullets
  bullet: { flexDirection: 'row', marginBottom: 6 },
  bulletDot: { width: 14, fontSize: 10 },
  bulletText: { flex: 1, fontSize: 10, lineHeight: 1.5, textAlign: 'justify' },
  boldText: { fontWeight: 'bold' },
  // Dash list (for sectors)
  dashItem: { flexDirection: 'row', marginBottom: 2, paddingLeft: 20 },
  dashMark: { width: 14, fontSize: 10 },
  dashText: { flex: 1, fontSize: 10, lineHeight: 1.4 },
  // Paragraph
  para: { fontSize: 10, lineHeight: 1.5, textAlign: 'justify', marginBottom: 8 },
  // Tables
  tableContainer: { marginTop: 4, marginBottom: 8, borderWidth: 0.5, borderColor: '#999' },
  tableHeaderRow: { flexDirection: 'row', backgroundColor: '#e8e8e8', borderBottomWidth: 0.5, borderColor: '#999' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#ddd' },
  tableRowBold: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#ddd', backgroundColor: '#f0f5ff' },
  tableCell: { fontSize: 9, paddingVertical: 3, paddingHorizontal: 6, lineHeight: 1.3 },
  tableCellBold: { fontSize: 9, fontWeight: 'bold', paddingVertical: 3, paddingHorizontal: 6, lineHeight: 1.3 },
  tableHeaderCell: { fontSize: 9, fontWeight: 'bold', paddingVertical: 4, paddingHorizontal: 6 },
  // PREGO
  ejeTitle: { fontSize: 10, fontWeight: 'bold', marginTop: 8, marginBottom: 4 },
  ejeItem: { flexDirection: 'row', marginBottom: 4, paddingLeft: 20 },
  ejeLetter: { width: 18, fontSize: 10 },
  ejeText: { flex: 1, fontSize: 10, lineHeight: 1.5, textAlign: 'justify' },
  // Footer
  footer: { position: 'absolute', bottom: 24, left: 56, right: 56, flexDirection: 'row', justifyContent: 'flex-end' },
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

/** Parse **bold** markdown into react-pdf Text elements */
function parseBold(text: string): React.ReactNode[] {
  const parts = text.split(/\*\*/)
  return parts.map((part, i) =>
    i % 2 === 1
      ? <Text key={i} style={{ fontWeight: 'bold' }}>{part}</Text>
      : <Text key={i}>{part}</Text>
  )
}

function regionFullName(region: Region): string {
  const OVERRIDES: Record<string, string> = {
    RM: 'Región Metropolitana de Santiago',
    XI: 'Región de Aysén del Gral. Carlos Ibáñez del Campo',
    XII: 'Región de Magallanes y de la Antártica Chilena',
  }
  return OVERRIDES[region.cod] ?? `Región de ${region.nombre}`
}

function regionShortName(region: Region): string {
  if (region.cod === 'RM') return 'Metropolitana'
  return region.nombre
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Bullet({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.bullet}>
      <Text style={s.bulletDot}>•</Text>
      <Text style={s.bulletText}><Text style={s.boldText}>{label}</Text> {children}</Text>
    </View>
  )
}

function DashItem({ text }: { text: string }) {
  return (
    <View style={s.dashItem}>
      <Text style={s.dashMark}>-</Text>
      <Text style={s.dashText}>{text}</Text>
    </View>
  )
}

function PdfTable({ headers, rows, boldRowIndex, colWidths }: {
  headers: string[]
  rows: string[][]
  boldRowIndex?: number
  colWidths: number[]
}) {
  return (
    <View style={s.tableContainer}>
      <View style={s.tableHeaderRow}>
        {headers.map((h, i) => (
          <View key={i} style={{ width: `${colWidths[i]}%` }}>
            <Text style={s.tableHeaderCell}>{h}</Text>
          </View>
        ))}
      </View>
      {rows.map((row, ri) => (
        <View key={ri} style={ri === boldRowIndex ? s.tableRowBold : s.tableRow}>
          {row.map((cell, ci) => (
            <View key={ci} style={{ width: `${colWidths[ci]}%` }}>
              <Text style={ri === boldRowIndex ? s.tableCellBold : s.tableCell}>{cell}</Text>
            </View>
          ))}
        </View>
      ))}
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
  provinciasData?: { nombre: string; comunas: string }[]
  allRegionsPib?: { region_id: number; nombre: string; pib_mm: number; pct_pib: number }[]
  pibSectorial?: { sector: string; valor: number; pct: number }[]
  trendSummaries?: TrendSummaries | null
  logoSrc?: string | null
}

// ── Component ───────────────────────────────────────────────────────────────
export default function FichaRegional({
  region, metrics, leystopData, fecha, aiContent,
  provinciasData: provs, allRegionsPib, pibSectorial, trendSummaries: ts, logoSrc,
}: Props) {
  const ai = (aiContent && typeof aiContent === 'object' && 'introduccion' in aiContent)
    ? aiContent as FichaRegionalContent : null
  const m = metrics ?? null
  const ls = leystopData ?? null
  const INE_CODE: Record<string, number> = { XV: 15, I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12, XIII: 13, XIV: 14, RM: 13, XVI: 16 }
  const regionId = INE_CODE[region.cod] ?? 0

  // Find this region's rank in PIB table
  const pibSorted = allRegionsPib ? [...allRegionsPib].sort((a, b) => b.pib_mm - a.pib_mm) : []
  const pibRank = pibSorted.findIndex(r => r.region_id === regionId)
  const regionPib = pibSorted.find(r => r.region_id === regionId)

  // Top 5 sectors
  const topSectors = pibSectorial?.slice(0, 5) ?? []

  return (
    <Document>
      <Page size="A4" style={s.page} wrap>

        {/* ── Header ─── */}
        {logoSrc && (
          <View style={s.logoRow}>
            <Image src={logoSrc} style={s.logo} />
          </View>
        )}
        <Text style={s.title}>MINUTA REGIONAL PARA LA AUTORIDAD</Text>
        <Text style={s.titleRegion}>REGIÓN DEL {regionShortName(region).toUpperCase()}</Text>

        <Text style={s.introBlock}>
          La presente minuta trabajada por la División de Coordinación Interministerial, Gobierno Interior y Estudios considera:
        </Text>

        <Text style={s.indexItem}>I.     Caracterización general de la región</Text>
        <Text style={s.indexItem}>II.    Indicadores socioeconómicos clave</Text>
        <Text style={s.indexItem}>III.   Plan Regional de {regionShortName(region)}</Text>

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* I. CARACTERIZACIÓN GENERAL                                           */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        <Text style={s.sectionTitle}>I. Caracterización general</Text>

        {m?.superficie_km2 != null && (
          <Bullet label="Localización y superficie:">
            {m.vocacion_regional ? `${m.vocacion_regional}; ` : ''}{fmt(m.superficie_km2)} km², equivalente al {pct1(m.pct_territorio_nacional)} del territorio nacional.
          </Bullet>
        )}

        <Bullet label="Organización político-administrativa:">
          {m?.provincias_n ?? '?'} provincias y {m?.comunas_n ?? '?'} comunas. Capital regional: {region.capital}.
        </Bullet>

        {provs && provs.length > 0 && (
          <PdfTable
            headers={['Provincia', 'Comunas']}
            rows={provs.map(p => [p.nombre, p.comunas])}
            colWidths={[30, 70]}
          />
        )}

        {m?.poblacion_total != null && (
          <Bullet label="Población (Censo 2024):">
            {fmt(m.poblacion_total)} habitantes ({pct1(m.poblacion_total / 19_960_889 * 100)} del total nacional), con {m.pct_mujeres != null && m.poblacion_total ? `${fmt(Math.round(m.poblacion_total * m.pct_mujeres / 100))} mujeres (${pct1(m.pct_mujeres)})` : ''} y {m.pct_hombres != null && m.poblacion_total ? `${fmt(Math.round(m.poblacion_total * m.pct_hombres / 100))} hombres (${pct1(m.pct_hombres)})` : ''}.
          </Bullet>
        )}

        {ai?.estructura_etaria ? (
          <Bullet label="Estructura etaria:">
            {m?.pct_edad_60_mas != null ? `${pct1(m.pct_edad_60_mas)} de 60 años o más, ` : ''}con una edad promedio de {dec1(m?.promedio_edad ?? m?.prom_edad)} años. {ai.estructura_etaria}
          </Bullet>
        ) : m?.prom_edad != null || m?.promedio_edad != null ? (
          <Bullet label="Estructura etaria:">
            Edad promedio de {dec1(m?.promedio_edad ?? m?.prom_edad)} años{m?.pct_edad_60_mas != null ? `; ${pct1(m.pct_edad_60_mas)} de 60 años o más` : ''}.
          </Bullet>
        ) : null}

        {ai?.composicion ? (
          <Bullet label="Composición:">
            {ai.composicion}
          </Bullet>
        ) : (m?.pct_indigena != null || m?.pct_inmigrantes != null) ? (
          <Bullet label="Composición:">
            {m?.pct_indigena != null ? `${pct1(m.pct_indigena)} perteneciente a pueblos originarios (${fmt(m.n_pueblos_orig)} personas)` : ''}
            {m?.pct_indigena != null && m?.pct_inmigrantes != null ? '; ' : ''}
            {m?.pct_inmigrantes != null ? `${pct1(m.pct_inmigrantes)} de población inmigrante (${fmt(m.n_inmigrantes)} personas)` : ''}.
            {m?.n_discapacidad != null ? ` Un ${pct1(m.n_discapacidad / (m.poblacion_total ?? 1) * 100)} de la población presenta algún tipo de discapacidad.` : ''}
          </Bullet>
        ) : null}

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* II. INDICADORES SOCIOECONÓMICOS CLAVE                                */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        <Text style={s.sectionTitle}>II. Indicadores socioeconómicos clave</Text>

        {/* PIB Regional */}
        <Bullet label="PIB regional:">
          ${regionPib ? `${fmt(Math.round(regionPib.pib_mm))} miles de millones de pesos (${new Date().getFullYear() - 1})` : `${fmt(m?.pib_regional)} MM$`}, equivalentes al {regionPib ? `${regionPib.pct_pib.toFixed(2).replace('.', ',')}%` : pct1(m?.pct_pib_nacional)} del PIB nacional{pibRank >= 0 ? `, manteniéndose como la ${pibRank + 1}ª economía regional del país` : ''}.{regionPib && m?.poblacion_total ? ` PIB per cápita: $${fmt(Math.round(regionPib.pib_mm / m.poblacion_total * 1_000_000))} (${new Date().getFullYear() - 1}).` : ''}
        </Bullet>

        {ai?.matriz_productiva && (
          <Text style={s.para}>
            {ai.matriz_productiva}
          </Text>
        )}

        {topSectors.length > 0 && (
          <View style={{ marginBottom: 4, paddingLeft: 20 }}>
            <Text style={{ fontSize: 10, marginBottom: 4 }}>
              <Text style={s.boldText}>Principales sectores:</Text>
            </Text>
            {topSectors.map((sec, i) => (
              <DashItem key={i} text={`${sec.sector} (${sec.pct.toFixed(1).replace('.', ',')}%)`} />
            ))}
          </View>
        )}

        {/* PIB 16-region table */}
        {pibSorted.length > 0 && (
          <PdfTable
            headers={['Región', 'Miles de MM CLP', '% PIB Nacional']}
            rows={pibSorted.map(r => [
              r.nombre,
              `$${fmt(Math.round(r.pib_mm))}`,
              `${r.pct_pib.toFixed(1).replace('.', ',')}%`,
            ])}
            boldRowIndex={pibSorted.findIndex(r => r.region_id === regionId)}
            colWidths={[45, 30, 25]}
          />
        )}

        {ai?.pib_comentario && (
          <Text style={s.para}>{ai.pib_comentario}</Text>
        )}

        {/* Mercado laboral */}
        <Bullet label={`Mercado laboral (INE-ENE, ${fecha.slice(0, 7).replace('-', '/')}):`}>
          {''}
        </Bullet>

        <PdfTable
          headers={['Indicador', regionShortName(region), 'Contexto']}
          rows={[
            ['Tasa de desocupación', m?.tasa_desocupacion != null ? `${pct1(m.tasa_desocupacion)}` : '—', ai?.mercado_laboral_nota ?? '—'],
            ['Ocupados', ts?.empleoINE?.ocupados_miles != null ? `${fmt(Math.round(ts.empleoINE.ocupados_miles))} mil` : '—', '—'],
            ['Fuerza de trabajo', ts?.empleoINE?.fuerza_trabajo_miles != null ? `${fmt(Math.round(ts.empleoINE.fuerza_trabajo_miles))} mil` : '—', '—'],
            ['Informalidad laboral (CASEN 2024)', m?.tasa_ocupacion_informal != null ? `${pct1(m.tasa_ocupacion_informal)} de hogares` : '—', '—'],
          ]}
          colWidths={[40, 25, 35]}
        />

        {/* Ingresos y pobreza */}
        {ai?.ingresos_pobreza ? (
          <Bullet label="Ingresos y pobreza (CASEN 2024):">
            {ai.ingresos_pobreza}
          </Bullet>
        ) : m?.pct_pobreza_ingresos != null ? (
          <Bullet label="Ingresos y pobreza (CASEN 2024):">
            La pobreza por ingresos alcanza el {pct1(m.pct_pobreza_ingresos)} (nacional ~17,3%){m.pct_pobreza_extrema != null ? `; la pobreza extrema el ${pct1(m.pct_pobreza_extrema)}` : ''}{m.pct_pobreza_multidimensional != null ? `; la pobreza multidimensional el ${pct1(m.pct_pobreza_multidimensional)}` : ''}.
          </Bullet>
        ) : null}

        {/* Educación */}
        {ai?.educacion_nota ? (
          <Bullet label="Educación (Censo 2024):">
            {ai.educacion_nota}
          </Bullet>
        ) : m?.anios_escolaridad_promedio != null ? (
          <Bullet label="Educación (Censo 2024):">
            {dec1(m.anios_escolaridad_promedio)} años de escolaridad promedio en población de 18 años o más{m.pct_educacion_superior != null ? `; ${pct1(m.pct_educacion_superior)} con educación superior` : ''}.
          </Bullet>
        ) : null}

        {/* Salud */}
        {ai?.salud_nota ? (
          <Bullet label="Salud (CASEN 2024):">
            {ai.salud_nota}
          </Bullet>
        ) : m?.pct_fonasa != null ? (
          <Bullet label="Salud:">
            {pct1(m.pct_fonasa)} de la población adscrita a FONASA{m.lista_espera_n != null ? `; ${fmt(m.lista_espera_n)} personas en lista de espera` : ''}.
          </Bullet>
        ) : null}

        {/* Vivienda */}
        {ai?.vivienda_nota ? (
          <Bullet label="Vivienda (Censo 2024):">
            {ai.vivienda_nota}
          </Bullet>
        ) : (m?.deficit_habitacional != null || m?.pct_hacinamiento != null || m?.pct_acceso_agua_publica != null) ? (
          <Bullet label="Vivienda (Censo 2024):">
            {m?.pct_hacinamiento != null ? `Hacinamiento en ${pct1(m.pct_hacinamiento)} de las viviendas` : ''}
            {m?.pct_acceso_agua_publica != null ? `${m?.pct_hacinamiento != null ? '; ' : ''}acceso a agua de red pública ${pct1(m.pct_acceso_agua_publica)}` : ''}
            {m?.deficit_habitacional != null ? `${(m?.pct_hacinamiento != null || m?.pct_acceso_agua_publica != null) ? '; ' : ''}déficit habitacional de ${fmt(m.deficit_habitacional)} viviendas` : ''}
            {m?.pct_jefatura_mujer != null ? `; jefatura femenina de hogar ${pct1(m.pct_jefatura_mujer)}` : ''}.
          </Bullet>
        ) : null}

        {/* Seguridad */}
        {ai?.seguridad_nota ? (
          <Bullet label={`Seguridad pública (LeyStop Carabineros${ls?.semana ? `, semana ${ls.semana}` : ''}):`}>
            {ai.seguridad_nota}
          </Bullet>
        ) : ls ? (
          <Bullet label={`Seguridad pública (LeyStop Carabineros${ls.semana ? `, semana ${ls.semana}` : ''}):`}>
            {ls.casos_anno_fecha != null ? `${fmt(ls.casos_anno_fecha)} casos registrados en lo que va del año` : ''}
            {ls.var_anno_fecha != null ? `, con una variación anual de ${ls.var_anno_fecha > 0 ? '+' : ''}${ls.var_anno_fecha.toFixed(1).replace('.', ',')}%` : ''}.
          </Bullet>
        ) : null}

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* III. PLAN REGIONAL DE GOBIERNO (PREGO)                               */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        <Text style={s.sectionTitle}>III. Plan Regional de Gobierno (PREGO)</Text>

        {ai?.prego_intro && (
          <Text style={s.para}>{ai.prego_intro}</Text>
        )}

        {ai?.prego_ejes?.map(eje => (
          <View key={eje.numero}>
            <Text style={s.ejeTitle}>{eje.numero}. {eje.nombre}</Text>
            {eje.items.map((item, i) => (
              <View key={i} style={s.ejeItem}>
                <Text style={s.ejeLetter}>{item.letra}.</Text>
                <Text style={s.ejeText}>{parseBold(item.texto)}</Text>
              </View>
            ))}
          </View>
        ))}

        {!ai?.prego_ejes?.length && (
          <Text style={s.para}>
            El Plan Regional de Gobierno se encuentra en proceso de consolidación. Su detalle se incorporará en la siguiente iteración de la minuta.
          </Text>
        )}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerTxt} render={({ pageNumber }) => `${pageNumber}`} />
        </View>

      </Page>
    </Document>
  )
}
