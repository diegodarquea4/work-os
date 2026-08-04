import { Document, Page, Text, View } from '@react-pdf/renderer'
import {
  s, C, fmtFecha,
  PageChrome, TitleBlock, SH, MetaRow, EstadoChip, Vacio,
  type ActaBranding,
} from './actaPdfBase'

/**
 * Cronograma de la sesión del GABINETE REGIONAL — documento de PREPARACIÓN
 * (se descarga desde Gabinete → Preparación, antes de la reunión). Espeja el
 * arranque de la sesión para que la delegación llegue lista:
 *   I.   Compromisos por verificar (los abiertos del gabinete).
 *   II.  Iniciativas en foco (la agenda de la sesión).
 *   III. Trabas escaladas desde comités (subsidiariedad).
 *
 * Antes se llamaba "Temario"; se renombró a Cronograma (es una reunión, no una
 * prueba). Usa el estilo SOBRIO de Minuta Regional (components/actaPdfBase.tsx)
 * — mismo lenguaje visual que las actas. No fetchea: recibe
 * CronogramaGabineteData pre-armado server-side.
 */

export type CronogramaGabineteData = ActaBranding & {
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

const ESTADO_LABEL = { pendiente: 'Pendiente', en_curso: 'En curso', cumplido: 'Cumplido' } as const
const ESTADO_COLOR = { pendiente: C.gris, en_curso: C.azul, cumplido: C.verde } as const
const SEM_COLOR: Record<string, string> = { rojo: C.rojo, ambar: C.ambar, verde: C.verde }

const comiteTag = {
  fontSize: 7.5, fontFamily: 'Carlito', fontWeight: 'bold' as const, color: C.muted,
  backgroundColor: C.bgHeader, paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 2,
}

export default function CronogramaGabinetePdf({ data }: { data: CronogramaGabineteData }) {
  const footerLeft = `Cronograma de preparación · ${data.nombreInstancia} · ${data.regionNombre}`

  return (
    <Document title={`Cronograma ${data.nombreInstancia} — ${data.regionNombre}`}>
      <Page size="A4" style={s.page} wrap>
        <PageChrome
          branding={data}
          fecha={data.generadoEn}
          sesionLabel="Preparación"
          footerLeft={footerLeft}
        />

        <TitleBlock
          title={`Cronograma — ${data.nombreInstancia}`}
          region={data.regionNombre}
          meta={`Documento de preparación · ${data.generadoEn}`}
        />

        {/* Antecedentes de la reunión */}
        <MetaRow k="Fecha de la sesión" v="________________" />
        <MetaRow k="Iniciativas en foco" v={String(data.iniciativasFoco.length)} />

        {/* I. Compromisos por verificar */}
        <SH>I. Compromisos por verificar</SH>
        {data.compromisosVerificar.length === 0 ? (
          <Vacio>Sin compromisos del gabinete pendientes de sesiones anteriores.</Vacio>
        ) : data.compromisosVerificar.map((c, i) => (
          <View key={i} style={s.tr} wrap={false}>
            <View style={{ flex: 5 }}>
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

        {/* II. Iniciativas en foco */}
        <SH>II. Iniciativas en foco</SH>
        <View style={s.th}>
          <Text style={[s.thT, { width: 18 }]}>#</Text>
          <Text style={[s.thT, { flex: 1 }]}>Iniciativa</Text>
          <Text style={[s.thT, { width: 62, textAlign: 'right' }]}>Semáforo</Text>
          <Text style={[s.thT, { width: 46, textAlign: 'right' }]}>Avance</Text>
        </View>
        {data.iniciativasFoco.length === 0 ? (
          <Vacio>No hay iniciativas marcadas en foco.</Vacio>
        ) : data.iniciativasFoco.map((p, i) => (
          <View key={i} style={[s.tr, { flexDirection: 'column' }]} wrap={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[s.td, { width: 18, color: C.muted }]}>{i + 1}</Text>
              <Text style={[s.td, { flex: 1, fontFamily: 'Carlito', fontWeight: 'bold' }]}>{p.nombre}</Text>
              <Text style={[s.td, { width: 62, textAlign: 'right', fontFamily: 'Carlito', fontWeight: 'bold', color: p.semaforo ? (SEM_COLOR[p.semaforo] ?? C.gris) : C.gris }]}>
                {p.semaforo ? p.semaforo.toUpperCase() : '—'}
              </Text>
              <Text style={[s.td, { width: 46, textAlign: 'right', color: C.muted }]}>
                {p.pctAvance != null ? `${Math.round(p.pctAvance)}%` : '—'}
              </Text>
            </View>
            <Text style={[s.td, { color: C.muted, fontSize: 8, marginTop: 1.5, marginLeft: 18 }]}>
              {p.cartera ? p.cartera : 'Sin cartera'}
              {p.proximoHito ? ` · próximo hito ${fmtFecha(p.proximoHito)}` : ''}
              {p.responsable ? ` · resp. ${p.responsable}` : ''}
            </Text>
          </View>
        ))}

        {/* III. Trabas escaladas desde comités */}
        <SH>III. Trabas escaladas desde comités</SH>
        {data.trabasEscaladas.length === 0 ? (
          <Vacio>Sin trabas escaladas pendientes desde los comités.</Vacio>
        ) : data.trabasEscaladas.map((t, i) => (
          <View key={i} style={s.tr} wrap={false}>
            <View style={{ flex: 5 }}>
              <Text style={s.td}>{t.descripcion}</Text>
              <Text style={[s.td, { color: C.muted, fontSize: 8, marginTop: 1 }]}>
                {t.institucion}{t.nombre ? ` · ${t.nombre}` : ''}{t.plazo ? ` · plazo ${fmtFecha(t.plazo)}` : ''}
                {t.iniciativaNombre ? ` · vinculada a ${t.iniciativaNombre}` : ''}
              </Text>
            </View>
            <View style={{ flex: 1.4, alignItems: 'flex-end', justifyContent: 'center' }}>
              <Text style={comiteTag}>⬆ {t.comiteNombre}</Text>
            </View>
          </View>
        ))}
      </Page>
    </Document>
  )
}
