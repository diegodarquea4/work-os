import { Document, Page, Text, View } from '@react-pdf/renderer'
import type { PanoramaEje } from '@/lib/sesiones/helpers'
import {
  s, C, fmtFecha,
  PageChrome, TitleBlock, SH, SubHead, MetaRow, EstadoChip, Vacio,
  type ActaBranding,
} from './actaPdfBase'

/**
 * Acta del GABINETE REGIONAL v2 (spec v2 · "pauta como columna vertebral").
 * Se ARMA SOLA desde la pauta: la sección central "Desarrollo de la sesión"
 * recorre los puntos EN EL ORDEN de la pauta y, bajo cada uno, anida su relato,
 * las intervenciones por cartera, las iniciativas del PREGO y los compromisos
 * que nacieron de ese punto. Reemplaza el formato v1 (secciones sueltas: temas,
 * apuntes por cartera, compromisos por separado) para las sesiones formato_acta=2.
 *
 * Secciones: I Antecedentes · II Asistencia · III Desarrollo de la sesión (por
 * punto) · IV Vocerías de la semana · V Panorama por eje · VI Verificación de
 * compromisos anteriores. Estilo sobrio de actaPdfBase. No fetchea.
 */

export type ActaGabineteV2Data = ActaBranding & {
  borrador?: boolean
  nombreInstancia: string
  regionNombre: string
  sesionNumero: number
  fecha: string
  lugar: string | null
  preside: string | null
  asistencia: {
    nombre: string; cargo: string | null; institucion: string
    calidad: 'titular' | 'suplente' | 'invitado'; presente: boolean
  }[]
  puntos: {
    orden: number
    titulo: string
    carteras: string[]
    proposito: string | null
    relato: string | null
    intervenciones: { institucion: string; texto: string }[]
    iniciativas: { nombre: string; semaforo: string | null; pctAvance: number | null }[]
    compromisos: {
      descripcion: string; institucion: string; nombre: string | null
      plazo: string | null; mandatoComite: string | null
    }[]
    enSala: boolean
    estadoCierre: 'tratado' | 'sin_novedades' | 'pospuesto' | 'retirado' | null
  }[]
  vocerias: { dia: string; vocero: string; tema: string }[]
  panoramaEjes: PanoramaEje[]
  compVerificados: {
    descripcion: string; institucion: string; nombre: string | null
    plazo: string | null; estado: 'pendiente' | 'en_curso' | 'cumplido'
    origen: 'gabinete' | 'escalado' | 'mandato'; comiteNombre: string | null
  }[]
  generadoPor: string | null
  generadoEn: string
}

const ESTADO_LABEL = { pendiente: 'Pendiente', en_curso: 'En curso', cumplido: 'Cumplido' } as const
const ESTADO_COLOR = { pendiente: C.gris, en_curso: C.azul, cumplido: C.verde } as const
const SEM_COLOR: Record<string, string> = { rojo: C.rojo, ambar: C.ambar, verde: C.verde }
const CIERRE_LABEL = { tratado: 'Tratado', sin_novedades: 'Sin novedades', pospuesto: 'Pospuesto', retirado: 'Retirado' } as const
const CIERRE_COLOR = { tratado: C.verde, sin_novedades: C.gris, pospuesto: C.ambar, retirado: C.faint } as const

const pd = {
  punto:      { marginBottom: 12 },
  head:       { flexDirection: 'row' as const, alignItems: 'baseline' as const, marginBottom: 2 },
  num:        { fontSize: 11, fontFamily: 'Carlito', fontWeight: 'bold' as const, color: C.ink, marginRight: 5 },
  titulo:     { flex: 1, fontSize: 11, fontFamily: 'Carlito', fontWeight: 'bold' as const, color: C.ink },
  carteras:   { fontSize: 8, fontFamily: 'Carlito', fontWeight: 'bold' as const, color: C.muted, textTransform: 'uppercase' as const, marginBottom: 3 },
  preg:       { fontSize: 9.5, fontStyle: 'italic' as const, color: C.inkSoft, lineHeight: 1.4, marginBottom: 4 },
  relato:     { fontSize: 9.5, color: C.ink, lineHeight: 1.5, marginBottom: 4 },
  interv:     { flexDirection: 'row' as const, marginBottom: 2 },
  intInst:    { width: 110, fontSize: 9, fontFamily: 'Carlito', fontWeight: 'bold' as const, color: C.inkSoft },
  intTx:      { flex: 1, fontSize: 9.5, color: C.inkSoft, lineHeight: 1.45 },
  iniRow:     { flexDirection: 'row' as const, alignItems: 'center' as const, marginTop: 1 },
  compLabel:  { fontSize: 8.5, fontFamily: 'Carlito', fontWeight: 'bold' as const, color: C.muted, textTransform: 'uppercase' as const, marginTop: 4, marginBottom: 2 },
  compRow:    { flexDirection: 'row' as const, borderBottomWidth: 0.5, borderBottomColor: C.hairline, paddingVertical: 3 },
  enSalaTag:  { fontSize: 7.5, fontFamily: 'Carlito', fontWeight: 'bold' as const, color: C.azul, marginLeft: 6 },
}

export default function ActaGabineteV2Pdf({ data }: { data: ActaGabineteV2Data }) {
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
          borrador={data.borrador}
        />

        <TitleBlock
          title={`Acta — ${data.nombreInstancia}`}
          region={data.regionNombre}
          meta={`Sesión N° ${data.sesionNumero} · ${fmtFecha(data.fecha)}`}
        />

        {/* I. Antecedentes */}
        <SH>I. Antecedentes</SH>
        <MetaRow k="Fecha de la sesión" v={fmtFecha(data.fecha)} />
        <MetaRow k="Lugar" v={data.lugar ?? '—'} />
        <MetaRow k="Preside" v={data.preside ?? '—'} />
        <MetaRow k="Asistencia" v={`${presentes.length} de ${data.asistencia.length} convocados`} />

        {/* II. Asistencia */}
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
            <Text style={[s.td, { flex: 1 }]}>{a.calidad === 'invitado' ? 'Invitado/a' : a.calidad === 'titular' ? 'Titular' : 'Suplente'}</Text>
            <Text style={[s.td, { flex: 1, color: a.presente ? C.verde : C.faint }]}>{a.presente ? 'Sí' : 'No'}</Text>
          </View>
        ))}
        {data.asistencia.length === 0 && <Vacio>Sin registro de asistencia.</Vacio>}

        {/* III. Desarrollo de la sesión — POR PUNTO DE PAUTA (la columna vertebral) */}
        <SH>III. Desarrollo de la sesión</SH>
        {data.puntos.length === 0 ? (
          <Vacio>La sesión no tuvo puntos de pauta registrados.</Vacio>
        ) : data.puntos.map((p, i) => (
          <View key={i} style={pd.punto} wrap={false}>
            <View style={pd.head}>
              <Text style={pd.num}>{p.orden}.</Text>
              <Text style={pd.titulo}>{p.titulo}</Text>
              {p.enSala && <Text style={pd.enSalaTag}>SURGIDO EN SALA</Text>}
              {p.estadoCierre && (
                <View style={{ marginLeft: 6 }}>
                  <EstadoChip label={CIERRE_LABEL[p.estadoCierre]} color={CIERRE_COLOR[p.estadoCierre]} />
                </View>
              )}
            </View>
            {p.carteras.length > 0 && <Text style={pd.carteras}>{p.carteras.join(' · ')}</Text>}
            {p.proposito && <Text style={pd.preg}>Contexto: {p.proposito}</Text>}

            {p.relato && <Text style={pd.relato}>{p.relato}</Text>}

            {p.intervenciones.map((iv, j) => (
              <View key={j} style={pd.interv}>
                <Text style={pd.intInst}>{iv.institucion}</Text>
                <Text style={pd.intTx}>{iv.texto}</Text>
              </View>
            ))}

            {p.iniciativas.length > 0 && p.iniciativas.map((ini, j) => (
              <View key={j} style={pd.iniRow}>
                <Text style={[s.td, { flex: 1 }]}>· {ini.nombre}</Text>
                <Text style={[s.td, { width: 64, textAlign: 'right', color: ini.semaforo ? (SEM_COLOR[ini.semaforo] ?? C.gris) : C.gris, fontFamily: 'Carlito', fontWeight: 'bold' }]}>
                  {ini.semaforo ? ini.semaforo.toUpperCase() : '—'}
                </Text>
                <Text style={[s.td, { width: 40, textAlign: 'right', color: C.muted }]}>
                  {ini.pctAvance != null ? `${Math.round(ini.pctAvance)}%` : '—'}
                </Text>
              </View>
            ))}

            {p.compromisos.length > 0 && (
              <>
                <Text style={pd.compLabel}>Compromisos del punto</Text>
                {p.compromisos.map((c, j) => (
                  <View key={j} style={pd.compRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.td}>
                        {c.mandatoComite && <Text style={s.originTag}>[MANDATO → {c.mandatoComite}] </Text>}
                        {c.descripcion}
                      </Text>
                      <Text style={[s.td, { color: C.muted, fontSize: 8, marginTop: 1 }]}>
                        Responsable: {c.institucion}{c.nombre ? ` · ${c.nombre}` : ''}{c.plazo ? ` · plazo ${fmtFecha(c.plazo)}` : ''}
                      </Text>
                    </View>
                  </View>
                ))}
              </>
            )}
          </View>
        ))}

        {/* IV. Vocerías de la semana */}
        <SH>IV. Vocerías de la semana</SH>
        {data.vocerias.length === 0 ? (
          <Vacio>Sin vocerías registradas.</Vacio>
        ) : (
          <>
            <View style={s.th}>
              <Text style={[s.thT, { flex: 1 }]}>Día</Text>
              <Text style={[s.thT, { flex: 1.5 }]}>Vocero</Text>
              <Text style={[s.thT, { flex: 3 }]}>Tema</Text>
            </View>
            {data.vocerias.map((v, i) => (
              <View key={i} style={s.tr} wrap={false}>
                <Text style={[s.td, { flex: 1 }]}>{v.dia}</Text>
                <Text style={[s.td, { flex: 1.5, fontFamily: 'Carlito', fontWeight: 'bold' }]}>{v.vocero}</Text>
                <Text style={[s.td, { flex: 3, color: C.inkSoft }]}>{v.tema}</Text>
              </View>
            ))}
          </>
        )}

        {/* V. Panorama por eje */}
        <SH>V. Panorama del plan regional por eje</SH>
        <View style={s.th}>
          <Text style={[s.thT, { flex: 4 }]}>Eje</Text>
          <Text style={[s.thT, { flex: 1, textAlign: 'right' }]}>Rojo</Text>
          <Text style={[s.thT, { flex: 1, textAlign: 'right' }]}>Naranjo</Text>
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

        {/* VI. Verificación de compromisos anteriores */}
        <SH>VI. Verificación de compromisos anteriores</SH>
        <SubHead>Incluye escalados desde comités y mandatos</SubHead>
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
      </Page>
    </Document>
  )
}
