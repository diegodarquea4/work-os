import { Document, Page, Text, View } from '@react-pdf/renderer'
import {
  s, C, fmtFecha, fmtNum,
  PageChrome, TitleBlock, SH, SubHead, MetaRow, EstadoChip, SeccionChip, Vacio,
  type ActaBranding,
} from './actaPdfBase'

/**
 * Acta estándar de sesión del comité (metodología DCI, spec §6.5).
 * Estructura: encabezado → antecedentes → asistencia → temas tratados →
 * compromisos (verificados + nuevos) → pie.
 *
 * Estilo SOBRIO de Minuta Regional (ver components/actaPdfBase.tsx): logo +
 * banda del Gobierno, títulos de sección en negrita con hairline, paleta
 * neutra. El componente no fetchea: recibe ActaData pre-armado server-side.
 */

export type ActaData = ActaBranding & {
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
    empleosSesion: number | null
    acumulado: number
    objetivo: number
    pctAvance: number | null          // null si objetivo=0 (evita división por cero)
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

const ESTADO_LABEL = { pendiente: 'Pendiente', en_curso: 'En curso', cumplido: 'Cumplido' } as const
const ESTADO_COLOR = { pendiente: C.gris, en_curso: C.azul, cumplido: C.verde } as const
const SECCION_LABEL = { mesa_empleo: 'Mesa Empleo', seguimiento_inversion: 'Seguimiento Inversión', general: 'General' } as const

export default function ActaComitePdf({ data }: { data: ActaData }) {
  const presentes = data.asistencia.filter(a => a.presente)
  const footerLeft = `Generado por PSG · ${data.generadoEn}${data.generadoPor ? ` · ${data.generadoPor}` : ''}`

  return (
    <Document title={`Acta ${data.nombreInstancia} N°${data.sesionNumero} — ${data.regionNombre}`}>
      <Page size="A4" style={s.page} wrap>
        <PageChrome
          branding={data}
          fecha={fmtFecha(data.fecha)}
          sesionLabel={`Sesión N° ${data.sesionNumero}`}
          footerLeft={footerLeft}
        />

        <TitleBlock
          title={`Acta — ${data.nombreInstancia}`}
          region={data.regionNombre}
          meta={`Sesión N° ${data.sesionNumero} · ${fmtFecha(data.fecha)}`}
        />

        {/* Antecedentes */}
        <SH>I. Antecedentes</SH>
        <MetaRow k="Fecha de la sesión" v={fmtFecha(data.fecha)} />
        <MetaRow k="Lugar" v={data.lugar ?? '—'} />
        <MetaRow k="Preside" v={data.preside ?? '—'} />
        <MetaRow k="Asistencia" v={`${presentes.length} de ${data.asistencia.length} convocados`} />

        {/* Asistencia */}
        <SH>II. Asistencia</SH>
        <View style={s.th}>
          <Text style={[s.thT, { flex: 3 }]}>Nombre</Text>
          <Text style={[s.thT, { flex: 3 }]}>Cargo / Institución</Text>
          <Text style={[s.thT, { flex: 1 }]}>Calidad</Text>
          <Text style={[s.thT, { flex: 1 }]}>Asiste</Text>
        </View>
        {data.asistencia.map((a, i) => (
          <View key={i} style={s.tr} wrap={false}>
            <Text style={[s.td, { flex: 3, fontFamily: 'Carlito', fontWeight: 'bold' }]}>{a.nombre}</Text>
            <Text style={[s.td, { flex: 3, color: C.muted }]}>{a.cargo ? `${a.cargo} · ` : ''}{a.institucion}</Text>
            <Text style={[s.td, { flex: 1 }]}>
              {a.calidad === 'invitado' ? 'Invitado/a' : a.calidad === 'titular' ? 'Titular' : 'Suplente'}
            </Text>
            <Text style={[s.td, { flex: 1, color: a.presente ? C.verde : C.faint }]}>{a.presente ? 'Sí' : 'No'}</Text>
          </View>
        ))}
        {data.asistencia.length === 0 && <Vacio>Sin registro de asistencia.</Vacio>}

        {data.variante === 'policial' ? (
          <>
            {/* Temas tratados — reporte por institución (mig 048) */}
            <SH>III. Temas tratados</SH>
            {data.instituciones.length === 0 ? (
              <Vacio>No se registraron temas por institución en esta sesión.</Vacio>
            ) : data.instituciones.map((inst, ii) => {
              const numericas = inst.filas.filter(f => f.tipo === 'numerico')
              const textos    = inst.filas.filter(f => f.tipo === 'texto')
              return (
                <View key={ii} style={{ marginBottom: 9 }}>
                  <Text style={[s.blockName, { marginTop: 5 }]}>{inst.label}</Text>
                  {numericas.length > 0 && (
                    <View style={s.th}>
                      <Text style={[s.thT, { flex: 3 }]}>Ítem</Text>
                      <Text style={[s.thT, { flex: 2 }]}>Información proporcionada</Text>
                      <Text style={[s.thT, { flex: 3 }]}>Observaciones</Text>
                    </View>
                  )}
                  {numericas.map((f, fi) => (
                    <View key={fi} wrap={false}>
                      <View style={s.tr}>
                        <Text style={[s.td, { flex: 3, fontFamily: 'Carlito', fontWeight: 'bold' }]}>{f.nombre}</Text>
                        <Text style={[s.td, { flex: 2 }]}>{f.valor}</Text>
                        <Text style={[s.td, { flex: 3, color: C.muted }]}>{f.observaciones ?? ''}</Text>
                      </View>
                      {f.desglose.map((d, di) => (
                        <View key={di} style={{ flexDirection: 'row', paddingHorizontal: 5, paddingVertical: 1.5 }}>
                          <Text style={[s.td, { flex: 3, color: C.muted, fontSize: 8.5, paddingLeft: 12 }]}>· {d.etiqueta}</Text>
                          <Text style={[s.td, { flex: 2, color: C.muted, fontSize: 8.5 }]}>{d.valor}</Text>
                          <Text style={{ flex: 3 }}></Text>
                        </View>
                      ))}
                    </View>
                  ))}
                  {textos.map((f, ti) => (
                    <View key={`t${ti}`} style={[s.block, { marginTop: 4 }]} wrap={false}>
                      <Text style={[s.blockText, { fontFamily: 'Carlito', fontWeight: 'bold' }]}>{f.nombre}</Text>
                      <Text style={s.blockText}>{f.valor}</Text>
                      {f.observaciones && <Text style={[s.blockText, { color: C.muted, fontSize: 9 }]}>{f.observaciones}</Text>}
                    </View>
                  ))}
                </View>
              )
            })}
          </>
        ) : (
          <>
            {/* Mesa Empleo — Meta Empleo */}
            {data.metaEmpleo && (
              <>
                <SH>III. Mesa Empleo — Meta Empleo</SH>
                <MetaRow
                  k="Empleos generados esta sesión"
                  v={data.metaEmpleo.empleosSesion != null ? fmtNum(data.metaEmpleo.empleosSesion) : '—'}
                />
                <MetaRow
                  k="Acumulado"
                  v={`${fmtNum(data.metaEmpleo.acumulado)}${data.metaEmpleo.objetivo > 0 ? ` de ${fmtNum(data.metaEmpleo.objetivo)}` : ''}${data.metaEmpleo.pctAvance != null ? ` (${data.metaEmpleo.pctAvance}% avance)` : ''}`}
                />
                {data.metaEmpleo.objetivo > 0 && (
                  <View style={s.barTrack}>
                    <View style={[s.barFill, { width: `${Math.min(100, data.metaEmpleo.pctAvance ?? 0)}%` }]} />
                  </View>
                )}
              </>
            )}

            {/* Proyectos tratados */}
            <SH>IV. Proyectos tratados en profundidad</SH>
            {data.proyectosTratados.length === 0 ? (
              <Vacio>Sin proyectos tratados en esta sesión.</Vacio>
            ) : data.proyectosTratados.map((p, i) => (
              <View key={i} style={s.block} wrap={false}>
                <Text style={s.blockName}>{p.nombre}</Text>
                <Text style={s.blockText}>{p.nota || '—'}</Text>
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
              <View key={i} style={s.tr} wrap={false}>
                <Text style={[s.td, { flex: 3 }]}>{o.nombreProyecto}</Text>
                <Text style={[s.td, { flex: 2, color: C.muted }]}>{o.oaeca}</Text>
                <Text style={[s.td, { flex: 1.2, textAlign: 'right' }]}>{fmtFecha(o.fechaLimite)}</Text>
                <Text style={[s.td, { flex: 1, color: o.estado === 'resuelto' ? C.verde : C.muted }]}>
                  {o.estado === 'resuelto' ? 'Resuelto' : 'Pendiente'}
                </Text>
              </View>
            ))}
            {data.oficiosTratados.length === 0 && <Vacio>Sin oficios tratados en esta sesión.</Vacio>}
          </>
        )}

        {/* Compromisos — VI en Inversión (III Mesa Empleo + IV Proyectos + V Oficios la preceden), IV en Policial */}
        <SH>{`${data.variante === 'inversion' ? 'VI' : 'IV'}. Compromisos`}</SH>
        <SubHead>a) Verificación de compromisos de sesiones anteriores</SubHead>
        {data.compVerificados.length === 0 ? (
          <Vacio>Sin compromisos anteriores por verificar.</Vacio>
        ) : data.compVerificados.map((c, i) => (
          <View key={i} style={s.tr} wrap={false}>
            <View style={{ flex: 5 }}>
              {c.seccion && <SeccionChip label={SECCION_LABEL[c.seccion]} />}
              <Text style={s.td}>{c.descripcion}</Text>
              <Text style={[s.td, { color: C.muted, fontSize: 8, marginTop: 1 }]}>
                {c.institucion}{c.nombre ? ` · ${c.nombre}` : ''}{c.plazo ? ` · plazo ${fmtFecha(c.plazo)}` : ''}
              </Text>
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end', justifyContent: 'center' }}>
              <EstadoChip label={ESTADO_LABEL[c.estado]} color={ESTADO_COLOR[c.estado]} />
            </View>
          </View>
        ))}

        <SubHead>b) Compromisos nuevos de esta sesión</SubHead>
        {data.compNuevos.length === 0 ? (
          <Vacio>No se registraron compromisos nuevos.</Vacio>
        ) : data.compNuevos.map((c, i) => (
          <View key={i} style={s.tr} wrap={false}>
            <View style={{ flex: 1 }}>
              {c.seccion && <SeccionChip label={SECCION_LABEL[c.seccion]} />}
              <Text style={s.td}>{c.descripcion}</Text>
              <Text style={[s.td, { color: C.muted, fontSize: 8, marginTop: 1 }]}>
                Responsable: {c.institucion}{c.nombre ? ` · ${c.nombre}` : ''}{c.plazo ? ` · plazo ${fmtFecha(c.plazo)}` : ''}
              </Text>
            </View>
          </View>
        ))}
      </Page>
    </Document>
  )
}
