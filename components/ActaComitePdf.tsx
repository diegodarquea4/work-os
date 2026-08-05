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
  // 'policial' → sección III es el reporte por institución (mig 048).
  // 'inversion' (Comité Económico) → sección III es Mesa Empleo (Meta
  // Empleo, mig 052), IV/V son Proyectos/Oficios tratados (Seguimiento de
  // la Inversión). Este comité no tiene eje ni metricas_eje (mig 049).
  variante: 'policial' | 'inversion'
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
  // Reporte por institución (mig 048): Carabineros/PDI/Armada/Gendarmería.
  // `valor` viene pre-formateado (número+unidad o texto). Solo instituciones
  // con datos; filas sin dato ya filtradas server-side.
  instituciones: {
    label: string
    filas: {
      nombre: string
      unidad: string | null
      tipo: 'numerico' | 'texto'
      valor: string
      observaciones: string | null
      desglose: { etiqueta: string; valor: string }[]
    }[]
  }[]
  // Mesa Empleo (mig 052) — solo 'inversion'. null si la sesión no digitó
  // empleos generados (el acumulado de la región igual se muestra).
  metaEmpleo: {
    acumulado: number
    objetivo: number
    pctAvance: number | null          // null si objetivo=0 (evita división por cero)
    focoProductivo: string | null     // mig 054
  } | null
  // Subsidios (mig 053) — solo 'inversion'. cupos: total declarado por región.
  subsidios: {
    postulados: number
    entregados: number
    empresasPostulantes: number
    cupos: number
    pctAvance: number | null          // postulados/cupos, null si cupos=0
  } | null
  proyectosTratados: { nombre: string; nota: string | null }[]
  oficiosTratados: {
    nombreProyecto: string
    oaeca: string
    fechaLimite: string | null
    estado: 'pendiente' | 'resuelto'
  }[]
  // `seccion` solo aplica a variante 'inversion' — genera el tag Mesa Empleo /
  // Seguimiento de la Inversión / General. null en Comité Policial.
  compVerificados: {
    descripcion: string
    institucion: string
    nombre: string | null
    plazo: string | null
    estado: 'pendiente' | 'en_curso' | 'cumplido'
    seccion: 'mesa_empleo' | 'seguimiento_inversion' | 'general' | null
  }[]
  compNuevos: {
    descripcion: string
    institucion: string
    nombre: string | null
    plazo: string | null
    seccion: 'mesa_empleo' | 'seguimiento_inversion' | 'general' | null
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
  return n.toLocaleString('es-CL')
}

const SECCION_LABEL = { mesa_empleo: 'Mesa Empleo', seguimiento_inversion: 'Seguimiento Inversión', general: 'General' } as const

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
  seccionChip: { fontSize: 7, fontFamily: 'Carlito', fontWeight: 'bold', color: C.textMid, backgroundColor: C.bgLight, paddingHorizontal: 4, paddingVertical: 1.5, borderRadius: 2, alignSelf: 'flex-start' },

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

          {data.variante === 'policial' ? (
            <>
              {/* Temas tratados — reporte por institución (mig 048) */}
              <SH>III. Temas tratados</SH>
              {data.instituciones.length === 0 ? (
                <Text style={s.vacio}>No se registraron temas por institución en esta sesión.</Text>
              ) : data.instituciones.map((inst, ii) => {
                const numericas = inst.filas.filter(f => f.tipo === 'numerico')
                const textos    = inst.filas.filter(f => f.tipo === 'texto')
                return (
                  <View key={ii} style={{ marginBottom: 8 }}>
                    <Text style={[s.instName, { marginTop: 4 }]}>{inst.label}</Text>
                    {numericas.length > 0 && (
                      <View style={s.th}>
                        <Text style={[s.thT, { flex: 3 }]}>Ítem</Text>
                        <Text style={[s.thT, { flex: 2 }]}>Información proporcionada</Text>
                        <Text style={[s.thT, { flex: 3 }]}>Observaciones</Text>
                      </View>
                    )}
                    {numericas.map((f, fi) => (
                      <View key={fi} wrap={false}>
                        <View style={s.tr2}>
                          <Text style={[s.td, { flex: 3, fontFamily: 'Carlito', fontWeight: 'bold' }]}>{f.nombre}</Text>
                          <Text style={[s.td, { flex: 2 }]}>{f.valor}</Text>
                          <Text style={[s.td, { flex: 3, color: C.textMid }]}>{f.observaciones ?? ''}</Text>
                        </View>
                        {f.desglose.map((d, di) => (
                          <View key={di} style={{ flexDirection: 'row', paddingHorizontal: 4, paddingVertical: 1 }}>
                            <Text style={[s.td, { flex: 3, color: C.textMid, fontSize: 8, paddingLeft: 12 }]}>· {d.etiqueta}</Text>
                            <Text style={[s.td, { flex: 2, color: C.textMid, fontSize: 8 }]}>{d.valor}</Text>
                            <Text style={{ flex: 3 }}></Text>
                          </View>
                        ))}
                      </View>
                    ))}
                    {textos.map((f, ti) => (
                      <View key={`t${ti}`} style={[s.instBlock, { marginTop: 4 }]} wrap={false}>
                        <Text style={[s.instText, { fontFamily: 'Carlito', fontWeight: 'bold' }]}>{f.nombre}</Text>
                        <Text style={s.instText}>{f.valor}</Text>
                        {f.observaciones && <Text style={[s.instText, { color: C.textMid, fontSize: 8 }]}>{f.observaciones}</Text>}
                      </View>
                    ))}
                  </View>
                )
              })}
            </>
          ) : (
            <>
              {/* Mesa Empleo — Meta Empleo + Subsidios */}
              {(data.metaEmpleo || data.subsidios) && <SH>III. Mesa Empleo</SH>}
              {data.metaEmpleo && (
                <>
                  <Text style={[s.instName, { marginTop: 2 }]}>Meta Empleo</Text>
                  <View style={s.metaRow}>
                    <Text style={s.metaK}>Empleos generados</Text>
                    <Text style={s.metaV}>
                      {fmtNum(data.metaEmpleo.acumulado)}
                      {data.metaEmpleo.objetivo > 0 ? ` de ${fmtNum(data.metaEmpleo.objetivo)}` : ''}
                      {data.metaEmpleo.pctAvance != null ? ` (${data.metaEmpleo.pctAvance}% de la meta)` : ''}
                    </Text>
                  </View>
                  {data.metaEmpleo.objetivo > 0 && (
                    <View style={{ height: 6, backgroundColor: C.bgLight, borderRadius: 3, marginTop: 4, marginBottom: 6, overflow: 'hidden' }}>
                      <View style={{ height: 6, width: `${Math.min(100, data.metaEmpleo.pctAvance ?? 0)}%`, backgroundColor: C.wine }} />
                    </View>
                  )}
                  {data.metaEmpleo.focoProductivo && (
                    <Text style={{ fontSize: 8, color: C.textMid, fontStyle: 'italic', marginBottom: 8 }}>
                      Foco productivo: {data.metaEmpleo.focoProductivo}
                    </Text>
                  )}
                </>
              )}
              {data.subsidios && (
                <>
                  <Text style={[s.instName, { marginTop: 6 }]}>Subsidios</Text>
                  <View style={s.metaRow}>
                    <Text style={s.metaK}>Postulados</Text>
                    <Text style={s.metaV}>
                      {fmtNum(data.subsidios.postulados)}
                      {data.subsidios.cupos > 0 ? ` de ${fmtNum(data.subsidios.cupos)} cupos` : ''}
                      {data.subsidios.pctAvance != null ? ` (${data.subsidios.pctAvance}%)` : ''}
                    </Text>
                  </View>
                  {data.subsidios.cupos > 0 && (
                    <View style={{ height: 6, backgroundColor: C.bgLight, borderRadius: 3, marginTop: 4, marginBottom: 4, overflow: 'hidden' }}>
                      <View style={{ height: 6, width: `${Math.min(100, data.subsidios.pctAvance ?? 0)}%`, backgroundColor: C.azul }} />
                    </View>
                  )}
                  <View style={s.metaRow}>
                    <Text style={s.metaK}>Entregados</Text>
                    <Text style={s.metaV}>{fmtNum(data.subsidios.entregados)}</Text>
                  </View>
                  <View style={[s.metaRow, { marginBottom: 8 }]}>
                    <Text style={s.metaK}>Empresas postulantes</Text>
                    <Text style={s.metaV}>{fmtNum(data.subsidios.empresasPostulantes)}</Text>
                  </View>
                </>
              )}

              {/* Proyectos tratados */}
              <SH>IV. Proyectos tratados en profundidad</SH>
              {data.proyectosTratados.length === 0 ? (
                <Text style={s.vacio}>Sin proyectos tratados en esta sesión.</Text>
              ) : data.proyectosTratados.map((p, i) => (
                <View key={i} style={s.instBlock} wrap={false}>
                  <Text style={s.instName}>{p.nombre}</Text>
                  <Text style={s.instText}>{p.nota || '—'}</Text>
                </View>
              ))}

              {/* Oficios tratados */}
              <SH>V. Oficios tratados</SH>
              <View style={s.th}>
                <Text style={[s.thT, { flex: 3 }]}>Proyecto</Text>
                <Text style={[s.thT, { flex: 2 }]}>OAECA</Text>
                <Text style={[s.thT, { flex: 1.2, textAlign: 'right' }]}>Fecha límite</Text>
                <Text style={[s.thT, { flex: 1 }]}>Estado</Text>
              </View>
              {data.oficiosTratados.map((o, i) => (
                <View key={i} style={s.tr2} wrap={false}>
                  <Text style={[s.td, { flex: 3 }]}>{o.nombreProyecto}</Text>
                  <Text style={[s.td, { flex: 2, color: C.textMid }]}>{o.oaeca}</Text>
                  <Text style={[s.td, { flex: 1.2, textAlign: 'right' }]}>{fmtFecha(o.fechaLimite)}</Text>
                  <Text style={[s.td, { flex: 1, color: o.estado === 'resuelto' ? C.verde : C.textMid }]}>
                    {o.estado === 'resuelto' ? 'Resuelto' : 'Pendiente'}
                  </Text>
                </View>
              ))}
              {data.oficiosTratados.length === 0 && <Text style={s.vacio}>Sin oficios tratados en esta sesión.</Text>}
            </>
          )}

          {/* Compromisos — sección VI en Inversión (III Mesa Empleo + IV Proyectos + V Oficios la preceden), IV en Policial (III Temas tratados) */}
          <SH>{`${data.variante === 'inversion' ? 'VI' : 'IV'}. Compromisos`}</SH>
          <Text style={{ fontSize: 8.5, fontFamily: 'Carlito', fontWeight: 'bold', color: C.navy, marginBottom: 3 }}>
            a) Verificación de compromisos de sesiones anteriores
          </Text>
          {data.compVerificados.length === 0 ? (
            <Text style={s.vacio}>Sin compromisos anteriores por verificar.</Text>
          ) : data.compVerificados.map((c, i) => (
            <View key={i} style={s.tr2} wrap={false}>
              <View style={{ flex: 5 }}>
                {c.seccion && <Text style={[s.seccionChip, { marginBottom: 2 }]}>{SECCION_LABEL[c.seccion]}</Text>}
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
                {c.seccion && <Text style={[s.seccionChip, { marginBottom: 2 }]}>{SECCION_LABEL[c.seccion]}</Text>}
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
