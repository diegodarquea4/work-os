'use client'

import { diasHasta, estaAtrasado } from '@/lib/oficiosSeia'
import { EmptyState } from '@/components/ui'

/**
 * Los oficios del SEIA que este proyecto tiene sin responder.
 *
 * ── Qué muestra y qué no ───────────────────────────────────────────────────
 *
 * Solo lo PENDIENTE, partido en vencidos y por vencer. Los resueltos se
 * cuentan en una línea pero no se listan: la pestaña es para saber qué hay que
 * perseguir hoy, y una lista que crece para siempre con lo ya respondido
 * entierra justamente eso. El histórico completo, cuando haga falta, es otra
 * vista.
 *
 * ── De dónde salen ─────────────────────────────────────────────────────────
 *
 * De `sesion_oficios_tratados` con `automatico = true`: los que entraron por la
 * importación del SEIA, no los que el comité levantó a mano en una sesión. Se
 * pegan a este proyecto por el expediente (`origen_id` del catálogo o
 * `seia_expediente_id` cargado en la ficha), y si el proyecto no tiene ninguno
 * de los dos la lista sale vacía aunque el SEIA liste oficios: por eso el
 * vacío lo dice en vez de mostrar un cero mudo.
 *
 * Es SOLO LECTURA a propósito. El estado de un oficio lo manda el SEIA: un
 * oficio deja de estar pendiente cuando el organismo responde, no cuando
 * alguien lo marca acá. Lo que sí es del comité —quién persigue a quién— es un
 * compromiso, y se toma en la sesión.
 */

export type OficioProyecto = {
  id: number
  oaeca_nombre: string | null
  oaeca_sea: string | null
  ministerio: string | null
  tipo_oficio: string | null
  fecha_limite: string | null
  url_oficio: string | null
  estado: 'pendiente' | 'resuelto'
}

type Props = {
  oficios: OficioProyecto[]
  /** `true` si el proyecto no tiene expediente: sin él no hay por dónde unirlos. */
  sinExpediente: boolean
  hoy: string
}

export default function ProyectoOficiosTab({ oficios, sinExpediente, hoy }: Props) {
  const pendientes = oficios.filter(o => o.estado === 'pendiente')
  const resueltos  = oficios.length - pendientes.length

  const vencidos  = pendientes.filter(o => estaAtrasado(o, hoy))
  const porVencer = pendientes.filter(o => !estaAtrasado(o, hoy))

  // Lo más urgente arriba dentro de cada grupo. Los sin plazo van al final:
  // no se puede decir nada de ellos y no deben desplazar a los que vencen.
  const porPlazo = (a: OficioProyecto, b: OficioProyecto) =>
    (a.fecha_limite ?? '9999').localeCompare(b.fecha_limite ?? '9999')

  if (pendientes.length === 0) {
    return (
      <div className="pt-1">
        {sinExpediente ? (
          <EmptyState
            title="Este proyecto no tiene expediente del SEIA"
            description="Cargá el expediente en el detalle («Expediente SEIA») y sus oficios pendientes aparecen acá solos."
          />
        ) : (
          <EmptyState
            title="Sin oficios pendientes"
            description={resueltos > 0
              ? `Los ${resueltos} oficios de este proyecto están respondidos.`
              : 'El SEIA no lista oficios sin responder para este proyecto.'}
          />
        )}
      </div>
    )
  }

  return (
    <div className="pt-1 space-y-4">
      {vencidos.length > 0 && (
        <Grupo
          titulo="Vencidos"
          n={vencidos.length}
          color="text-red-700"
          oficios={[...vencidos].sort(porPlazo)}
          hoy={hoy}
        />
      )}
      {porVencer.length > 0 && (
        <Grupo
          titulo="Por vencer"
          n={porVencer.length}
          color="text-amber-700"
          oficios={[...porVencer].sort(porPlazo)}
          hoy={hoy}
        />
      )}
      {resueltos > 0 && (
        <p className="text-xs text-gray-400 pt-1">
          {resueltos} oficio{resueltos === 1 ? '' : 's'} ya respondido{resueltos === 1 ? '' : 's'}, no se listan acá.
        </p>
      )}
    </div>
  )
}

function Grupo({ titulo, n, color, oficios, hoy }: {
  titulo: string
  n: number
  color: string
  oficios: OficioProyecto[]
  hoy: string
}) {
  return (
    <div>
      <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${color}`}>
        {titulo} <span className="text-gray-400 font-semibold">({n})</span>
      </p>
      <div className="space-y-1.5">
        {oficios.map(o => <Fila key={o.id} o={o} hoy={hoy} />)}
      </div>
    </div>
  )
}

function Fila({ o, hoy }: { o: OficioProyecto; hoy: string }) {
  const dias = o.fecha_limite ? diasHasta(o.fecha_limite, hoy) : null
  const vencido = dias != null && dias < 0
  const plazo = dias == null ? 'sin plazo'
    : vencido ? `${Math.abs(dias)} día${Math.abs(dias) === 1 ? '' : 's'} de atraso`
    : dias === 0 ? 'vence hoy'
    : `vence en ${dias} día${dias === 1 ? '' : 's'}`

  return (
    <div className={`px-3 py-2 rounded-lg border ${vencido ? 'border-red-200 bg-red-50/50' : 'border-amber-200 bg-amber-50/40'}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* El organismo es el sujeto de la fila: dentro de una ficha el
              proyecto ya se sabe, lo que falta es QUIÉN no respondió. Con su
              jurisdicción cuando la hay — «CONAF» sirve de poco si no se sabe
              cuál de las quince. */}
          <p className="text-sm text-slate-800 leading-snug">
            {o.oaeca_sea ?? o.oaeca_nombre ?? 'Organismo sin identificar'}
          </p>
          {o.ministerio && <p className="text-xs text-gray-500 mt-0.5 truncate">{o.ministerio}</p>}
          {o.tipo_oficio && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{o.tipo_oficio}</p>}
        </div>
        <div className="flex-shrink-0 text-right">
          <p className={`text-[11px] font-bold ${vencido ? 'text-red-700' : 'text-amber-700'}`}>{plazo}</p>
          {o.fecha_limite && (
            <p className="text-[10px] text-gray-400 tabular-nums mt-0.5">{fmtFecha(o.fecha_limite)}</p>
          )}
          {o.url_oficio && (
            <a
              href={o.url_oficio}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-violet-700 hover:text-violet-900 hover:underline font-medium mt-1 inline-block"
            >
              Ver oficio →
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

function fmtFecha(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y}`
}
