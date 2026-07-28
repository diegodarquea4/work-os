import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

/**
 * Acta estándar de sesión del comité (metodología DCI, spec §6.5).
 * Estructura: encabezado → antecedentes → asistencia → indicadores →
 * temas por institución → compromisos (verificados + nuevos) → pie.
 *
 * Patrón MinutaEjecutiva: paleta C, StyleSheet único, fuente Carlito
 * (registrada por registerPdfFonts() ANTES del render — lo hace
 * lib/sesiones/generarActa.ts). El componente no fetchea: recibe ActaData
 * pre-armado server-side.
 */

export type ActaData = {
  nombreInstancia: string
  regionNombre: string
  sesionNumero: number
  fecha: string                       // YYYY-MM-DD
  lugar: string | null
  preside: string | null
  asistencia: {
    nombre: string
    cargo: string | null
    institucion: string
    calidad: 'titular' | 'suplente' | 'invitado'
    presente: boolean
  }[]
  indicadores: {
    titulo: string
    tipo: 'suma' | 'pulso'
    unidad: string | null
    valor: number
    valorAnterior: number | null
    acumulado: number | null          // solo suma (post-cierre); null en pulso
  }[]
  apuntes: { institucion: string; texto: string }[]
  compVerificados: {
    descripcion: string
    institucion: string
    nombre: string | null
    plazo: string | null
    estado: 'pendiente' | 'en_curso' | 'cumplido'
  }[]
  compNuevos: {
    descripcion: string
    institucion: string
    nombre: string | null
    plazo: string | null
  }[]
  generadoPor: string | null
  generadoEn: string                  // display, ya formateado
}

const C = {
  wine:      '#6b1d2c',
  navy:      '#1a2744',
  white:     '#ffffff',
  border:    '#dddddd',
  bgLight:   '#f5f5f5',
  textDark:  '#111111',
  textMid:   '#555555',
  textLight: '#888888',
  verde:     '#16a34a',
  azul:      '#2563eb',
  gris:      '#9ca3af',
} as const

const ESTADO_LABEL = { pendiente: 'Pendiente', en_curso: 'En curso', cumplido: 'Cumplido' } as const
const ESTADO_COLOR = { pendiente: C.gris, en_curso: C.azul, cumplido: C.verde } as const

function fmtFecha(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })
  } catch { return iso }
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString('es-CL') : n.toLocaleString('es-CL', { maximumFractionDigits: 2 })
}

const s = StyleSheet.create({
  page: { fontFamily: 'Carlito', fontSize: 9, color: C.textDark, backgroundColor: C.white, paddingBottom: 40 },

  ph: {
    paddingHorizontal: 24, paddingVertical: 12,
    borderBottomWidth: 2, borderBottomColor: C.wine, marginBottom: 12,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
  },
  phOrg:   { fontSize: 7, color: C.textLight },
  phTitle: { fontSize: 14, fontFamily: 'Carlito', fontWeight: 'bold', color: C.wine, marginTop: 2 },
  phSub:   { fontSize: 9, color: C.textMid, marginTop: 1 },
  phChip:  { backgroundColor: C.wine, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 2 },
  phChipTx:{ fontSize: 8, fontFamily: 'Carlito', fontWeight: 'bold', color: C.white, letterSpacing: 0.5 },

  body: { paddingHorizontal: 24 },
  sh:   { backgroundColor: C.wine, paddingVertical: 4, paddingHorizontal: 8, marginBottom: 6, marginTop: 10 },
  shTx: { fontSize: 9, fontFamily: 'Carlito', fontWeight: 'bold', color: C.white, letterSpacing: 0.3 },

  metaRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: C.border, paddingVertical: 3 },
  metaK:   { width: 130, fontSize: 8.5, color: C.textLight },
  metaV:   { flex: 1, fontSize: 8.5, fontFamily: 'Carlito', fontWeight: 'bold' },

  th:  { flexDirection: 'row', backgroundColor: C.bgLight, borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: 3, paddingHorizontal: 4 },
  thT: { fontSize: 7.5, fontFamily: 'Carlito', fontWeight: 'bold', color: C.textMid, textTransform: 'uppercase' },
  tr2: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: C.border, paddingVertical: 3.5, paddingHorizontal: 4 },
  td:  { fontSize: 8.5 },

  instBlock: { marginBottom: 7 },
  instName:  { fontSize: 9, fontFamily: 'Carlito', fontWeight: 'bold', color: C.navy, marginBottom: 2 },
  instText:  { fontSize: 8.5, lineHeight: 1.5, color: C.textDark },

  estadoChip: { fontSize: 7.5, fontFamily: 'Carlito', fontWeight: 'bold', color: C.white, paddingHorizontal: 4, paddingVertical: 1.5, borderRadius: 2 },

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

export default function ActaComitePdf({ data }: { data: ActaData }) {
  const presentes = data.asistencia.filter(a => a.presente)
  return (
    <Document title={`Acta ${data.nombreInstancia} N°${data.sesionNumero} — ${data.regionNombre}`}>
      <Page size="A4" style={s.page}>
        {/* Encabezado */}
        <View style={s.ph} fixed>
          <View>
            <Text style={s.phOrg}>Ministerio del Interior · División de Coordinación Interministerial · PSG</Text>
            <Text style={s.phTitle}>Acta — {data.nombreInstancia}</Text>
            <Text style={s.phSub}>Región de {data.regionNombre}</Text>
          </View>
          <View style={s.phChip}>
            <Text style={s.phChipTx}>SESIÓN N° {data.sesionNumero}</Text>
          </View>
        </View>

        <View style={s.body}>
          {/* Antecedentes */}
          <SH>I. Antecedentes</SH>
          <View style={s.metaRow}><Text style={s.metaK}>Fecha de la sesión</Text><Text style={s.metaV}>{fmtFecha(data.fecha)}</Text></View>
          <View style={s.metaRow}><Text style={s.metaK}>Lugar</Text><Text style={s.metaV}>{data.lugar ?? '—'}</Text></View>
          <View style={s.metaRow}><Text style={s.metaK}>Preside</Text><Text style={s.metaV}>{data.preside ?? '—'}</Text></View>
          <View style={s.metaRow}>
            <Text style={s.metaK}>Asistencia</Text>
            <Text style={s.metaV}>{presentes.length} de {data.asistencia.length} convocados</Text>
          </View>

          {/* Asistencia */}
          <SH>II. Asistencia</SH>
          <View style={s.th}>
            <Text style={[s.thT, { flex: 3 }]}>Nombre</Text>
            <Text style={[s.thT, { flex: 3 }]}>Cargo / Institución</Text>
            <Text style={[s.thT, { flex: 1 }]}>Calidad</Text>
            <Text style={[s.thT, { flex: 1 }]}>Asiste</Text>
          </View>
          {data.asistencia.map((a, i) => (
            <View key={i} style={s.tr2} wrap={false}>
              <Text style={[s.td, { flex: 3, fontFamily: 'Carlito', fontWeight: 'bold' }]}>{a.nombre}</Text>
              <Text style={[s.td, { flex: 3, color: C.textMid }]}>{a.cargo ? `${a.cargo} · ` : ''}{a.institucion}</Text>
              <Text style={[s.td, { flex: 1 }]}>
                {a.calidad === 'invitado' ? 'Invitado/a' : a.calidad === 'titular' ? 'Titular' : 'Suplente'}
              </Text>
              <Text style={[s.td, { flex: 1, color: a.presente ? C.verde : C.textLight }]}>{a.presente ? 'Sí' : 'No'}</Text>
            </View>
          ))}
          {data.asistencia.length === 0 && <Text style={s.vacio}>Sin registro de asistencia.</Text>}

          {/* Indicadores */}
          <SH>III. Indicadores de la sesión</SH>
          <View style={s.th}>
            <Text style={[s.thT, { flex: 4 }]}>Indicador</Text>
            <Text style={[s.thT, { flex: 1 }]}>Tipo</Text>
            <Text style={[s.thT, { flex: 1.4, textAlign: 'right' }]}>Sesión anterior</Text>
            <Text style={[s.thT, { flex: 1.4, textAlign: 'right' }]}>Esta sesión</Text>
            <Text style={[s.thT, { flex: 1.4, textAlign: 'right' }]}>Acumulado</Text>
          </View>
          {data.indicadores.map((ind, i) => (
            <View key={i} style={s.tr2} wrap={false}>
              <Text style={[s.td, { flex: 4 }]}>{ind.titulo}{ind.unidad ? ` (${ind.unidad})` : ''}</Text>
              <Text style={[s.td, { flex: 1, color: C.textMid }]}>{ind.tipo === 'pulso' ? 'Pulso' : 'Suma'}</Text>
              <Text style={[s.td, { flex: 1.4, textAlign: 'right', color: C.textMid }]}>
                {ind.valorAnterior != null ? fmtNum(ind.valorAnterior) : '—'}
              </Text>
              <Text style={[s.td, { flex: 1.4, textAlign: 'right', fontFamily: 'Carlito', fontWeight: 'bold' }]}>{fmtNum(ind.valor)}</Text>
              <Text style={[s.td, { flex: 1.4, textAlign: 'right' }]}>
                {ind.tipo === 'suma' && ind.acumulado != null ? fmtNum(ind.acumulado) : '—'}
              </Text>
            </View>
          ))}
          {data.indicadores.length === 0 && <Text style={s.vacio}>No se digitaron indicadores en esta sesión.</Text>}

          {/* Temas por institución */}
          <SH>IV. Temas por institución</SH>
          {data.apuntes.length === 0 ? (
            <Text style={s.vacio}>Sin apuntes registrados.</Text>
          ) : data.apuntes.map((a, i) => (
            <View key={i} style={s.instBlock} wrap={false}>
              <Text style={s.instName}>{a.institucion}</Text>
              <Text style={s.instText}>{a.texto || '—'}</Text>
            </View>
          ))}

          {/* Compromisos */}
          <SH>V. Compromisos</SH>
          <Text style={{ fontSize: 8.5, fontFamily: 'Carlito', fontWeight: 'bold', color: C.navy, marginBottom: 3 }}>
            a) Verificación de compromisos de sesiones anteriores
          </Text>
          {data.compVerificados.length === 0 ? (
            <Text style={s.vacio}>Sin compromisos anteriores por verificar.</Text>
          ) : data.compVerificados.map((c, i) => (
            <View key={i} style={s.tr2} wrap={false}>
              <View style={{ flex: 5 }}>
                <Text style={s.td}>{c.descripcion}</Text>
                <Text style={[s.td, { color: C.textMid, fontSize: 7.5, marginTop: 1 }]}>
                  {c.institucion}{c.nombre ? ` · ${c.nombre}` : ''}{c.plazo ? ` · plazo ${fmtFecha(c.plazo)}` : ''}
                </Text>
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end', justifyContent: 'center' }}>
                <Text style={[s.estadoChip, { backgroundColor: ESTADO_COLOR[c.estado] }]}>{ESTADO_LABEL[c.estado]}</Text>
              </View>
            </View>
          ))}

          <Text style={{ fontSize: 8.5, fontFamily: 'Carlito', fontWeight: 'bold', color: C.navy, marginBottom: 3, marginTop: 8 }}>
            b) Compromisos nuevos de esta sesión
          </Text>
          {data.compNuevos.length === 0 ? (
            <Text style={s.vacio}>No se registraron compromisos nuevos.</Text>
          ) : data.compNuevos.map((c, i) => (
            <View key={i} style={s.tr2} wrap={false}>
              <View style={{ flex: 1 }}>
                <Text style={s.td}>{c.descripcion}</Text>
                <Text style={[s.td, { color: C.textMid, fontSize: 7.5, marginTop: 1 }]}>
                  Responsable: {c.institucion}{c.nombre ? ` · ${c.nombre}` : ''}{c.plazo ? ` · plazo ${fmtFecha(c.plazo)}` : ''}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Pie */}
        <View style={s.footer} fixed>
          <Text style={s.footTx}>
            Generado por PSG · {data.generadoEn}{data.generadoPor ? ` · ${data.generadoPor}` : ''}
          </Text>
          <Text style={s.footTx} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
