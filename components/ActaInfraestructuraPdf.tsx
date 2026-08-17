import { Document, Page, Text, View } from '@react-pdf/renderer'
import {
  s, C, fmtFecha,
  PageChrome, TitleBlock, SH, SubHead, MetaRow, EstadoChip, Vacio,
  type ActaBranding,
} from './actaPdfBase'

/**
 * Acta estándar de sesión del Comité de Infraestructura (mig 060) — CRI o
 * Mesa Técnica Regional Interministerial. Estructura propia (no clona
 * ActaComitePdf ni ActaGabinetePdf: ni reporte por institución ni Mesa
 * Empleo/proyectos/oficios, ni panorama por eje ni "Temas a tratar"):
 * antecedentes (con el tipo de sesión) → asistencia → iniciativas
 * contempladas (con el tag configurado) → compromisos (verificados + nuevos,
 * marcando cuáles se enviaron al Gabinete Regional).
 *
 * Estilo SOBRIO de Minuta Regional (components/actaPdfBase.tsx). No fetchea:
 * recibe ActaInfraestructuraData pre-armado server-side.
 */

export type ActaInfraestructuraData = ActaBranding & {
  nombreInstancia: string
  tipoComite: 'cri' | 'mesa_tecnica' | null
  tag: string
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
  iniciativas: {
    nombre: string
    semaforo: string | null
    pctAvance: number | null
    acuerdo: string | null
  }[]
  compVerificados: {
    descripcion: string
    institucion: string
    nombre: string | null
    plazo: string | null
    estado: 'pendiente' | 'en_curso' | 'cumplido'
    enviadoAGabinete: boolean
    megaproyecto: string | null
  }[]
  compNuevos: {
    descripcion: string
    institucion: string
    nombre: string | null
    plazo: string | null
    enviadoAGabinete: boolean
    iniciativaNombre: string | null
    megaproyecto: string | null
  }[]
  generadoPor: string | null
  generadoEn: string                  // display, ya formateado
}

const ESTADO_LABEL = { pendiente: 'Pendiente', en_curso: 'En curso', cumplido: 'Cumplido' } as const
const ESTADO_COLOR = { pendiente: C.gris, en_curso: C.azul, cumplido: C.verde } as const
const SEM_COLOR: Record<string, string> = { rojo: C.rojo, ambar: C.ambar, verde: C.verde }
const TIPO_LABEL = { cri: 'Comité Regional Interministerial de Infraestructura (CRI)', mesa_tecnica: 'Mesa Técnica Regional Interministerial' } as const

export default function ActaInfraestructuraPdf({ data }: { data: ActaInfraestructuraData }) {
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
        <MetaRow k="Tipo de sesión" v={data.tipoComite ? TIPO_LABEL[data.tipoComite] : '—'} />
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

        {/* Iniciativas contempladas — las de la etiqueta configurada, no "en foco" */}
        <SH>{`III. Iniciativas contempladas (etiqueta "${data.tag}")`}</SH>
        {data.iniciativas.length === 0 ? (
          <Vacio>No se contemplaron iniciativas con esta etiqueta en la sesión.</Vacio>
        ) : data.iniciativas.map((ini, i) => (
          <View key={i} style={[s.tr, { flexDirection: 'column' }]} wrap={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[s.td, { flex: 1, fontFamily: 'Carlito', fontWeight: 'bold' }]}>{ini.nombre}</Text>
              <Text style={[s.td, { width: 70, textAlign: 'right', color: ini.semaforo ? (SEM_COLOR[ini.semaforo] ?? C.gris) : C.gris, fontFamily: 'Carlito', fontWeight: 'bold' }]}>
                {ini.semaforo ? ini.semaforo.toUpperCase() : '—'}
              </Text>
              <Text style={[s.td, { width: 45, textAlign: 'right', color: C.muted }]}>
                {ini.pctAvance != null ? `${Math.round(ini.pctAvance)}%` : '—'}
              </Text>
            </View>
            {ini.acuerdo && <Text style={s.acuerdo}>Acuerdo: {ini.acuerdo}</Text>}
          </View>
        ))}

        {/* Compromisos */}
        <SH>IV. Compromisos</SH>
        <SubHead>a) Verificación de compromisos de sesiones anteriores</SubHead>
        {data.compVerificados.length === 0 ? (
          <Vacio>Sin compromisos anteriores por verificar.</Vacio>
        ) : data.compVerificados.map((c, i) => (
          <View key={i} style={s.tr} wrap={false}>
            <View style={{ flex: 5 }}>
              <Text style={s.td}>
                {c.enviadoAGabinete && <Text style={s.originTag}>[→ GABINETE REGIONAL] </Text>}
                {c.megaproyecto && <Text style={s.originTag}>[{c.megaproyecto}] </Text>}
                {c.descripcion}
              </Text>
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
              <Text style={s.td}>
                {c.enviadoAGabinete && <Text style={s.originTag}>[→ GABINETE REGIONAL] </Text>}
                {c.megaproyecto && <Text style={s.originTag}>[{c.megaproyecto}] </Text>}
                {c.descripcion}
              </Text>
              <Text style={[s.td, { color: C.muted, fontSize: 8, marginTop: 1 }]}>
                Responsable: {c.institucion}{c.nombre ? ` · ${c.nombre}` : ''}{c.plazo ? ` · plazo ${fmtFecha(c.plazo)}` : ''}
                {c.iniciativaNombre ? ` · Iniciativa: ${c.iniciativaNombre}` : ''}
              </Text>
            </View>
          </View>
        ))}
      </Page>
    </Document>
  )
}
