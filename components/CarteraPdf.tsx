/**
 * CarteraPdf — PDF de carteras ministeriales para reuniones con SEREMI.
 *
 * Estructura:
 *   - Página 1: portada con título, región, fecha, índice de ministerios.
 *   - Por cada ministerio: página(s) propias (page break automático). Header
 *     fijo arriba con conteos y total invertido + fichas compactas. Cada ficha
 *     ocupa ≈1/3 de página A4 portrait (≈3 fichas por página).
 *
 * Cada ficha es self-contained: estado, hito próximo, responsable, inversión,
 * descripción truncada, últimos 3 seguimientos y un recuadro vacío para
 * acuerdos durante la reunión.
 */

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { Iniciativa } from '@/lib/projects'
import type { Region } from '@/lib/regions'
import type { Seguimiento } from '@/lib/types'
import { registerPdfFonts } from '@/lib/pdfFonts'

registerPdfFonts()

// ── Types ────────────────────────────────────────────────────────────────────

export type MinisterioGroup = {
  nombre: string
  iniciativas: Iniciativa[]
}

type Props = {
  region: Region
  fecha: string
  soloEnFoco: boolean
  groups: MinisterioGroup[]
  seguimientosByN: Record<number, Seguimiento[]>
}

// ── Palette ──────────────────────────────────────────────────────────────────

const C = {
  accent:    '#1e3a8a',  // navy
  textDark:  '#111827',
  textMid:   '#374151',
  textLight: '#6b7280',
  border:    '#e5e7eb',
  divider:   '#d1d5db',
  bgSoft:    '#f9fafb',
  bgRow:     '#f3f4f6',
  white:     '#ffffff',
  verde:     '#16a34a',
  amber:     '#d97706',
  rojo:      '#dc2626',
  gris:      '#9ca3af',
  focoBg:    '#fef3c7',
  focoText:  '#92400e',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function tr(s: string | null | undefined, max: number): string {
  if (!s) return '—'
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

function fmtFechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', {
      day: '2-digit', month: 'short', year: '2-digit',
    })
  } catch { return iso.slice(0, 10) }
}

function fmtFechaSeguimiento(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('es-CL', {
      day: '2-digit', month: 'short',
    })
  } catch { return iso.slice(0, 10) }
}

function fmtInversion(mm: number | null | undefined): string {
  if (mm == null) return '—'
  return `US$ ${mm.toLocaleString('es-CL', { maximumFractionDigits: 1 })} MM`
}

function semColor(sem: string | null | undefined): string {
  if (sem === 'verde') return C.verde
  if (sem === 'ambar') return C.amber
  if (sem === 'rojo')  return C.rojo
  return C.gris
}

function semLabel(sem: string | null | undefined): string {
  if (sem === 'verde') return 'Verde'
  if (sem === 'ambar') return 'Ámbar'
  if (sem === 'rojo')  return 'Rojo'
  return 'Sin evaluar'
}

function prioColor(p: string): string {
  if (p === 'Alta') return C.rojo
  if (p === 'Media') return C.amber
  return C.textMid
}

function emailToName(email: string | null | undefined): string {
  if (!email) return '—'
  const at = email.indexOf('@')
  return at > 0 ? email.slice(0, at) : email
}

function ragCounts(items: Iniciativa[]): { rojo: number; amber: number; verde: number; gris: number } {
  const out = { rojo: 0, amber: 0, verde: 0, gris: 0 }
  for (const p of items) {
    if (p.estado_semaforo === 'rojo') out.rojo++
    else if (p.estado_semaforo === 'ambar') out.amber++
    else if (p.estado_semaforo === 'verde') out.verde++
    else out.gris++
  }
  return out
}

function totalInversion(items: Iniciativa[]): number {
  return items.reduce((acc, p) => acc + (p.inversion_mm ?? 0), 0)
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: 'Carlito',
    fontSize: 9,
    color: C.textDark,
    paddingTop: 32,
    paddingBottom: 40,
    paddingHorizontal: 32,
  },

  // ── Portada ──
  portadaTitulo: {
    fontSize: 18, fontFamily: 'Carlito', fontWeight: 'bold', color: C.accent,
    textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1,
    marginTop: 80, marginBottom: 6,
  },
  portadaSub: {
    fontSize: 12, fontFamily: 'Carlito', fontWeight: 'bold',
    color: C.textDark, textAlign: 'center', marginBottom: 24,
  },
  portadaMeta: {
    fontSize: 10, color: C.textLight, textAlign: 'center', marginBottom: 2,
  },
  portadaBadgeFoco: {
    alignSelf: 'center', backgroundColor: C.focoBg, paddingHorizontal: 12,
    paddingVertical: 4, borderRadius: 12, marginTop: 14, marginBottom: 28,
  },
  portadaBadgeFocoText: {
    fontSize: 9, color: C.focoText, fontFamily: 'Carlito', fontWeight: 'bold',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  indiceTitulo: {
    fontSize: 10, fontFamily: 'Carlito', fontWeight: 'bold', color: C.accent,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
    borderBottomWidth: 1, borderBottomColor: C.accent, paddingBottom: 3,
    marginTop: 12,
  },
  indiceRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: C.border,
  },
  indiceMin: { fontSize: 9.5, color: C.textDark },
  indiceCount: { fontSize: 9, color: C.textLight, fontFamily: 'Carlito', fontWeight: 'bold' },

  // ── Header de página ──
  pageHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    borderBottomWidth: 2, borderBottomColor: C.accent, paddingBottom: 4, marginBottom: 8,
  },
  pageHeaderLeft: { flexDirection: 'column' },
  pageHeaderMin: { fontSize: 12, fontFamily: 'Carlito', fontWeight: 'bold', color: C.accent },
  pageHeaderRegion: { fontSize: 8, color: C.textLight, marginTop: 1 },
  pageHeaderRight: { fontSize: 8, color: C.textLight },

  // ── Resumen del ministerio (debajo del header) ──
  resumenRow: {
    flexDirection: 'row', gap: 6, marginBottom: 10,
    paddingHorizontal: 0,
  },
  resumenBox: {
    flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 3,
    paddingVertical: 4, paddingHorizontal: 6, alignItems: 'center',
  },
  resumenVal: { fontSize: 11, fontFamily: 'Carlito', fontWeight: 'bold', color: C.textDark },
  resumenValSemV: { fontSize: 11, fontFamily: 'Carlito', fontWeight: 'bold', color: C.verde },
  resumenValSemA: { fontSize: 11, fontFamily: 'Carlito', fontWeight: 'bold', color: C.amber },
  resumenValSemR: { fontSize: 11, fontFamily: 'Carlito', fontWeight: 'bold', color: C.rojo },
  resumenLbl: { fontSize: 7, color: C.textLight, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 1 },

  // ── Ficha ──
  ficha: {
    borderWidth: 1, borderColor: C.border, borderRadius: 4,
    padding: 6, marginBottom: 6,
  },
  fichaHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    marginBottom: 3,
  },
  fichaCodigo: {
    fontSize: 7, color: C.textLight, fontFamily: 'Carlito', fontWeight: 'bold',
    backgroundColor: C.bgRow, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2,
    marginRight: 4,
  },
  fichaNombre: {
    fontSize: 10, fontFamily: 'Carlito', fontWeight: 'bold', color: C.textDark,
    flex: 1,
  },
  fichaChipsRow: {
    flexDirection: 'row', gap: 4, marginBottom: 3, flexWrap: 'wrap',
  },
  chipBase: {
    paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2,
    fontSize: 7, fontFamily: 'Carlito', fontWeight: 'bold',
  },
  chipSemDot: {
    width: 6, height: 6, borderRadius: 3, marginRight: 3, marginTop: 1.5,
  },
  chipSemRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2,
    backgroundColor: C.bgRow,
  },
  chipSemText: { fontSize: 7, color: C.textDark, fontFamily: 'Carlito', fontWeight: 'bold' },
  chipFoco: {
    backgroundColor: C.focoBg, color: C.focoText,
    paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2,
    fontSize: 7, fontFamily: 'Carlito', fontWeight: 'bold',
  },
  chipPrio: {
    paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2,
    fontSize: 7, fontFamily: 'Carlito', fontWeight: 'bold',
    backgroundColor: C.bgRow,
  },
  chipNeutro: {
    backgroundColor: C.bgRow, color: C.textMid,
    paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2,
    fontSize: 7,
  },

  // ── Líneas de info ──
  infoRow: {
    flexDirection: 'row', marginBottom: 1.5, fontSize: 8,
  },
  infoLabel: { color: C.textLight, marginRight: 3 },
  infoValue: { color: C.textDark, flex: 1 },

  desc: { fontSize: 8, color: C.textMid, fontStyle: 'italic', marginTop: 3, marginBottom: 3, lineHeight: 1.4 },

  // ── Seguimientos ──
  segHeader: {
    fontSize: 7, color: C.textLight, textTransform: 'uppercase', letterSpacing: 0.4,
    marginTop: 3, marginBottom: 2, fontFamily: 'Carlito', fontWeight: 'bold',
  },
  segRow: { fontSize: 7.5, color: C.textMid, marginBottom: 1 },
  segVacio: { fontSize: 7.5, color: C.textLight, fontStyle: 'italic' },

  // ── Recuadro acuerdos ──
  acuerdosBox: {
    marginTop: 4, borderWidth: 1, borderColor: C.divider, borderRadius: 2,
    paddingHorizontal: 5, paddingVertical: 4, minHeight: 62,
  },
  acuerdosLabel: {
    fontSize: 7, color: C.accent, fontFamily: 'Carlito', fontWeight: 'bold',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2,
  },

  // ── Footer ──
  footer: {
    position: 'absolute', bottom: 18, left: 32, right: 32,
    flexDirection: 'row', justifyContent: 'space-between',
    fontSize: 7, color: C.textLight,
    borderTopWidth: 0.5, borderTopColor: C.border, paddingTop: 4,
  },
})

// ── Componentes internos ─────────────────────────────────────────────────────

function MinisterioPageHeader({ ministerio, region, fecha }: { ministerio: string; region: Region; fecha: string }) {
  return (
    <View style={s.pageHeader} fixed>
      <View style={s.pageHeaderLeft}>
        <Text style={s.pageHeaderMin}>{ministerio}</Text>
        <Text style={s.pageHeaderRegion}>Región de {region.nombre}</Text>
      </View>
      <Text style={s.pageHeaderRight}>{fecha}</Text>
    </View>
  )
}

function MinisterioResumen({ iniciativas }: { iniciativas: Iniciativa[] }) {
  const rag = ragCounts(iniciativas)
  const inv = totalInversion(iniciativas)
  const foco = iniciativas.filter(p => p.en_foco === true).length
  return (
    <View style={s.resumenRow}>
      <View style={s.resumenBox}>
        <Text style={s.resumenVal}>{iniciativas.length}</Text>
        <Text style={s.resumenLbl}>Iniciativas</Text>
      </View>
      <View style={s.resumenBox}>
        <Text style={s.resumenValSemR}>{rag.rojo}</Text>
        <Text style={s.resumenLbl}>Rojas</Text>
      </View>
      <View style={s.resumenBox}>
        <Text style={s.resumenValSemA}>{rag.amber}</Text>
        <Text style={s.resumenLbl}>Ámbar</Text>
      </View>
      <View style={s.resumenBox}>
        <Text style={s.resumenValSemV}>{rag.verde}</Text>
        <Text style={s.resumenLbl}>Verdes</Text>
      </View>
      <View style={s.resumenBox}>
        <Text style={s.resumenVal}>{foco}</Text>
        <Text style={s.resumenLbl}>En foco</Text>
      </View>
      <View style={s.resumenBox}>
        <Text style={s.resumenVal}>{fmtInversion(inv)}</Text>
        <Text style={s.resumenLbl}>Inversión</Text>
      </View>
    </View>
  )
}

function FichaCompacta({ p, seguimientos }: { p: Iniciativa; seguimientos: Seguimiento[] }) {
  const sem = semColor(p.estado_semaforo)
  return (
    <View style={s.ficha} wrap={false}>
      {/* Header */}
      <View style={s.fichaHeader}>
        {p.codigo_iniciativa && <Text style={s.fichaCodigo}>{p.codigo_iniciativa}</Text>}
        <Text style={s.fichaNombre}>{tr(p.nombre, 110)}</Text>
      </View>

      {/* Chips */}
      <View style={s.fichaChipsRow}>
        <View style={s.chipSemRow}>
          <View style={[s.chipSemDot, { backgroundColor: sem }]} />
          <Text style={s.chipSemText}>{semLabel(p.estado_semaforo)}</Text>
        </View>
        <Text style={[s.chipPrio, { color: prioColor(p.prioridad) }]}>{p.prioridad}</Text>
        <Text style={s.chipNeutro}>Avance: {p.pct_avance ?? 0}%</Text>
        <Text style={s.chipNeutro}>{tr(p.eje, 32)}</Text>
        {p.en_foco === true && <Text style={s.chipFoco}>⚑ EN FOCO</Text>}
      </View>

      {/* Hito + etapa */}
      <View style={s.infoRow}>
        <Text style={s.infoLabel}>Próximo hito:</Text>
        <Text style={s.infoValue}>
          {tr(p.proximo_hito, 70)} · {fmtFechaCorta(p.fecha_proximo_hito)}
          {p.etapa_actual && ` · Etapa: ${p.etapa_actual}`}
        </Text>
      </View>

      {/* Gestión */}
      <View style={s.infoRow}>
        <Text style={s.infoLabel}>Responsable:</Text>
        <Text style={s.infoValue}>
          {emailToName(p.responsable)}
          {p.comuna && ` · Comuna: ${p.comuna}`}
        </Text>
      </View>

      {/* Financiero */}
      <View style={s.infoRow}>
        <Text style={s.infoLabel}>Inversión:</Text>
        <Text style={s.infoValue}>
          {fmtInversion(p.inversion_mm)}
          {p.codigo_bip && ` · BIP: ${p.codigo_bip}`}
          {p.fuente_financiamiento && ` · ${p.fuente_financiamiento}`}
        </Text>
      </View>

      {/* Descripción */}
      {p.descripcion && (
        <Text style={s.desc}>{tr(p.descripcion, 240)}</Text>
      )}

      {/* Seguimientos */}
      <Text style={s.segHeader}>Últimos seguimientos</Text>
      {seguimientos.length === 0 ? (
        <Text style={s.segVacio}>Sin seguimientos registrados</Text>
      ) : (
        seguimientos.map(seg => (
          <Text key={seg.id} style={s.segRow}>
            {fmtFechaSeguimiento(seg.created_at)} · {seg.tipo}: {tr(seg.descripcion, 90)}
            {seg.autor && ` — ${emailToName(seg.autor)}`}
          </Text>
        ))
      )}

      {/* Acuerdos */}
      <View style={s.acuerdosBox}>
        <Text style={s.acuerdosLabel}>Acuerdos / Actualizaciones de la reunión</Text>
      </View>
    </View>
  )
}

// ── Document ─────────────────────────────────────────────────────────────────

export default function CarteraPdf({ region, fecha, soloEnFoco, groups, seguimientosByN }: Props) {
  const totalIniciativas = groups.reduce((acc, g) => acc + g.iniciativas.length, 0)

  return (
    <Document title={`Cartera ${region.nombre}${soloEnFoco ? ' — en foco' : ''}`}>
      {/* ── Portada ── */}
      <Page size="A4" orientation="portrait" style={s.page}>
        <Text style={s.portadaTitulo}>Carteras Ministeriales</Text>
        <Text style={s.portadaSub}>Región de {region.nombre}</Text>
        <Text style={s.portadaMeta}>Generado: {fecha}</Text>
        <Text style={s.portadaMeta}>
          {groups.length} ministerios · {totalIniciativas} {soloEnFoco ? 'iniciativas en foco' : 'iniciativas'}
        </Text>

        {soloEnFoco && (
          <View style={s.portadaBadgeFoco}>
            <Text style={s.portadaBadgeFocoText}>⚑ Solo iniciativas en foco</Text>
          </View>
        )}

        <Text style={s.indiceTitulo}>Índice de ministerios</Text>
        {groups.map(g => (
          <View key={g.nombre} style={s.indiceRow}>
            <Text style={s.indiceMin}>{g.nombre}</Text>
            <Text style={s.indiceCount}>{g.iniciativas.length}</Text>
          </View>
        ))}

        <View style={s.footer} fixed render={({ pageNumber }) => (
          <>
            <Text>{region.nombre} · {fecha}</Text>
            <Text>Página {pageNumber}</Text>
          </>
        )} />
      </Page>

      {/* ── Una página (con wrap) por ministerio ── */}
      {groups.map(group => (
        <Page key={group.nombre} size="A4" orientation="portrait" style={s.page} wrap>
          <MinisterioPageHeader ministerio={group.nombre} region={region} fecha={fecha} />
          <MinisterioResumen iniciativas={group.iniciativas} />
          {group.iniciativas.map(p => (
            <FichaCompacta
              key={`${group.nombre}-${p.n}`}
              p={p}
              seguimientos={seguimientosByN[p.n] ?? []}
            />
          ))}

          <View style={s.footer} fixed render={({ pageNumber }) => (
            <>
              <Text>{group.nombre} · Región de {region.nombre}</Text>
              <Text>Página {pageNumber}</Text>
            </>
          )} />
        </Page>
      ))}
    </Document>
  )
}
