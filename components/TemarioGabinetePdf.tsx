import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

/**
 * Temario de la sesión del GABINETE REGIONAL — documento de PREPARACIÓN
 * (se descarga desde Gabinete → Preparación, antes de la sesión). Espeja el
 * arranque de la sesión para que la delegación llegue lista:
 *   I.   Compromisos por verificar (los abiertos del gabinete).
 *   II.  Iniciativas en foco (la agenda de la sesión).
 *   III. Trabas escaladas desde comités (subsidiariedad).
 *
 * No fetchea: recibe TemarioGabineteData pre-armado server-side. Acento
 * violeta (familia visual del gabinete), fuente Carlito registrada por
 * registerPdfFonts() ANTES del render (lo hace app/api/temario-gabinete).
 * Estructura clonada de ActaGabinetePdf.
 */

export type TemarioGabineteData = {
  nombreInstancia: string
  regionNombre: string
  generadoEn: string                  // display, ya formateado
  compromisosVerificar: {
    descripcion: string
    institucion: string
    nombre: string | null
    plazo: string | null
    estado: 'pendiente' | 'en_curso' | 'cumplido'
  }[]
  iniciativasFoco: {
    nombre: string
    cartera: string | null
    semaforo: string | null
    pctAvance: number | null
    proximoHito: string | null        // YYYY-MM-DD o null
    responsable: string | null
  }[]
  trabasEscaladas: {
    descripcion: string
    comiteNombre: string
    institucion: string
    nombre: string | null
    plazo: string | null
    iniciativaNombre: string | null
  }[]
}

const C = {
  violet:    '#6d28d9',   // violet-700 (gabinete)
  navy:      '#1a2744',
  white:     '#ffffff',
  border:    '#dddddd',
  bgLight:   '#f5f5f5',
  textDark:  '#111111',
  textMid:   '#555555',
  textLight: '#888888',
  verde:     '#16a34a',
  ambar:     '#d97706',
  rojo:      '#dc2626',
  azul:      '#2563eb',
  gris:      '#9ca3af',
} as const

const ESTADO_LABEL = { pendiente: 'Pendiente', en_curso: 'En curso', cumplido: 'Cumplido' } as const
const ESTADO_COLOR = { pendiente: C.gris, en_curso: C.azul, cumplido: C.verde } as const
const SEM_COLOR: Record<string, string> = { rojo: C.rojo, ambar: C.ambar, verde: C.verde }

function fmtFecha(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return iso }
}

const s = StyleSheet.create({
  page: { fontFamily: 'Carlito', fontSize: 9, color: C.textDark, backgroundColor: C.white, paddingBottom: 40 },

  ph: {
    paddingHorizontal: 24, paddingVertical: 12,
    borderBottomWidth: 2, borderBottomColor: C.violet, marginBottom: 12,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
  },
  phOrg:   { fontSize: 7, color: C.textLight },
  phTitle: { fontSize: 14, fontFamily: 'Carlito', fontWeight: 'bold', color: C.violet, marginTop: 2 },
  phSub:   { fontSize: 9, color: C.textMid, marginTop: 1 },
  phChip:  { backgroundColor: C.violet, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 2 },
  phChipTx:{ fontSize: 8, fontFamily: 'Carlito', fontWeight: 'bold', color: C.white, letterSpacing: 0.5 },

  body: { paddingHorizontal: 24 },

  metaBox: {
    flexDirection: 'row', justifyContent: 'space-between',
    borderWidth: 0.5, borderColor: C.border, backgroundColor: C.bgLight,
    paddingHorizontal: 8, paddingVertical: 6, marginBottom: 4,
  },
  metaK: { fontSize: 8.5, color: C.textLight },
  metaV: { fontSize: 8.5, fontFamily: 'Carlito', fontWeight: 'bold', color: C.textDark },

  sh:   { backgroundColor: C.violet, paddingVertical: 4, paddingHorizontal: 8, marginBottom: 6, marginTop: 10 },
  shTx: { fontSize: 9, fontFamily: 'Carlito', fontWeight: 'bold', color: C.white, letterSpacing: 0.3 },

  th:  { flexDirection: 'row', backgroundColor: C.bgLight, borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: 3, paddingHorizontal: 4 },
  thT: { fontSize: 7.5, fontFamily: 'Carlito', fontWeight: 'bold', color: C.textMid, textTransform: 'uppercase' },

  row:      { borderBottomWidth: 0.5, borderBottomColor: C.border, paddingVertical: 4, paddingHorizontal: 4 },
  rowTop:   { flexDirection: 'row', alignItems: 'center' },
  idx:      { width: 16, fontSize: 8.5, color: C.textLight },
  nombre:   { flex: 1, fontSize: 9, fontFamily: 'Carlito', fontWeight: 'bold', color: C.textDark },
  sem:      { width: 58, textAlign: 'right', fontSize: 8, fontFamily: 'Carlito', fontWeight: 'bold' },
  pct:      { width: 40, textAlign: 'right', fontSize: 8.5, color: C.textMid },
  sub:      { fontSize: 8, color: C.textMid, marginTop: 1.5, marginLeft: 16, lineHeight: 1.4 },

  estadoChip: { fontSize: 7.5, fontFamily: 'Carlito', fontWeight: 'bold', color: C.white, paddingHorizontal: 4, paddingVertical: 1.5, borderRadius: 2 },
  comiteTag:  { fontSize: 7, fontFamily: 'Carlito', fontWeight: 'bold', color: C.navy, backgroundColor: '#eef2ff', paddingHorizontal: 4, paddingVertical: 1.5, borderRadius: 2 },
  vinc:       { fontSize: 7.5, color: C.violet },

  vacio: { fontSize: 8.5, color: C.textLight, fontStyle: 'italic', paddingVertical: 4, paddingHorizontal: 4 },

  footer: {
    position: 'absolute', bottom: 14, left: 24, right: 24,
    flexDirection: 'row', justifyContent: 'space-between',
    borderTopWidth: 0.5, borderTopColor: C.border, paddingTop: 5,
  },
  footTx: { fontSize: 7, color: C.textLight },
})

function SH({ children }: { children: string }) {
  return <View style={s.sh}><Text style={s.shTx}>{children}</Text></View>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function TemarioGabinetePdf({ data }: { data: TemarioGabineteData }): any {
  return (
    <Document title={`Temario ${data.nombreInstancia} — ${data.regionNombre}`}>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.ph}>
          <View>
            <Text style={s.phOrg}>DELEGACIÓN PRESIDENCIAL REGIONAL · {data.regionNombre.toUpperCase()}</Text>
            <Text style={s.phTitle}>Temario — {data.nombreInstancia}</Text>
            <Text style={s.phSub}>Preparado el {data.generadoEn}</Text>
          </View>
          <View style={s.phChip}><Text style={s.phChipTx}>PREPARACIÓN</Text></View>
        </View>

        <View style={s.body}>
          {/* Meta */}
          <View style={s.metaBox}>
            <Text style={s.metaK}>Fecha de la sesión: <Text style={s.metaV}>__________________</Text></Text>
            <Text style={s.metaK}>Iniciativas en foco: <Text style={s.metaV}>{data.iniciativasFoco.length}</Text></Text>
          </View>

          {/* I. Compromisos por verificar */}
          <SH>I. Compromisos por verificar</SH>
          {data.compromisosVerificar.length === 0 ? (
            <Text style={s.vacio}>Sin compromisos del gabinete pendientes de sesiones anteriores.</Text>
          ) : data.compromisosVerificar.map((c, i) => (
            <View key={i} style={s.row} wrap={false}>
              <View style={s.rowTop}>
                <Text style={[s.nombre, { fontWeight: 'normal', fontFamily: 'Carlito' }]}>{c.descripcion}</Text>
                <Text style={[s.estadoChip, { backgroundColor: ESTADO_COLOR[c.estado] }]}>{ESTADO_LABEL[c.estado]}</Text>
              </View>
              <Text style={s.sub}>
                {c.institucion}{c.nombre ? ` · ${c.nombre}` : ''}{c.plazo ? ` · plazo ${fmtFecha(c.plazo)}` : ''}
              </Text>
            </View>
          ))}

          {/* II. Iniciativas en foco */}
          <SH>II. Iniciativas en foco</SH>
          <View style={s.th}>
            <Text style={[s.thT, { width: 16 }]}>#</Text>
            <Text style={[s.thT, { flex: 1 }]}>Iniciativa</Text>
            <Text style={[s.thT, { width: 58, textAlign: 'right' }]}>Semáforo</Text>
            <Text style={[s.thT, { width: 40, textAlign: 'right' }]}>Avance</Text>
          </View>
          {data.iniciativasFoco.length === 0 ? (
            <Text style={s.vacio}>No hay iniciativas marcadas en foco.</Text>
          ) : data.iniciativasFoco.map((p, i) => (
            <View key={i} style={s.row} wrap={false}>
              <View style={s.rowTop}>
                <Text style={s.idx}>{i + 1}</Text>
                <Text style={s.nombre}>{p.nombre}</Text>
                <Text style={[s.sem, { color: p.semaforo ? (SEM_COLOR[p.semaforo] ?? C.gris) : C.gris }]}>
                  {p.semaforo ? p.semaforo.toUpperCase() : '—'}
                </Text>
                <Text style={s.pct}>{p.pctAvance != null ? `${Math.round(p.pctAvance)}%` : '—'}</Text>
              </View>
              <Text style={s.sub}>
                {p.cartera ? p.cartera : 'Sin cartera'}
                {p.proximoHito ? ` · próximo hito ${fmtFecha(p.proximoHito)}` : ''}
                {p.responsable ? ` · resp. ${p.responsable}` : ''}
              </Text>
            </View>
          ))}

          {/* III. Trabas escaladas desde comités */}
          <SH>III. Trabas escaladas desde comités</SH>
          {data.trabasEscaladas.length === 0 ? (
            <Text style={s.vacio}>Sin trabas escaladas pendientes desde los comités.</Text>
          ) : data.trabasEscaladas.map((t, i) => (
            <View key={i} style={s.row} wrap={false}>
              <View style={s.rowTop}>
                <Text style={[s.nombre, { fontWeight: 'normal', fontFamily: 'Carlito' }]}>{t.descripcion}</Text>
                <Text style={s.comiteTag}>⬆ {t.comiteNombre}</Text>
              </View>
              <Text style={s.sub}>
                {t.institucion}{t.nombre ? ` · ${t.nombre}` : ''}{t.plazo ? ` · plazo ${fmtFecha(t.plazo)}` : ''}
                {t.iniciativaNombre ? ` · vinculada a ${t.iniciativaNombre}` : ''}
              </Text>
            </View>
          ))}
        </View>

        <View style={s.footer} fixed>
          <Text style={s.footTx}>Temario de preparación · {data.nombreInstancia} · {data.regionNombre}</Text>
          <Text style={s.footTx} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
