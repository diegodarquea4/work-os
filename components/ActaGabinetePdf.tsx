import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { PanoramaEje } from '@/lib/sesiones/helpers'

/**
 * Acta estándar de sesión del GABINETE REGIONAL (spec gabinete §7.4).
 * Clon estructural de ActaComitePdf con dos diferencias de contenido:
 * la sección de indicadores se reemplaza por el PANORAMA POR EJE (semáforos
 * agregados al cierre) y las INICIATIVAS TRATADAS con su acuerdo; los
 * compromisos marcan cuáles son mandatos y a qué comité van.
 *
 * Patrón MinutaEjecutiva: paleta C, StyleSheet único, fuente Carlito
 * (registrada por registerPdfFonts() ANTES del render — lo hace
 * lib/sesiones/generarActaGabinete.ts). No fetchea: recibe ActaGabineteData
 * pre-armado server-side.
 */

export type ActaGabineteData = {
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
  panoramaEjes: PanoramaEje[]
  iniciativas: {
    nombre: string
    semaforo: string | null
    pctAvance: number | null
    acuerdo: string | null
  }[]
  apuntes: { institucion: string; texto: string }[]
  compVerificados: {
    descripcion: string
    institucion: string
    nombre: string | null
    plazo: string | null
    estado: 'pendiente' | 'en_curso' | 'cumplido'
    origen: 'gabinete' | 'escalado' | 'mandato'
    comiteNombre: string | null       // escalado/mandato: nombre del comité
  }[]
  compNuevos: {
    descripcion: string
    institucion: string
    nombre: string | null
    plazo: string | null
    mandatoComite: string | null      // no-null = mandato dirigido a ese comité
    iniciativaNombre: string | null   // vínculo a iniciativa, si tiene
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
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })
  } catch { return iso }
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
  origenTag:  { fontSize: 7, fontFamily: 'Carlito', fontWeight: 'bold', color: C.navy },

  acuerdo: { fontSize: 8.5, color: C.textDark, lineHeight: 1.45, marginTop: 1.5 },

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

export default function ActaGabinetePdf({ data }: { data: ActaGabineteData }) {
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

          {/* Panorama por eje — semáforos agregados leídos al cierre */}
          <SH>III. Panorama del plan regional por eje</SH>
          <View style={s.th}>
            <Text style={[s.thT, { flex: 4 }]}>Eje</Text>
            <Text style={[s.thT, { flex: 1, textAlign: 'right' }]}>Rojo</Text>
            <Text style={[s.thT, { flex: 1, textAlign: 'right' }]}>Ámbar</Text>
            <Text style={[s.thT, { flex: 1, textAlign: 'right' }]}>Verde</Text>
            <Text style={[s.thT, { flex: 1, textAlign: 'right' }]}>Sin ev.</Text>
            <Text style={[s.thT, { flex: 1.4, textAlign: 'right' }]}>Avance</Text>
          </View>
          {data.panoramaEjes.map((e, i) => (
            <View key={i} style={s.tr2} wrap={false}>
              <Text style={[s.td, { flex: 4 }]}>{e.eje}</Text>
              <Text style={[s.td, { flex: 1, textAlign: 'right', color: e.rojo > 0 ? C.rojo : C.textLight }]}>{e.rojo}</Text>
              <Text style={[s.td, { flex: 1, textAlign: 'right', color: e.ambar > 0 ? C.ambar : C.textLight }]}>{e.ambar}</Text>
              <Text style={[s.td, { flex: 1, textAlign: 'right', color: e.verde > 0 ? C.verde : C.textLight }]}>{e.verde}</Text>
              <Text style={[s.td, { flex: 1, textAlign: 'right', color: C.textLight }]}>{e.gris}</Text>
              <Text style={[s.td, { flex: 1.4, textAlign: 'right', fontFamily: 'Carlito', fontWeight: 'bold' }]}>{e.avgPct}%</Text>
            </View>
          ))}
          {data.panoramaEjes.length === 0 && <Text style={s.vacio}>Región sin iniciativas cargadas al cierre.</Text>}

          {/* Iniciativas tratadas — el acuerdo por iniciativa se registra como
              compromiso vinculado (sección VI), ya no inline. Se muestra el
              acuerdo solo si una sesión antigua alcanzó a guardarlo. */}
          <SH>IV. Iniciativas tratadas</SH>
          {data.iniciativas.length === 0 ? (
            <Text style={s.vacio}>No se trataron iniciativas en esta sesión.</Text>
          ) : data.iniciativas.map((ini, i) => (
            <View key={i} style={[s.tr2, { flexDirection: 'column' }]} wrap={false}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[s.td, { flex: 1, fontFamily: 'Carlito', fontWeight: 'bold' }]}>{ini.nombre}</Text>
                <Text style={[s.td, { width: 70, textAlign: 'right', color: ini.semaforo ? (SEM_COLOR[ini.semaforo] ?? C.gris) : C.gris, fontFamily: 'Carlito', fontWeight: 'bold' }]}>
                  {ini.semaforo ? ini.semaforo.toUpperCase() : '—'}
                </Text>
                <Text style={[s.td, { width: 45, textAlign: 'right', color: C.textMid }]}>
                  {ini.pctAvance != null ? `${Math.round(ini.pctAvance)}%` : '—'}
                </Text>
              </View>
              {ini.acuerdo && <Text style={s.acuerdo}>Acuerdo: {ini.acuerdo}</Text>}
            </View>
          ))}

          {/* Temas por institución */}
          <SH>V. Temas por cartera</SH>
          {data.apuntes.length === 0 ? (
            <Text style={s.vacio}>Sin apuntes registrados.</Text>
          ) : data.apuntes.map((a, i) => (
            <View key={i} style={s.instBlock} wrap={false}>
              <Text style={s.instName}>{a.institucion}</Text>
              <Text style={s.instText}>{a.texto || '—'}</Text>
            </View>
          ))}

          {/* Compromisos */}
          <SH>VI. Compromisos</SH>
          <Text style={{ fontSize: 8.5, fontFamily: 'Carlito', fontWeight: 'bold', color: C.navy, marginBottom: 3 }}>
            a) Verificación de compromisos anteriores (incluye escalados desde comités y mandatos)
          </Text>
          {data.compVerificados.length === 0 ? (
            <Text style={s.vacio}>Sin compromisos anteriores por verificar.</Text>
          ) : data.compVerificados.map((c, i) => (
            <View key={i} style={s.tr2} wrap={false}>
              <View style={{ flex: 5 }}>
                <Text style={s.td}>
                  {c.origen === 'escalado' && <Text style={s.origenTag}>[ESCALADO — {c.comiteNombre ?? 'Comité'}] </Text>}
                  {c.origen === 'mandato' && <Text style={s.origenTag}>[MANDATO — {c.comiteNombre ?? 'Comité'}] </Text>}
                  {c.descripcion}
                </Text>
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
                <Text style={s.td}>
                  {c.mandatoComite && <Text style={s.origenTag}>[MANDATO → {c.mandatoComite}] </Text>}
                  {c.descripcion}
                </Text>
                <Text style={[s.td, { color: C.textMid, fontSize: 7.5, marginTop: 1 }]}>
                  Responsable: {c.institucion}{c.nombre ? ` · ${c.nombre}` : ''}{c.plazo ? ` · plazo ${fmtFecha(c.plazo)}` : ''}
                  {c.iniciativaNombre ? ` · Iniciativa: ${c.iniciativaNombre}` : ''}
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
