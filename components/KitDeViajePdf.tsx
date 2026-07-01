/**
 * KitDeViajePdf — renderer PDF multi-página del Kit de Viaje (Fase B).
 *
 * Consume `KitDeViajeData` (contrato de lib/kitDeViaje/types.ts) — el mismo
 * objeto que Fase C consumirá para el .docx. Cero data-fetching acá: si un
 * campo no está en `data`, la subsección no se renderiza.
 *
 * Layout:
 *   - Portada (página 1): cover con branding Ministerio + región + fecha.
 *   - Índice (página 2): TOC estático.
 *   - Sección I — Caracterización general
 *   - Sección II — Indicadores socioeconómicos clave
 *   - Sección III — PREGO (o disclaimer si estado !== 'ok')
 *   - Sección IV — Autoridades regionales (skeleton Fase B, real en Fase D)
 *
 * Header/footer fijos desde página 2 vía `<View fixed>`. Portada no tiene
 * header ni footer — es full-bleed institucional.
 *
 * Visual language heredado de components/FichaRegional.tsx (mismo Carlito,
 * mismos borders, mismos tonos) para que la transición no sea disruptiva.
 * Diferencias: portada, TOC, sección IV, y page-breaks explícitos entre
 * secciones (I → II → III → IV).
 */

import {
  Document, Page, Text, View, StyleSheet, Image,
} from '@react-pdf/renderer'
import type {
  KitDeViajeData,
  Bullet as TBullet,
  IndicadorFila,
  EjePrego,
} from '@/lib/kitDeViaje/types'
import { TITULO_SECCIONES } from '@/lib/kitDeViaje/constants'

// ── Styles ──────────────────────────────────────────────────────────────────

const COLORS = {
  ink:        '#111',
  inkSoft:    '#333',
  muted:      '#666',
  hairline:   '#ddd',
  border:     '#999',
  bgHeader:   '#e8e8e8',
  bgAccent:   '#f0f5ff',
  bgCover:    '#1e3a8a',    // azul institucional para portada
  onCover:    '#ffffff',
  disclaimer: '#fff8e1',    // fondo suave amarillo para cajas de "info no disponible"
  disclaimerBorder: '#d4a017',
}

const s = StyleSheet.create({
  // Page shell
  page: {
    fontFamily: 'Carlito', fontSize: 10, color: COLORS.ink,
    paddingTop: 60, paddingBottom: 50, paddingHorizontal: 56,
  },
  pageCover: {
    fontFamily: 'Carlito', color: COLORS.onCover,
    backgroundColor: COLORS.bgCover,
    padding: 0,
  },

  // Cover
  coverInner: {
    flex: 1, paddingHorizontal: 72, paddingVertical: 120,
    justifyContent: 'space-between',
  },
  coverLogo: { width: 140, height: 'auto' },
  coverBrand: { fontSize: 11, letterSpacing: 1.5, marginTop: 24, opacity: 0.9 },
  coverBrandLine2: { fontSize: 11, opacity: 0.9, marginTop: 4 },
  coverMainBlock: {},
  coverKicker: { fontSize: 14, letterSpacing: 2, marginBottom: 12, opacity: 0.9 },
  coverTitle: { fontSize: 36, fontWeight: 'bold', lineHeight: 1.1 },
  coverRegion: { fontSize: 28, marginTop: 8, opacity: 0.95 },
  coverFecha: { fontSize: 14, marginTop: 40, letterSpacing: 1, opacity: 0.9 },

  // Header / Footer (fixed en páginas de contenido)
  pageHeader: {
    position: 'absolute', top: 24, left: 56, right: 56,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderBottomWidth: 0.5, borderBottomColor: COLORS.hairline, paddingBottom: 6,
  },
  pageHeaderLogo: { width: 30, height: 'auto' },
  pageHeaderCenter: { fontSize: 8, color: COLORS.muted, letterSpacing: 1 },
  pageHeaderRegion: { fontSize: 9, color: COLORS.inkSoft, fontWeight: 'bold' },
  pageFooter: {
    position: 'absolute', bottom: 24, left: 56, right: 56,
    flexDirection: 'row', justifyContent: 'space-between',
  },
  pageFooterMuted: { fontSize: 8, color: COLORS.muted },

  // Índice
  indexTitle: { fontSize: 18, fontWeight: 'bold', marginTop: 20, marginBottom: 24 },
  indexRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: COLORS.hairline },
  indexNum: { width: 40, fontSize: 11, fontWeight: 'bold' },
  indexText: { flex: 1, fontSize: 11 },

  // Section headers
  sectionTitle: {
    fontSize: 15, fontWeight: 'bold', marginBottom: 12,
    paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: COLORS.ink,
  },
  subSectionTitle: { fontSize: 11, fontWeight: 'bold', marginTop: 12, marginBottom: 6 },

  // Prose
  para: { fontSize: 10, lineHeight: 1.55, textAlign: 'justify', marginBottom: 8 },
  paraLast: { fontSize: 10, lineHeight: 1.55, textAlign: 'justify', marginBottom: 4 },

  // Bullets (label • value con nota opcional)
  bulletRow: { flexDirection: 'row', marginBottom: 6, alignItems: 'flex-start' },
  bulletDot: { width: 12, fontSize: 10, lineHeight: 1.4 },
  bulletBody: { flex: 1, fontSize: 10, lineHeight: 1.4 },
  bulletLabel: { fontWeight: 'bold' },
  bulletValue: {},
  bulletNota: { color: COLORS.muted, fontSize: 9 },

  // Tables
  tableContainer: { marginTop: 4, marginBottom: 10, borderWidth: 0.5, borderColor: COLORS.border },
  tableHeaderRow: { flexDirection: 'row', backgroundColor: COLORS.bgHeader, borderBottomWidth: 0.5, borderColor: COLORS.border },
  tableRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: COLORS.hairline },
  tableCell: { fontSize: 9, paddingVertical: 3, paddingHorizontal: 6, lineHeight: 1.3 },
  tableHeaderCell: { fontSize: 9, fontWeight: 'bold', paddingVertical: 4, paddingHorizontal: 6 },
  tableCellNota: { fontSize: 8, color: COLORS.muted },

  // PREGO
  ejeBlock: { marginBottom: 14 },
  ejeTitle: { fontSize: 12, fontWeight: 'bold', marginBottom: 6 },
  ejeMeta: { flexDirection: 'row', marginBottom: 6, gap: 12, flexWrap: 'wrap' },
  ejeChip: {
    fontSize: 8, paddingVertical: 2, paddingHorizontal: 6,
    borderRadius: 3, backgroundColor: COLORS.bgHeader, color: COLORS.inkSoft,
  },
  ejeResumenRow: { flexDirection: 'row', marginBottom: 8, gap: 6 },
  semaforoChip: {
    fontSize: 9, paddingVertical: 2, paddingHorizontal: 5,
    borderRadius: 3, color: COLORS.ink,
  },
  semaforoVerde:  { backgroundColor: '#c8e6c9' },
  semaforoAmbar:  { backgroundColor: '#ffe0b2' },
  semaforoRojo:   { backgroundColor: '#ffcdd2' },
  semaforoGris:   { backgroundColor: '#e0e0e0' },
  destacadaRow: { flexDirection: 'row', paddingVertical: 3, borderBottomWidth: 0.25, borderBottomColor: COLORS.hairline },
  destacadaSemaforo: { width: 12, fontSize: 12, lineHeight: 1 },
  destacadaNombre: { flex: 1, fontSize: 9, lineHeight: 1.3 },
  destacadaMinisterio: { fontSize: 8, color: COLORS.muted, marginTop: 1 },
  destacadaPct: { width: 44, fontSize: 9, textAlign: 'right' },

  // Disclaimer callout
  disclaimerBox: {
    backgroundColor: COLORS.disclaimer,
    borderLeftWidth: 3, borderLeftColor: COLORS.disclaimerBorder,
    padding: 10, marginBottom: 10,
  },
  disclaimerText: { fontSize: 10, lineHeight: 1.5, color: COLORS.inkSoft },

  // Provincias (Sec I)
  provinciasTitle: { fontSize: 10, fontWeight: 'bold', marginTop: 6, marginBottom: 4 },
})

// ── Primitives ─────────────────────────────────────────────────────────────

function BulletList({ items }: { items: TBullet[] }) {
  return (
    <View>
      {items.map((b, i) => (
        <View key={i} style={s.bulletRow}>
          <Text style={s.bulletDot}>•</Text>
          <Text style={s.bulletBody}>
            <Text style={s.bulletLabel}>{b.label}: </Text>
            <Text style={s.bulletValue}>{b.value}</Text>
            {b.nota ? <Text style={s.bulletNota}> ({b.nota})</Text> : null}
          </Text>
        </View>
      ))}
    </View>
  )
}

function PdfTable({ headers, rows, colWidths }: {
  headers: string[]
  rows: { cells: string[]; nota?: string }[]
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
        <View key={ri} style={s.tableRow}>
          {row.cells.map((c, ci) => (
            <View key={ci} style={{ width: `${colWidths[ci]}%` }}>
              <Text style={s.tableCell}>{c}</Text>
              {ci === row.cells.length - 1 && row.nota
                ? <Text style={[s.tableCell, s.tableCellNota]}>{row.nota}</Text>
                : null}
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}

function Disclaimer({ text }: { text: string }) {
  return (
    <View style={s.disclaimerBox}>
      <Text style={s.disclaimerText}>{text}</Text>
    </View>
  )
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={s.sectionTitle}>{children}</Text>
}

// ── Header / Footer fijos ───────────────────────────────────────────────────

function PageHeader({ data }: { data: KitDeViajeData }) {
  return (
    <View style={s.pageHeader} fixed>
      {data.branding.logo_data_url
        ? <Image src={data.branding.logo_data_url} style={s.pageHeaderLogo} />
        : <View style={s.pageHeaderLogo} />}
      <Text style={s.pageHeaderCenter}>KIT DE VIAJE</Text>
      <Text style={s.pageHeaderRegion}>REGIÓN DE {data.region.nombre.toUpperCase()}</Text>
    </View>
  )
}

function PageFooter({ data }: { data: KitDeViajeData }) {
  return (
    <View style={s.pageFooter} fixed>
      <Text style={s.pageFooterMuted}>{data.branding.division}</Text>
      <Text
        style={s.pageFooterMuted}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
      />
    </View>
  )
}

// ── Portada ────────────────────────────────────────────────────────────────

function Portada({ data }: { data: KitDeViajeData }) {
  return (
    <Page size="A4" style={s.pageCover}>
      <View style={s.coverInner}>
        <View>
          {data.branding.logo_data_url && (
            <Image src={data.branding.logo_data_url} style={s.coverLogo} />
          )}
          <Text style={s.coverBrand}>{data.branding.ministerio.toUpperCase()}</Text>
          <Text style={s.coverBrandLine2}>{data.branding.division}</Text>
        </View>

        <View style={s.coverMainBlock}>
          <Text style={s.coverKicker}>KIT DE VIAJE</Text>
          <Text style={s.coverTitle}>Región de {data.region.nombre}</Text>
          {data.region.capital && (
            <Text style={s.coverRegion}>Capital: {data.region.capital}</Text>
          )}
          <Text style={s.coverFecha}>{data.fecha.display}</Text>
        </View>
      </View>
    </Page>
  )
}

// ── Índice ─────────────────────────────────────────────────────────────────

function Indice({ data }: { data: KitDeViajeData }) {
  const rows: { num: string; text: string }[] = [
    { num: 'I.',   text: TITULO_SECCIONES.I  },
    { num: 'II.',  text: TITULO_SECCIONES.II },
    { num: 'III.', text: TITULO_SECCIONES.III },
    { num: 'IV.',  text: TITULO_SECCIONES.IV },
  ]
  return (
    <Page size="A4" style={s.page}>
      <PageHeader data={data} />
      <PageFooter data={data} />
      <Text style={s.indexTitle}>Índice</Text>
      {rows.map((r, i) => (
        <View key={i} style={s.indexRow}>
          <Text style={s.indexNum}>{r.num}</Text>
          <Text style={s.indexText}>{r.text}</Text>
        </View>
      ))}
    </Page>
  )
}

// ── Sección I — Caracterización general ────────────────────────────────────

function SeccionI({ data }: { data: KitDeViajeData }) {
  const { caracterizacion, region } = data
  return (
    <Page size="A4" style={s.page}>
      <PageHeader data={data} />
      <PageFooter data={data} />

      <SectionTitle>{TITULO_SECCIONES.I}</SectionTitle>

      {caracterizacion.parrafos.map((p, i) => (
        <Text key={i} style={i === caracterizacion.parrafos.length - 1 ? s.paraLast : s.para}>
          {p}
        </Text>
      ))}

      {caracterizacion.bullets.length > 0 && (
        <>
          <Text style={s.subSectionTitle}>Indicadores territoriales</Text>
          <BulletList items={caracterizacion.bullets} />
        </>
      )}

      {caracterizacion.provincias_tabla && caracterizacion.provincias_tabla.length > 0 && (
        <>
          <Text style={s.provinciasTitle}>Provincias y comunas de la {region.nombre === 'Metropolitana' ? 'Región' : `Región de ${region.nombre}`}</Text>
          <PdfTable
            headers={['Provincia', 'Comunas']}
            rows={caracterizacion.provincias_tabla.map(p => ({ cells: [p.provincia, p.comunas] }))}
            colWidths={[28, 72]}
          />
        </>
      )}
    </Page>
  )
}

// ── Sección II — Indicadores socioeconómicos ───────────────────────────────

function SeccionII({ data }: { data: KitDeViajeData }) {
  const { indicadores } = data
  const narrativas: Array<{ label: string; text: string }> = []
  if (indicadores.pib_comentario)    narrativas.push({ label: 'Economía y PIB',        text: indicadores.pib_comentario })
  if (indicadores.matriz_productiva) narrativas.push({ label: 'Matriz productiva',      text: indicadores.matriz_productiva })
  if (indicadores.ingresos_pobreza)  narrativas.push({ label: 'Ingresos y pobreza',     text: indicadores.ingresos_pobreza })
  if (indicadores.educacion_nota)    narrativas.push({ label: 'Educación',              text: indicadores.educacion_nota })
  if (indicadores.salud_nota)        narrativas.push({ label: 'Salud',                  text: indicadores.salud_nota })
  if (indicadores.vivienda_nota)     narrativas.push({ label: 'Vivienda',               text: indicadores.vivienda_nota })
  if (indicadores.seguridad_nota)    narrativas.push({ label: 'Seguridad',              text: indicadores.seguridad_nota })

  return (
    <Page size="A4" style={s.page}>
      <PageHeader data={data} />
      <PageFooter data={data} />

      <SectionTitle>{TITULO_SECCIONES.II}</SectionTitle>

      {indicadores.tendencia_general && (
        <Text style={s.para}>{indicadores.tendencia_general}</Text>
      )}

      {indicadores.bullets.length > 0 && (
        <BulletList items={indicadores.bullets} />
      )}

      {indicadores.mercado_laboral_tabla && indicadores.mercado_laboral_tabla.length > 0 && (
        <>
          <Text style={s.subSectionTitle}>Mercado laboral</Text>
          <PdfTable
            headers={['Indicador', 'Valor']}
            rows={indicadores.mercado_laboral_tabla.map((r: IndicadorFila) => ({
              cells: [r.indicador, r.valor],
              nota: r.nota,
            }))}
            colWidths={[70, 30]}
          />
        </>
      )}

      {narrativas.map((n, i) => (
        <View key={i} wrap={false}>
          <Text style={s.subSectionTitle}>{n.label}</Text>
          <Text style={s.para}>{n.text}</Text>
        </View>
      ))}
    </Page>
  )
}

// ── Sección III — PREGO ────────────────────────────────────────────────────

function EjeBlock({ eje }: { eje: EjePrego }) {
  const { resumen } = eje
  const totalTxt = `${resumen.total_iniciativas} iniciativa${resumen.total_iniciativas === 1 ? '' : 's'}`
  const semaforoChips: Array<{ label: string; bg: string }> = []
  if (resumen.semaforo.verde > 0) semaforoChips.push({ label: `${resumen.semaforo.verde} verde`, bg: '#c8e6c9' })
  if (resumen.semaforo.ambar > 0) semaforoChips.push({ label: `${resumen.semaforo.ambar} ámbar`, bg: '#ffe0b2' })
  if (resumen.semaforo.rojo  > 0) semaforoChips.push({ label: `${resumen.semaforo.rojo} rojo`,   bg: '#ffcdd2' })
  if (resumen.semaforo.gris  > 0) semaforoChips.push({ label: `${resumen.semaforo.gris} gris`,   bg: '#e0e0e0' })

  return (
    <View style={s.ejeBlock} wrap={false}>
      <Text style={s.ejeTitle}>Eje {eje.numero}: {eje.nombre}</Text>

      <View style={s.ejeMeta}>
        <Text style={s.ejeChip}>{totalTxt}</Text>
        {resumen.pct_avance_promedio != null && (
          <Text style={s.ejeChip}>Avance promedio: {resumen.pct_avance_promedio}%</Text>
        )}
      </View>

      {semaforoChips.length > 0 && (
        <View style={s.ejeResumenRow}>
          {semaforoChips.map((c, i) => (
            <Text key={i} style={[s.semaforoChip, { backgroundColor: c.bg }]}>{c.label}</Text>
          ))}
        </View>
      )}

      {resumen.nota_sin_datos && (
        <Text style={s.bulletNota}>{resumen.nota_sin_datos}</Text>
      )}

      {eje.narrativa && (
        <Text style={s.para}>{eje.narrativa}</Text>
      )}

      {eje.progreso_cualitativo && (
        <>
          <Text style={s.subSectionTitle}>Estado de avance</Text>
          <Text style={s.para}>{eje.progreso_cualitativo}</Text>
        </>
      )}

      {resumen.iniciativas_destacadas.length > 0 && (
        <>
          <Text style={s.subSectionTitle}>Iniciativas destacadas</Text>
          {resumen.iniciativas_destacadas.map((ini, i) => (
            <View key={i} style={s.destacadaRow}>
              <Text style={s.destacadaSemaforo}>
                {ini.estado_semaforo === 'verde' ? '●' :
                 ini.estado_semaforo === 'ambar' ? '●' :
                 ini.estado_semaforo === 'rojo'  ? '●' : '○'}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={s.destacadaNombre}>{ini.nombre}</Text>
                {ini.ministerio && (
                  <Text style={s.destacadaMinisterio}>{ini.ministerio}</Text>
                )}
              </View>
              <Text style={s.destacadaPct}>
                {ini.pct_avance != null ? `${ini.pct_avance}%` : '—'}
              </Text>
            </View>
          ))}
        </>
      )}
    </View>
  )
}

function SeccionIII({ data }: { data: KitDeViajeData }) {
  const { prego } = data
  return (
    <Page size="A4" style={s.page}>
      <PageHeader data={data} />
      <PageFooter data={data} />

      <SectionTitle>{TITULO_SECCIONES.III}</SectionTitle>

      {prego.disclaimer && <Disclaimer text={prego.disclaimer} />}

      {prego.intro && !prego.disclaimer && (
        <Text style={s.para}>{prego.intro}</Text>
      )}

      {prego.sin_iniciativas_nota && (
        <Disclaimer text={prego.sin_iniciativas_nota} />
      )}

      {prego.ejes.map((eje) => (
        <EjeBlock key={eje.numero} eje={eje} />
      ))}

      {prego.sin_eje_asignado_count != null && prego.sin_eje_asignado_count > 0 && (
        <Text style={[s.para, { color: COLORS.muted, fontSize: 9 }]}>
          Nota: {prego.sin_eje_asignado_count} iniciativa
          {prego.sin_eje_asignado_count === 1 ? '' : 's'} sin eje asignado en el panel
          {prego.sin_eje_asignado_count === 1 ? ' queda' : ' quedan'} fuera del desglose por eje.
        </Text>
      )}
    </Page>
  )
}

// ── Sección IV — Autoridades ────────────────────────────────────────────────

function SeccionIV({ data }: { data: KitDeViajeData }) {
  const { autoridades } = data
  return (
    <Page size="A4" style={s.page}>
      <PageHeader data={data} />
      <PageFooter data={data} />

      <SectionTitle>{TITULO_SECCIONES.IV}</SectionTitle>

      {!autoridades.disponible && autoridades.disclaimer && (
        <Disclaimer text={autoridades.disclaimer} />
      )}

      {/* Fase D: renderizar autoridades.grupos con tarjetas agrupadas.
          Por ahora solo skeleton — disponible=false pinta el disclaimer. */}
    </Page>
  )
}

// ── Root ────────────────────────────────────────────────────────────────────

export default function KitDeViajePdf({ data }: { data: KitDeViajeData }) {
  return (
    <Document
      title={`Kit de Viaje — Región de ${data.region.nombre}`}
      author={data.branding.division}
      subject={`Kit de Viaje ${data.fecha.display}`}
    >
      <Portada data={data} />
      <Indice data={data} />
      <SeccionI data={data} />
      <SeccionII data={data} />
      <SeccionIII data={data} />
      <SeccionIV data={data} />
    </Document>
  )
}
