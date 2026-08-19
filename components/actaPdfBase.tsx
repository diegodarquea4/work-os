import { Text, View, StyleSheet, Image } from '@react-pdf/renderer'

/**
 * Base de estilos + chrome compartida por las actas de sesión
 * (ActaComitePdf, ActaGabinetePdf). Adopta el lenguaje visual SOBRIO de la
 * Minuta Regional / Contexto Regional (KitDeViajePdf), a pedido de Diego
 * (2026-08): fuera las barras vino, encabezado con logo institucional + pie
 * con la banda del Gobierno, títulos de sección en negrita con hairline,
 * Carlito más grande (10–11) y paleta neutra. Los colores semánticos
 * (semáforo, estado de compromiso) se conservan — la minuta también los usa.
 *
 * Requiere `registerPdfFonts()` ANTES del render (lo hacen los builders en
 * lib/sesiones/generarActa*.ts) para tener Carlito regular + bold.
 */

/** cm → pt (1 cm = 28,3465 pt) — el logo/pie vienen especificados en cm. */
export const CM = (cm: number) => cm * 28.3465

export const C = {
  ink:      '#111111',
  inkSoft:  '#333333',
  muted:    '#666666',
  faint:    '#888888',
  hairline: '#dddddd',
  border:   '#999999',
  bgHeader: '#e8e8e8',   // fondo de encabezado de tabla (igual que la minuta)
  bgZebra:  '#f8f8f8',
  white:    '#ffffff',
  // Semánticos (se conservan — la Minuta Regional también usa estos)
  rojo:     '#dc2626',
  ambar:    '#d97706',
  verde:    '#16a34a',
  azul:     '#2563eb',
  gris:     '#9ca3af',
} as const

export type ActaBranding = {
  logoDataUrl?: string | null
  footerBannerDataUrl?: string | null
}

export function fmtFecha(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })
  } catch { return iso }
}

export function fmtNum(n: number): string {
  return n.toLocaleString('es-CL')
}

/** "Región de Los Lagos" / "Región Metropolitana" (excepción de estilo). */
export function regionLabel(nombre: string): string {
  return nombre === 'Metropolitana' || nombre === 'RM'
    ? 'Región Metropolitana'
    : `Región de ${nombre}`
}

export const s = StyleSheet.create({
  // Shell — paddingTop deja espacio al logo del header; paddingBottom a la banda.
  page: {
    fontFamily: 'Carlito', fontSize: 10, color: C.ink, backgroundColor: C.white,
    paddingTop: 92, paddingBottom: 56, paddingHorizontal: 48,
  },

  // Encabezado fijo (logo + fecha/sesión) — sin línea ni barra de color.
  header: {
    position: 'absolute', top: 24, left: 48, right: 48,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  headerLogo: { height: CM(1.93), width: CM(2.12) },
  headerMetaBox: { alignItems: 'flex-end' },
  headerMeta: { fontSize: 8.5, color: C.muted },
  headerMetaStrong: { fontSize: 8.5, color: C.inkSoft, fontFamily: 'Carlito', fontWeight: 'bold', marginTop: 2 },

  // Pie: banda a sangre completa + línea de crédito/paginación por encima.
  footerText: {
    position: 'absolute', bottom: 34, left: 48, right: 48,
    flexDirection: 'row', justifyContent: 'space-between',
    borderTopWidth: 0.5, borderTopColor: C.hairline, paddingTop: 4,
  },
  footerTx: { fontSize: 7, color: C.faint },
  footerBanner: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center' },
  footerBannerImg: { height: CM(1.0), width: CM(21) },

  // Bloque de título del documento (en el flujo, centrado — estilo minuta).
  titleBlock: { marginBottom: 4 },
  title:    { fontSize: 15, fontFamily: 'Carlito', fontWeight: 'bold', color: C.ink, textAlign: 'center', marginBottom: 3 },
  titleSub: { fontSize: 11, color: C.inkSoft, textAlign: 'center', textDecoration: 'underline', marginBottom: 3 },
  titleMeta:{ fontSize: 9.5, color: C.muted, textAlign: 'center' },

  // Títulos de sección — negrita + hairline (reemplaza la barra vino).
  sh: {
    marginTop: 16, marginBottom: 7, paddingBottom: 3,
    borderBottomWidth: 0.75, borderBottomColor: C.border,
  },
  shTx: { fontSize: 11, fontFamily: 'Carlito', fontWeight: 'bold', color: C.ink },

  // Subtítulo dentro de sección ("a) …", "b) …").
  subHead: { fontSize: 10, fontFamily: 'Carlito', fontWeight: 'bold', color: C.inkSoft, marginBottom: 4, marginTop: 4 },

  // Filas clave/valor (Antecedentes, Mesa Empleo).
  metaRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: C.hairline, paddingVertical: 4 },
  metaK:   { width: 150, fontSize: 10, color: C.muted },
  metaV:   { flex: 1, fontSize: 10, fontFamily: 'Carlito', fontWeight: 'bold', color: C.ink },

  // Tablas.
  th:  { flexDirection: 'row', backgroundColor: C.bgHeader, paddingVertical: 4, paddingHorizontal: 5 },
  thT: { fontSize: 8.5, fontFamily: 'Carlito', fontWeight: 'bold', color: C.inkSoft, textTransform: 'uppercase' },
  tr:  { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: C.hairline, paddingVertical: 4, paddingHorizontal: 5 },
  td:  { fontSize: 9.5, color: C.ink },

  // Bloques por institución / cartera / proyecto.
  block:     { marginBottom: 8 },
  blockName: { fontSize: 10.5, fontFamily: 'Carlito', fontWeight: 'bold', color: C.ink, marginBottom: 2 },
  blockText: { fontSize: 9.5, lineHeight: 1.5, color: C.inkSoft },

  // Chips.
  estadoChip:  { fontSize: 8, fontFamily: 'Carlito', fontWeight: 'bold', color: C.white, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 2 },
  seccionChip: { fontSize: 7.5, fontFamily: 'Carlito', fontWeight: 'bold', color: C.muted, backgroundColor: C.bgHeader, paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 2, alignSelf: 'flex-start' },
  originTag:   { fontSize: 8, fontFamily: 'Carlito', fontWeight: 'bold', color: C.inkSoft },

  // Barra de avance (Mesa Empleo) — sobria: track claro + relleno tinta.
  barTrack: { height: 6, backgroundColor: C.bgHeader, borderRadius: 3, marginTop: 5, marginBottom: 8, overflow: 'hidden' },
  barFill:  { height: 6, backgroundColor: C.inkSoft },

  acuerdo: { fontSize: 9.5, color: C.ink, lineHeight: 1.45, marginTop: 2 },
  vacio:   { fontSize: 9.5, color: C.faint, fontStyle: 'italic', paddingVertical: 5, paddingHorizontal: 5 },

  // "Temas a tratar" — tema con badge numerado + subtemas colgando de un riel.
  temaRow:      { flexDirection: 'column', marginBottom: 7 },
  temaHead:     { flexDirection: 'row', alignItems: 'flex-start' },
  temaBadge:    { width: 14, height: 14, borderRadius: 7, backgroundColor: C.inkSoft, alignItems: 'center', justifyContent: 'center', marginRight: 6, marginTop: 0.5 },
  temaBadgeTx:  { fontSize: 7.5, fontFamily: 'Carlito', fontWeight: 'bold', color: C.white, lineHeight: 1 },
  temaTexto:    { flex: 1, fontSize: 10, fontFamily: 'Carlito', fontWeight: 'bold', color: C.ink, lineHeight: 1.35, marginTop: 1 },
  subRail:      { marginLeft: 7, marginTop: 3, paddingLeft: 8, borderLeftWidth: 0.75, borderLeftColor: C.hairline },
  subRow:       { flexDirection: 'row', alignItems: 'flex-start', marginTop: 2 },
  subBullet:    { width: 8, fontSize: 9, color: C.muted, lineHeight: 1.4 },
  subTx:        { flex: 1, fontSize: 9, color: C.inkSoft, lineHeight: 1.4 },

  // Franja de VISTA PREVIA (solo en la preview de acta, no en el acta oficial).
  borradorBanner: { position: 'absolute', top: 4, left: 0, right: 0, backgroundColor: C.rojo, paddingVertical: 3, alignItems: 'center' },
  borradorTx:     { fontSize: 8, fontFamily: 'Carlito', fontWeight: 'bold', color: C.white, letterSpacing: 0.5 },
})

// ── Chrome fijo (encabezado + pie) ──────────────────────────────────────────

export function PageChrome({
  branding, fecha, sesionLabel, footerLeft, borrador,
}: {
  branding: ActaBranding
  fecha: string          // ya formateado (día de generación / de la sesión)
  sesionLabel: string    // p. ej. "Sesión N° 3"
  footerLeft: string     // crédito del pie ("Generado por PSG · …")
  borrador?: boolean     // true en la vista previa → franja "BORRADOR" en cada página
}) {
  return (
    <>
      {borrador && (
        <View style={s.borradorBanner} fixed>
          <Text style={s.borradorTx}>BORRADOR · VISTA PREVIA — no es el acta oficial de la sesión</Text>
        </View>
      )}
      <View style={s.header} fixed>
        {branding.logoDataUrl
          ? <Image src={branding.logoDataUrl} style={s.headerLogo} />
          : <View style={s.headerLogo} />}
        <View style={s.headerMetaBox}>
          <Text style={s.headerMeta}>{fecha}</Text>
          <Text style={s.headerMetaStrong}>{sesionLabel}</Text>
        </View>
      </View>

      <View style={s.footerText} fixed>
        <Text style={s.footerTx}>{footerLeft}</Text>
        <Text style={s.footerTx} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
      </View>
      {branding.footerBannerDataUrl && (
        <View style={s.footerBanner} fixed>
          <Image src={branding.footerBannerDataUrl} style={s.footerBannerImg} />
        </View>
      )}
    </>
  )
}

// ── Título del documento ─────────────────────────────────────────────────────

export function TitleBlock({ title, region, meta }: { title: string; region: string; meta: string }) {
  return (
    <View style={s.titleBlock}>
      <Text style={s.title}>{title}</Text>
      <Text style={s.titleSub}>{regionLabel(region)}</Text>
      <Text style={s.titleMeta}>{meta}</Text>
    </View>
  )
}

// ── Primitivos de sección ────────────────────────────────────────────────────

export function SH({ children }: { children: string }) {
  return <View style={s.sh}><Text style={s.shTx}>{children}</Text></View>
}

export function SubHead({ children }: { children: string }) {
  return <Text style={s.subHead}>{children}</Text>
}

export function MetaRow({ k, v }: { k: string; v: string }) {
  return (
    <View style={s.metaRow}>
      <Text style={s.metaK}>{k}</Text>
      <Text style={s.metaV}>{v}</Text>
    </View>
  )
}

export function EstadoChip({ label, color }: { label: string; color: string }) {
  return <Text style={[s.estadoChip, { backgroundColor: color }]}>{label}</Text>
}

export function SeccionChip({ label }: { label: string }) {
  return <Text style={[s.seccionChip, { marginBottom: 2 }]}>{label}</Text>
}

export function Vacio({ children }: { children: string }) {
  return <Text style={s.vacio}>{children}</Text>
}

// ── "Temas a tratar" (pauta general) ─────────────────────────────────────────

/**
 * Lista producida de temas: cada tema con un badge circular numerado y sus
 * subtemas colgando de un riel de indentado con viñetas. Compartida por el acta
 * (ActaGabinetePdf, Sección III) y el cronograma (CronogramaGabinetePdf, I) —
 * mismo lenguaje que el editor in-app. El caller mantiene su propio <Vacio>
 * (el texto del vacío difiere entre acta y cronograma). `wrap={false}` por tema
 * evita partir un tema de sus subtemas en el salto de página.
 */
export function TemasList({ temas }: { temas: { texto: string; subitems: string[] }[] }) {
  return (
    <View>
      {temas.map((t, i) => (
        <View key={i} style={s.temaRow} wrap={false}>
          <View style={s.temaHead}>
            <View style={s.temaBadge}><Text style={s.temaBadgeTx}>{i + 1}</Text></View>
            <Text style={s.temaTexto}>{t.texto}</Text>
          </View>
          {t.subitems.length > 0 && (
            <View style={s.subRail}>
              {t.subitems.map((sub, si) => (
                <View key={si} style={s.subRow}>
                  <Text style={s.subBullet}>•</Text>
                  <Text style={s.subTx}>{sub}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      ))}
    </View>
  )
}
