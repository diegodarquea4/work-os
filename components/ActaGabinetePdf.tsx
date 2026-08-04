import { Document, Page, Text, View } from '@react-pdf/renderer'
import type { PanoramaEje } from '@/lib/sesiones/helpers'
import {
  s, C, fmtFecha,
  PageChrome, TitleBlock, SH, SubHead, MetaRow, EstadoChip, Vacio,
  type ActaBranding,
} from './actaPdfBase'

/**
 * Acta estándar de sesión del GABINETE REGIONAL (spec gabinete §7.4).
 * Clon estructural de ActaComitePdf con dos diferencias de contenido:
 * la sección de indicadores se reemplaza por el PANORAMA POR EJE (semáforos
 * agregados al cierre) y las INICIATIVAS TRATADAS con su acuerdo; los
 * compromisos marcan cuáles son mandatos y a qué comité van.
 *
 * Estilo SOBRIO de Minuta Regional (components/actaPdfBase.tsx). No fetchea:
 * recibe ActaGabineteData pre-armado server-side.
 */

export type ActaGabineteData = ActaBranding & {
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

const ESTADO_LABEL = { pendiente: 'Pendiente', en_curso: 'En curso', cumplido: 'Cumplido' } as const
const ESTADO_COLOR = { pendiente: C.gris, en_curso: C.azul, cumplido: C.verde } as const
const SEM_COLOR: Record<string, string> = { rojo: C.rojo, ambar: C.ambar, verde: C.verde }

export default function ActaGabinetePdf({ data }: { data: ActaGabineteData }) {
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
          <View key={i} style={s.tr} wrap={false}>
            <Text style={[s.td, { flex: 4 }]}>{e.eje}</Text>
            <Text style={[s.td, { flex: 1, textAlign: 'right', color: e.rojo > 0 ? C.rojo : C.faint }]}>{e.rojo}</Text>
            <Text style={[s.td, { flex: 1, textAlign: 'right', color: e.ambar > 0 ? C.ambar : C.faint }]}>{e.ambar}</Text>
            <Text style={[s.td, { flex: 1, textAlign: 'right', color: e.verde > 0 ? C.verde : C.faint }]}>{e.verde}</Text>
            <Text style={[s.td, { flex: 1, textAlign: 'right', color: C.faint }]}>{e.gris}</Text>
            <Text style={[s.td, { flex: 1.4, textAlign: 'right', fontFamily: 'Carlito', fontWeight: 'bold' }]}>{e.avgPct}%</Text>
          </View>
        ))}
        {data.panoramaEjes.length === 0 && <Vacio>Región sin iniciativas cargadas al cierre.</Vacio>}

        {/* Iniciativas tratadas — el acuerdo por iniciativa se registra como
            compromiso vinculado (sección VI), ya no inline. Se muestra el
            acuerdo solo si una sesión antigua alcanzó a guardarlo. */}
        <SH>IV. Iniciativas tratadas</SH>
        {data.iniciativas.length === 0 ? (
          <Vacio>No se trataron iniciativas en esta sesión.</Vacio>
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

        {/* Temas por cartera */}
        <SH>V. Temas por cartera</SH>
        {data.apuntes.length === 0 ? (
          <Vacio>Sin apuntes registrados.</Vacio>
        ) : data.apuntes.map((a, i) => (
          <View key={i} style={s.block} wrap={false}>
            <Text style={s.blockName}>{a.institucion}</Text>
            <Text style={s.blockText}>{a.texto || '—'}</Text>
          </View>
        ))}

        {/* Compromisos */}
        <SH>VI. Compromisos</SH>
        <SubHead>a) Verificación de compromisos anteriores (incluye escalados desde comités y mandatos)</SubHead>
        {data.compVerificados.length === 0 ? (
          <Vacio>Sin compromisos anteriores por verificar.</Vacio>
        ) : data.compVerificados.map((c, i) => (
          <View key={i} style={s.tr} wrap={false}>
            <View style={{ flex: 5 }}>
              <Text style={s.td}>
                {c.origen === 'escalado' && <Text style={s.originTag}>[ESCALADO — {c.comiteNombre ?? 'Comité'}] </Text>}
                {c.origen === 'mandato' && <Text style={s.originTag}>[MANDATO — {c.comiteNombre ?? 'Comité'}] </Text>}
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
                {c.mandatoComite && <Text style={s.originTag}>[MANDATO → {c.mandatoComite}] </Text>}
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
