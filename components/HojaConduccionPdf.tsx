import { Document, Page, Text, View } from '@react-pdf/renderer'
import {
  s, C, fmtFecha,
  PageChrome, TitleBlock, SH, SubHead, MetaRow, Vacio,
  type ActaBranding,
} from './actaPdfBase'
import { sumaHora } from '@/lib/sesiones/helpers'

/**
 * HOJA DE CONDUCCIÓN del Gabinete Regional v2 — el papel de 2 caras que la
 * Delegación tiene delante en la mesa para CONDUCIR la reunión (spec v2, PR-2).
 * Se genera al "Enviar pauta" y se despacha a los seremis con la citación:
 *   Cara 1 — la PAUTA con sus preguntas ("Lo solicitado a la cartera"). El
 *            cronograma muestra SOLO el tiempo total estimado del gabinete, no
 *            el reparto por punto (decisión ronda 5: no exponer minutos por tema
 *            en el papel que ven las carteras). Es el guion: cada punto llega
 *            con su pregunta.
 *   Cara 2 — los COMPROMISOS a cobrar, agrupados por cartera.
 *
 * Sin dispositivos: papel + el panel. Estilo sobrio de las actas
 * (components/actaPdfBase.tsx). No fetchea: recibe HojaConduccionData pre-armado.
 */

export type HojaConduccionData = ActaBranding & {
  nombreInstancia: string
  regionNombre: string
  fecha: string                 // fecha de la sesión (display)
  horaInicio: string            // "HH:MM" — base para las horas objetivo
  generadoEn: string            // display, ya formateado
  numeroLabel: string           // "Sesión N° 14" (o "… (próxima)")
  puntos: {
    orden: number
    titulo: string
    detalle: string | null
    carteras: string[]          // la principal primero; [] = Transversal
    proposito: string | null    // la pregunta; null en puntos creados en sala
    minutos: number
    iniciativas: { nombre: string; pctAvance: number | null }[]
  }[]
  // Cara 2 — compromisos a cobrar, agrupados por cartera responsable.
  pendientesPorCartera: {
    cartera: string
    compromisos: { descripcion: string; plazo: string | null; edad: string | null }[]
  }[]
}

// `sumaHora` (término estimado = inicio + minutos totales) vive en
// lib/sesiones/helpers.ts (puro, testeado) — importado arriba.

// Estilos locales de la hoja (pregunta ancla + tags).
const h = {
  puntoRow:    { marginBottom: 9 },
  titleLine:   { flexDirection: 'row' as const, alignItems: 'baseline' as const },
  num:         { fontSize: 10.5, fontFamily: 'Carlito', fontWeight: 'bold' as const, color: C.ink, marginRight: 4 },
  titulo:      { flex: 1, fontSize: 10.5, fontFamily: 'Carlito', fontWeight: 'bold' as const, color: C.ink },
  carteras:    { fontSize: 8, fontFamily: 'Carlito', fontWeight: 'bold' as const, color: C.muted, textTransform: 'uppercase' as const, marginTop: 2 },
  detalle:     { fontSize: 8.5, color: C.muted, marginTop: 2, lineHeight: 1.4 },
  pregLabel:   { fontSize: 7.5, fontFamily: 'Carlito', fontWeight: 'bold' as const, color: C.faint, textTransform: 'uppercase' as const, marginTop: 4 },
  pregTx:      { fontSize: 9.5, color: C.ink, fontStyle: 'italic' as const, lineHeight: 1.4, marginTop: 1 },
  prego:       { fontSize: 8, color: C.azul, marginTop: 3 },
  compRow:     { flexDirection: 'row' as const, borderBottomWidth: 0.5, borderBottomColor: C.hairline, paddingVertical: 3 },
  compTx:      { flex: 1, fontSize: 9.5, color: C.ink },
  compMeta:    { fontSize: 8, color: C.muted, marginLeft: 6 },
}

export default function HojaConduccionPdf({ data }: { data: HojaConduccionData }) {
  const footerLeft = `Hoja de conducción · ${data.nombreInstancia} · ${data.regionNombre}`

  // Solo el total: suma de minutos de todos los puntos + término estimado.
  const totalMin = data.puntos.reduce((acc, p) => acc + p.minutos, 0)
  const termino = sumaHora(data.horaInicio, totalMin)

  return (
    <Document title={`Hoja de conducción ${data.nombreInstancia} — ${data.regionNombre}`}>
      {/* ── Cara 1 — Pauta con preguntas + hora objetivo ── */}
      <Page size="A4" style={s.page} wrap>
        <PageChrome branding={data} fecha={data.fecha} sesionLabel={data.numeroLabel} footerLeft={footerLeft} />
        <TitleBlock
          title={`Hoja de conducción — ${data.nombreInstancia}`}
          region={data.regionNombre}
          meta={`Pauta de la sesión · ${data.fecha}`}
        />
        <MetaRow k="Hora de inicio" v={data.horaInicio} />
        <MetaRow k="Puntos de la pauta" v={String(data.puntos.length)} />
        <MetaRow k="Tiempo total estimado" v={`${totalMin} min (término aprox. ${termino})`} />

        <SH>Cara 1 · Pauta y preguntas</SH>
        {data.puntos.length === 0 ? (
          <Vacio>La pauta no tiene puntos.</Vacio>
        ) : data.puntos.map((p, i) => (
          <View key={i} style={h.puntoRow} wrap={false}>
            <View style={h.titleLine}>
              <Text style={h.num}>{p.orden}.</Text>
              <Text style={h.titulo}>{p.titulo}</Text>
            </View>
            <Text style={h.carteras}>{p.carteras.length ? p.carteras.join(' · ') : 'Transversal'}</Text>
            {p.detalle ? <Text style={h.detalle}>{p.detalle}</Text> : null}
            {p.proposito ? (
              <>
                <Text style={h.pregLabel}>Lo solicitado a la cartera</Text>
                <Text style={h.pregTx}>{p.proposito}</Text>
              </>
            ) : null}
            {p.iniciativas.map((ini, ii) => (
              <Text key={ii} style={h.prego}>
                PREGO · {ini.nombre}{ini.pctAvance != null ? ` · ${Math.round(ini.pctAvance)}%` : ''}
              </Text>
            ))}
          </View>
        ))}
      </Page>

      {/* ── Cara 2 — Compromisos a cobrar, por cartera ── */}
      <Page size="A4" style={s.page} wrap break>
        <PageChrome branding={data} fecha={data.fecha} sesionLabel={data.numeroLabel} footerLeft={footerLeft} />
        <SH>Cara 2 · Compromisos a cobrar, por cartera</SH>
        {data.pendientesPorCartera.length === 0 ? (
          <Vacio>No hay compromisos pendientes seleccionados para cobrar.</Vacio>
        ) : data.pendientesPorCartera.map((grupo, gi) => (
          <View key={gi} wrap={false}>
            <SubHead>{grupo.cartera}</SubHead>
            {grupo.compromisos.map((c, ci) => (
              <View key={ci} style={h.compRow}>
                <Text style={h.compTx}>{c.descripcion}</Text>
                {c.plazo ? <Text style={h.compMeta}>plazo {fmtFecha(c.plazo)}</Text> : null}
                {c.edad ? <Text style={h.compMeta}>{c.edad}</Text> : null}
              </View>
            ))}
          </View>
        ))}
      </Page>
    </Document>
  )
}
