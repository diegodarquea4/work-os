/**
 * KitDeViajePdf — renderer PDF del Kit de Viaje ("Contexto Regional").
 *
 * Consume `KitDeViajeData` (contrato de lib/kitDeViaje/types.ts) — el mismo
 * objeto que Fase C consumirá para el .docx. Cero data-fetching acá: si un
 * campo no está en `data`, la subsección no se renderiza.
 *
 * Layout (rediseño — sin portada, documento continuo tipo Word):
 *   - Encabezado: "Minuta Regional" / "Región de X" / párrafo intro / índice
 *     inline (sin página de portada ni de índice separadas).
 *   - Sección I   — Caracterización general de la región
 *   - Sección II  — Indicadores socioeconómicos clave
 *   - Sección III — Plan Regional de Gobierno Región X (vacía por ahora)
 *   - Sección IV  — Principales conflictos y alertas de la región (vacía por ahora)
 *   - Sección V   — Autoridades regionales
 *       (anexada como PDF oficial vía pdf-lib en el route cuando existe ficha;
 *       el renderer solo pinta preview + disclaimer cuando `disponible=false`)
 *
 * Header/footer fijos vía `<View fixed>` dentro de un único `<Page wrap>` —
 * el documento fluye como un Word, sin saltos de página forzados entre
 * secciones. Tipografía Carlito 11 (open-source, métricamente compatible con
 * Calibri — sustituto de Aptos, no disponible para incrustar sin licencia).
 */

import {
  Document, Page, Text, View, StyleSheet, Image,
} from '@react-pdf/renderer'
import type {
  KitDeViajeData,
  IndicadorFila,
  ProvinciaFila,
  PibSectorFila,
  AutoridadGrupo,
  Autoridad,
} from '@/lib/kitDeViaje/types'
import { TITULO_SECCIONES } from '@/lib/kitDeViaje/constants'
import { samplePreviewAutoridades } from '@/lib/kitDeViaje/sampleAutoridades'

/** cm → pt (1 cm = 28,3465 pt) — todas las medidas de header/footer vienen en cm. */
const CM = (cm: number) => cm * 28.3465

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

/** "13 de julio de 2026" — fecha del día en que se generó el documento. */
function formatFechaHeader(isoOrNull: string): string {
  const d = isoOrNull ? new Date(isoOrNull) : new Date()
  if (isNaN(d.getTime())) return ''
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`
}

// ── Styles ──────────────────────────────────────────────────────────────────

const COLORS = {
  ink:        '#111',
  inkSoft:    '#333',
  muted:      '#666',
  hairline:   '#ddd',
  border:     '#999',
  bgHeader:   '#e8e8e8',
  bgAccent:   '#f0f5ff',
  onCover:    '#ffffff',
  disclaimer: '#fff8e1',    // fondo suave amarillo para cajas de "info no disponible"
  disclaimerBorder: '#d4a017',
}

const s = StyleSheet.create({
  // Page shell — paddingTop deja espacio para el logo del header (top:24 +
  // alto 1,93cm/54,7pt): sin esto el logo se monta sobre "Minuta Regional".
  page: {
    fontFamily: 'Carlito', fontSize: 11, color: COLORS.ink,
    paddingTop: 96, paddingBottom: 50, paddingHorizontal: 56,
  },

  // Header / Footer (fixed en todas las páginas del documento) — sin líneas
  pageHeader: {
    position: 'absolute', top: 24, left: 56, right: 56,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  // 1,93 cm alto × 2,12 cm ancho (1 cm = 28,3465 pt)
  pageHeaderLogo: { height: CM(1.93), width: CM(2.12) },
  pageHeaderFechaBox: { alignItems: 'flex-end' },
  pageHeaderFecha: { fontSize: 9, color: COLORS.muted },
  pageHeaderNumero: { fontSize: 9, color: COLORS.muted, marginTop: 2 },
  // Pie de página: vacío salvo la imagen, a sangre completa (borde a borde).
  pageFooter: {
    position: 'absolute', bottom: 8, left: 0, right: 0,
    alignItems: 'center',
  },
  // Ancho a sangre completa (todo el ancho A4). Alto mayor a los 0,58cm
  // originales — a esa altura la banda se veía comprimida/aplastada al
  // estirarla al ancho completo de la página.
  pageFooterImage: { height: CM(1.2), width: CM(21) },

  // Encabezado de la minuta (reemplaza portada + índice separados)
  tituloMinuta: { fontSize: 13, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  subtituloRegion: { fontSize: 11, textAlign: 'center', textDecoration: 'underline', marginBottom: 14 },
  parrafoIntro: { fontSize: 11, lineHeight: 1.4, marginBottom: 10 },
  indiceRow: { flexDirection: 'row', marginBottom: 3 },
  indiceNum: { width: 22, fontSize: 11 },
  indiceText: { flex: 1, fontSize: 11 },

  // Section headers — sin línea ni fondo, solo negrita
  sectionTitle: { fontSize: 11, fontWeight: 'bold', marginTop: 16, marginBottom: 8 },
  subSectionTitle: { fontSize: 11, fontWeight: 'bold', marginTop: 10, marginBottom: 6 },

  // Prose
  para: { fontSize: 11, lineHeight: 1.4, textAlign: 'justify', marginBottom: 8 },
  paraLast: { fontSize: 11, lineHeight: 1.4, textAlign: 'justify', marginBottom: 4 },

  // Bullets (label • value con nota opcional)
  bulletRow: { flexDirection: 'row', marginBottom: 8, alignItems: 'flex-start' },
  bulletDot: { width: 12, fontSize: 11, lineHeight: 1.4 },
  bulletBody: { flex: 1, fontSize: 11, lineHeight: 1.4, textAlign: 'justify' },
  bulletLabel: { fontWeight: 'bold' },
  bulletValue: {},
  bulletNota: { color: COLORS.muted, fontSize: 9.5 },
  // Sub-items indentados bajo un bullet (provincias, sectores del PIB)
  subItemLabel: { fontSize: 11, fontWeight: 'bold', marginTop: 4, marginBottom: 2 },
  subItemText: { fontSize: 11, lineHeight: 1.3, marginLeft: 10, marginBottom: 2 },

  // Tables
  tableContainer: { marginTop: 4, marginBottom: 10, borderWidth: 0.5, borderColor: COLORS.border },
  tableHeaderRow: { flexDirection: 'row', backgroundColor: COLORS.bgHeader, borderBottomWidth: 0.5, borderColor: COLORS.border },
  tableRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: COLORS.hairline },
  tableCell: { fontSize: 10, paddingVertical: 3, paddingHorizontal: 6, lineHeight: 1.3 },
  tableHeaderCell: { fontSize: 10, fontWeight: 'bold', paddingVertical: 4, paddingHorizontal: 6 },
  tableCellNota: { fontSize: 9, color: COLORS.muted },

  // Disclaimer callout
  disclaimerBox: {
    backgroundColor: COLORS.disclaimer,
    borderLeftWidth: 3, borderLeftColor: COLORS.disclaimerBorder,
    padding: 10, marginBottom: 10,
  },
  disclaimerText: { fontSize: 11, lineHeight: 1.4, color: COLORS.inkSoft },

  // Provincias (Sec I)
  provinciasTitle: { fontSize: 11, fontWeight: 'bold', marginTop: 6, marginBottom: 4 },

  // Sección V — Autoridades
  previewNote: {
    fontSize: 9, color: COLORS.muted, fontStyle: 'italic',
    marginBottom: 12, letterSpacing: 0.3,
  },
  grupoBlock: { marginBottom: 16 },
  grupoTitle: {
    fontSize: 10, fontWeight: 'bold', letterSpacing: 1, color: COLORS.inkSoft,
    paddingBottom: 4, marginBottom: 8,
  },
  // Grid de tarjetas: 3 por fila con gap
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cardSingle: {
    width: '100%', padding: 10,
    borderWidth: 0.5, borderColor: COLORS.hairline, borderRadius: 2,
    marginBottom: 8, backgroundColor: '#fafafa',
  },
  card: {
    width: '32%', padding: 8,
    borderWidth: 0.5, borderColor: COLORS.hairline, borderRadius: 2,
    marginBottom: 8, backgroundColor: '#fafafa',
    minHeight: 78,
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 },
  cardNombre: { fontSize: 10, fontWeight: 'bold', color: COLORS.ink, flex: 1, marginRight: 4, lineHeight: 1.2 },
  cardNombreSingle: { fontSize: 11, fontWeight: 'bold', color: COLORS.ink, flex: 1, marginRight: 6, lineHeight: 1.2 },
  // Card con avatar: layout row [avatar] [content]
  cardBodyRow: { flexDirection: 'row', alignItems: 'flex-start' },
  cardContent: { flex: 1 },
  avatar: {
    borderRadius: 999,
    marginRight: 8,
    backgroundColor: COLORS.bgAccent,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarGrid: { width: 28, height: 28 },
  avatarSingle: { width: 44, height: 44 },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitials:       { fontSize: 10, fontWeight: 'bold', color: COLORS.ink, letterSpacing: 0.3 },
  avatarInitialsSingle: { fontSize: 14, fontWeight: 'bold', color: COLORS.ink, letterSpacing: 0.5 },
  partidoChip: {
    fontSize: 7, paddingVertical: 1, paddingHorizontal: 4,
    borderRadius: 2, backgroundColor: COLORS.bgAccent, color: COLORS.inkSoft,
    fontWeight: 'bold', letterSpacing: 0.3,
  },
  cardCargo: { fontSize: 9, color: COLORS.inkSoft, marginBottom: 4, lineHeight: 1.3 },
  cardCargoSingle: { fontSize: 10, color: COLORS.inkSoft, marginBottom: 6, lineHeight: 1.3 },
  cardContactLine: { fontSize: 8.5, color: COLORS.muted, marginBottom: 1, lineHeight: 1.25 },
  cardContactLabel: { fontWeight: 'bold', color: COLORS.inkSoft },
})

// ── Primitives ─────────────────────────────────────────────────────────────

/** Bullet de prosa simple: "• Label: texto redactado (por IA o fallback)." */
function BulletProsa({ label, texto }: { label: string; texto: string }) {
  if (!texto) return null
  return (
    <View style={s.bulletRow} wrap={false}>
      <Text style={s.bulletDot}>•</Text>
      <Text style={s.bulletBody}>
        <Text style={s.bulletLabel}>{label}: </Text>
        {texto}
      </Text>
    </View>
  )
}

/** Sección I, bullet #2 — 100% determinístico, no depende del AI. */
function BulletOrganizacion({ label, provincias }: { label: string; provincias: ProvinciaFila[] }) {
  if (provincias.length === 0) return null
  return (
    <View style={s.bulletRow}>
      <Text style={s.bulletDot}>•</Text>
      <View style={s.bulletBody}>
        <Text style={s.bulletLabel}>{label}:</Text>
        {provincias.map((p, i) => (
          <Text key={i} style={s.subItemText}>{p.provincia}: {p.comunas}</Text>
        ))}
      </View>
    </View>
  )
}

/** Sección II, bullet #1 — prosa (AI/fallback) + sub-listado determinístico de sectores. */
function BulletPib({ label, texto, sectores }: { label: string; texto: string; sectores: PibSectorFila[] }) {
  if (!texto && sectores.length === 0) return null
  return (
    <View style={s.bulletRow} wrap={false}>
      <Text style={s.bulletDot}>•</Text>
      <View style={s.bulletBody}>
        {texto && (
          <Text>
            <Text style={s.bulletLabel}>{label}: </Text>
            {texto}
          </Text>
        )}
        {sectores.length > 0 && (
          <>
            <Text style={s.subItemLabel}>Principales sectores productivos (% del PIB nominal):</Text>
            {sectores.map((sec, i) => (
              <Text key={i} style={s.subItemText}>
                {sec.sector}: {sec.pct.toLocaleString('es-CL', { minimumFractionDigits: 1 })}%
              </Text>
            ))}
          </>
        )}
      </View>
    </View>
  )
}

/** Sección II, bullet #2 — 100% determinístico: label + tabla con columna Contexto. */
function BulletMercadoLaboral({ label, periodo, tabla }: { label: string; periodo: string; tabla: IndicadorFila[] }) {
  if (tabla.length === 0) return null
  return (
    <View style={s.bulletRow} wrap={false}>
      <Text style={s.bulletDot}>•</Text>
      <View style={s.bulletBody}>
        <Text style={s.bulletLabel}>{label} (BCE/INE{periodo ? `, ${periodo}` : ''}):</Text>
        <View style={{ marginTop: 4 }}>
          <PdfTable
            headers={['Indicador', 'Valor', 'Contexto']}
            rows={tabla.map(r => ({ cells: [r.indicador, r.valor, r.contexto ?? '—'] }))}
            colWidths={[35, 20, 45]}
          />
        </View>
      </View>
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

function SectionTitle({ numeral, children }: { numeral: string; children: string }) {
  return <Text style={s.sectionTitle}>{numeral}. {children}</Text>
}

/** "Región de Los Lagos" / "Región Metropolitana" (excepción de estilo, como en el resto del documento). */
function regionLabel(nombre: string): string {
  return nombre === 'Metropolitana' ? 'Región Metropolitana' : `Región de ${nombre}`
}

// ── Header / Footer fijos ───────────────────────────────────────────────────

function PageHeader({ data }: { data: KitDeViajeData }) {
  return (
    <View style={s.pageHeader} fixed>
      {data.branding.logo_data_url
        ? <Image src={data.branding.logo_data_url} style={s.pageHeaderLogo} />
        : <View style={s.pageHeaderLogo} />}
      <View style={s.pageHeaderFechaBox}>
        <Text style={s.pageHeaderFecha}>{formatFechaHeader(data.meta.generado_en)}</Text>
        {data.numeroMinuta && (
          <Text style={s.pageHeaderNumero}>Minuta DCI N°{data.numeroMinuta}</Text>
        )}
      </View>
    </View>
  )
}

function PageFooter({ data }: { data: KitDeViajeData }) {
  if (!data.branding.footer_banner_data_url) return <View style={s.pageFooter} fixed />
  return (
    <View style={s.pageFooter} fixed>
      <Image src={data.branding.footer_banner_data_url} style={s.pageFooterImage} />
    </View>
  )
}

// ── Encabezado — título, región, párrafo intro e índice inline ─────────────

function EncabezadoMinuta({ data }: { data: KitDeViajeData }) {
  const region = regionLabel(data.region.nombre)
  const filas: { num: string; text: string }[] = [
    { num: 'I.',   text: TITULO_SECCIONES.I },
    { num: 'II.',  text: TITULO_SECCIONES.II },
    { num: 'III.', text: `${TITULO_SECCIONES.III} ${region}` },
    { num: 'IV.',  text: TITULO_SECCIONES.IV },
    { num: 'V.',   text: TITULO_SECCIONES.V },
  ]
  return (
    <View>
      <Text style={s.tituloMinuta}>Minuta Regional</Text>
      <Text style={s.subtituloRegion}>{region}</Text>
      <Text style={s.parrafoIntro}>
        La presente minuta trabajada por la División de Coordinación Interministerial, Gobierno Interior y Estudios considera:
      </Text>
      <View>
        {filas.map((f, i) => (
          <View key={i} style={s.indiceRow}>
            <Text style={s.indiceNum}>{f.num}</Text>
            <Text style={s.indiceText}>{f.text}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

// ── Sección I — Caracterización general ────────────────────────────────────

function SeccionI({ data }: { data: KitDeViajeData }) {
  const { bullets } = data.caracterizacion
  return (
    <View>
      <SectionTitle numeral="I">{TITULO_SECCIONES.I}</SectionTitle>
      <BulletProsa label="Localización y superficie" texto={bullets.localizacion_superficie} />
      <BulletOrganizacion label="Organización político-administrativa" provincias={bullets.organizacion_politico_administrativa} />
      <BulletProsa label="Población (Censo 2024)" texto={bullets.poblacion} />
      <BulletProsa label="Estructura etaria" texto={bullets.estructura_etaria} />
      <BulletProsa label="Composición" texto={bullets.composicion} />
    </View>
  )
}

// ── Sección II — Indicadores socioeconómicos ───────────────────────────────

function SeccionII({ data }: { data: KitDeViajeData }) {
  const { bullets } = data.indicadores
  return (
    <View>
      <SectionTitle numeral="II">{TITULO_SECCIONES.II}</SectionTitle>
      <BulletPib label="PIB regional" texto={bullets.pib_regional} sectores={bullets.pib_sectores} />
      <BulletMercadoLaboral label="Mercado laboral" periodo={bullets.mercado_laboral_periodo} tabla={bullets.mercado_laboral_tabla} />
      <BulletProsa label="Ingresos y pobreza (CASEN 2024)" texto={bullets.ingresos_pobreza} />
      <BulletProsa label="Educación (Censo 2024)" texto={bullets.educacion} />
      <BulletProsa label="Salud (CASEN 2024)" texto={bullets.salud} />
      <BulletProsa label="Vivienda (Censo 2024)" texto={bullets.vivienda} />
      <BulletProsa
        label={`Seguridad pública (LeyStop Carabineros${bullets.seguridad_semana ? `, ${bullets.seguridad_semana}` : ''})`}
        texto={bullets.seguridad_publica}
      />
    </View>
  )
}

// ── Sección III — Plan Regional de Gobierno ─────────────────────────────────

function SeccionIII({ data }: { data: KitDeViajeData }) {
  const { planRegional, region } = data
  // PDF disponible pero sin párrafos: el redactor de IA no corrió (falta
  // ANTHROPIC_API_KEY) o falló en silencio (soft-fail) — distinto del caso
  // "PDF no disponible", que trae su propio disclaimer desde el assembler.
  const sinRedactar = planRegional.disponible && planRegional.parrafos.length === 0
  return (
    <View>
      <SectionTitle numeral="III">{`${TITULO_SECCIONES.III} ${regionLabel(region.nombre)}`}</SectionTitle>
      {!planRegional.disponible && planRegional.disclaimer && (
        <View style={s.disclaimerBox}>
          <Text style={s.disclaimerText}>{planRegional.disclaimer}</Text>
        </View>
      )}
      {sinRedactar && (
        <View style={s.disclaimerBox}>
          <Text style={s.disclaimerText}>
            El resumen de esta sección se redacta automáticamente a partir del PDF del Plan Regional de Gobierno. No se generó en esta ejecución — verifique que el redactor de IA esté disponible y regenere la minuta.
          </Text>
        </View>
      )}
      {planRegional.parrafos.map((p, i) => (
        <Text key={i} style={i === planRegional.parrafos.length - 1 ? s.paraLast : s.para}>
          {p}
        </Text>
      ))}
    </View>
  )
}

// ── Sección IV — placeholder (contenido pendiente) ─────────────────────────

function SeccionPlaceholder({ numeral, titulo }: { numeral: string; titulo: string }) {
  return (
    <View>
      <SectionTitle numeral={numeral}>{titulo}</SectionTitle>
    </View>
  )
}

// ── Sección V — Autoridades ──────────────────────────────────────────────

/** Iniciales para el placeholder: primera letra del primer nombre + primera del último apellido. */
function computeInitials(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(p => p.length > 0)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function Avatar({ fotoUrl, initials, single }: { fotoUrl?: string; initials: string; single: boolean }) {
  const sizeStyle = single ? s.avatarSingle : s.avatarGrid
  const initialStyle = single ? s.avatarInitialsSingle : s.avatarInitials
  return (
    <View style={[s.avatar, sizeStyle]}>
      {fotoUrl
        ? <Image src={fotoUrl} style={s.avatarImage} />
        : <Text style={initialStyle}>{initials}</Text>}
    </View>
  )
}

function AutoridadCard({ a, single }: { a: Autoridad; single: boolean }) {
  const initials = computeInitials(a.nombre)
  return (
    <View style={single ? s.cardSingle : s.card} wrap={false}>
      <View style={s.cardBodyRow}>
        <Avatar fotoUrl={a.foto_url} initials={initials} single={single} />
        <View style={s.cardContent}>
          <View style={s.cardHeaderRow}>
            <Text style={single ? s.cardNombreSingle : s.cardNombre}>{a.nombre}</Text>
            {a.partido && <Text style={s.partidoChip}>{a.partido}</Text>}
          </View>
          <Text style={single ? s.cardCargoSingle : s.cardCargo}>{a.cargo}</Text>
          {a.telefono && (
            <Text style={s.cardContactLine}>
              <Text style={s.cardContactLabel}>T: </Text>{a.telefono}
            </Text>
          )}
          {a.correo && (
            <Text style={s.cardContactLine}>
              <Text style={s.cardContactLabel}>M: </Text>{a.correo}
            </Text>
          )}
        </View>
      </View>
    </View>
  )
}

function GrupoBlock({ grupo }: { grupo: AutoridadGrupo }) {
  const isSingle = grupo.layout === 'single'
  return (
    <View style={s.grupoBlock}>
      <Text style={s.grupoTitle}>{grupo.titulo}</Text>
      {isSingle ? (
        <View>
          {grupo.autoridades.map((a, i) => (
            <AutoridadCard key={i} a={a} single />
          ))}
        </View>
      ) : (
        <View style={s.cardGrid}>
          {grupo.autoridades.map((a, i) => (
            <AutoridadCard key={i} a={a} single={false} />
          ))}
        </View>
      )}
    </View>
  )
}

function SeccionV({ data }: { data: KitDeViajeData }) {
  const { autoridades } = data
  // Preview mode Fase B: cuando la sección no está disponible (Fase D pendiente),
  // renderizamos sample data para que Diego revise el layout. Cleanup: cuando
  // Fase D publique datos reales, esta rama se borra y el bloque else corre solo.
  const isPreview = !autoridades.disponible
  const grupos = isPreview ? samplePreviewAutoridades(data.region.nombre) : autoridades.grupos

  return (
    <View wrap>
      <SectionTitle numeral="V">{TITULO_SECCIONES.V}</SectionTitle>

      {isPreview && (
        <Text style={s.previewNote}>
          VISTA DE DISEÑO — DATOS DE EJEMPLO. La fuente de datos real se conecta en la próxima fase.
        </Text>
      )}

      {grupos.map((g, i) => (
        <GrupoBlock key={i} grupo={g} />
      ))}
    </View>
  )
}

// ── Root ────────────────────────────────────────────────────────────────────

export default function KitDeViajePdf({ data }: { data: KitDeViajeData }) {
  return (
    <Document
      title={`Minuta Regional — ${regionLabel(data.region.nombre)}`}
      author={data.branding.division}
      subject={`Minuta Regional ${data.fecha.display}`}
    >
      <Page size="A4" style={s.page} wrap>
        <PageHeader data={data} />
        <PageFooter data={data} />

        <EncabezadoMinuta data={data} />
        <SeccionI data={data} />
        <SeccionII data={data} />
        <SeccionIII data={data} />
        <SeccionPlaceholder numeral="IV" titulo={TITULO_SECCIONES.IV} />
        {/* Sección V: cuando disponible=true el route anexa el ficha oficial
            por post-procesamiento con pdf-lib (el ficha ES la Sección V, con
            su propio header 'FICHA DE AUTORIDADES REGIONALES'). Cuando
            disponible=false, pintamos disclaimer + sample data como preview. */}
        {!data.autoridades.disponible && <SeccionV data={data} />}
      </Page>
    </Document>
  )
}
