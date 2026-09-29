'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { diasHasta } from '@/lib/oficiosSeia'
import { Modal } from '@/components/ui'
import ProyectoEconomicoFichaModal from './ProyectoEconomicoFichaModal'
import BotonActualizarOficios from './BotonActualizarOficios'

/**
 * Todos los oficios del SEIA de la región, agrupados por proyecto.
 *
 * ── Por qué agrupados por proyecto y no una lista plana ────────────────────
 *
 * Un mismo oficio del SEA se dirige hasta a 22 organismos, así que una lista
 * plana de la región son cientos de filas donde el mismo proyecto aparece
 * siete u ocho veces seguidas. Lo que el comité tiene que decidir es a QUÉ
 * PROYECTO reclamarle, y recién después a quién: el proyecto es la unidad.
 *
 * ── La bandeja de los que no están en la cartera ───────────────────────────
 *
 * El archivo del SEIA es nacional: trae los oficios de todos los proyectos en
 * calificación de la región, estén o no en la cartera del comité. Los que no
 * están son justamente los candidatos a sumar —si un proyecto acumula veinte
 * oficios atrasados, alguien debería estar mirándolo—, así que no se esconden:
 * se separan y se cuentan.
 *
 * ── Qué NO hace ────────────────────────────────────────────────────────────
 *
 * No cambia estados. El estado de un oficio lo manda el SEIA —deja de estar
 * pendiente cuando el organismo responde— y la importación siguiente lo trae.
 * Marcarlo acá solo crearía una versión del mundo que el próximo archivo
 * contradice.
 */

type Fila = {
  id: number
  id_expediente: number | null
  nombre_proyecto: string | null
  ministerio: string | null
  oaeca_nombre: string | null
  oaeca_sea: string | null
  tipo_oficio: string | null
  fecha_limite: string | null
  url_oficio: string | null
  url_proyecto: string | null
  proyecto_privado_id: number | null
  estado: 'pendiente' | 'resuelto'
}

type Grupo = {
  clave: string
  nombre: string
  proyectoId: number | null
  filas: Fila[]
  vencidos: number
  porVencer: number
  resueltos: number
  /** El plazo más urgente del grupo — con eso se ordena. */
  peorPlazo: number
}

type Props = {
  regionCod: string
  currentUserEmail: string
  onClose: () => void
}

type Vista = 'cartera' | 'fuera'

export default function OficiosRegionModal({ regionCod, currentUserEmail, onClose }: Props) {
  const [filas, setFilas]       = useState<Fila[]>([])
  const [cargando, setCargando] = useState(true)
  const [vista, setVista]       = useState<Vista>('cartera')
  const [verResueltos, setVerResueltos] = useState(false)
  const [q, setQ]               = useState('')
  const [fichaId, setFichaId]   = useState<number | null>(null)

  const hoy = useMemo(() => new Date().toISOString().slice(0, 10), [])

  // `cargando` arranca en true y no se vuelve a levantar acá: hacerlo sería un
  // setState síncrono dentro del efecto, y el modal se monta una vez por
  // apertura. El guard `vivo` cubre el desmontaje a mitad de consulta.
  const cargar = useCallback(async (vivo: () => boolean) => {
    const { data } = await getSupabase()
      .from('sesion_oficios_tratados')
      .select('id, id_expediente, nombre_proyecto, ministerio, oaeca_nombre, oaeca_sea, tipo_oficio, fecha_limite, url_oficio, url_proyecto, proyecto_privado_id, estado')
      .eq('automatico', true)
      .eq('region_cod', regionCod)
      .order('fecha_limite', { ascending: true, nullsFirst: false })
      .limit(5000)
    if (!vivo()) return
    setFilas((data ?? []) as Fila[])
    setCargando(false)
  }, [regionCod])

  useEffect(() => {
    let vivo = true
    // El setState está DESPUÉS del await, no en el cuerpo del efecto: la
    // regla no ve a través de la función async.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar(() => vivo)
    return () => { vivo = false }
  }, [cargar])

  const grupos = useMemo(() => {
    const texto = q.trim().toLocaleLowerCase('es')
    const porClave = new Map<string, Grupo>()

    for (const f of filas) {
      if (f.estado === 'resuelto' && !verResueltos) continue
      const enCartera = f.proyecto_privado_id != null
      if ((vista === 'cartera') !== enCartera) continue

      if (texto) {
        const heno = [f.nombre_proyecto, f.oaeca_sea, f.oaeca_nombre, f.ministerio]
          .filter(Boolean).join(' ').toLocaleLowerCase('es')
        if (!heno.includes(texto)) continue
      }

      // Se agrupa por expediente y no por nombre: dos proyectos distintos
      // pueden llamarse casi igual, y el mismo puede venir escrito de dos
      // formas entre importaciones.
      const clave = f.proyecto_privado_id != null
        ? `p${f.proyecto_privado_id}`
        : `e${f.id_expediente ?? f.nombre_proyecto ?? f.id}`

      let g = porClave.get(clave)
      if (!g) {
        g = {
          clave,
          nombre: f.nombre_proyecto ?? 'Proyecto sin nombre',
          proyectoId: f.proyecto_privado_id,
          filas: [],
          vencidos: 0, porVencer: 0, resueltos: 0,
          peorPlazo: Number.POSITIVE_INFINITY,
        }
        porClave.set(clave, g)
      }
      g.filas.push(f)
      if (f.estado === 'resuelto') {
        g.resueltos++
      } else {
        const d = f.fecha_limite ? diasHasta(f.fecha_limite, hoy) : null
        if (d != null && d < 0) g.vencidos++
        else g.porVencer++
        if (d != null && d < g.peorPlazo) g.peorPlazo = d
      }
    }

    // Lo más atrasado primero. Un grupo sin nada pendiente (solo resueltos)
    // no tiene plazo y cae al final, que es donde corresponde.
    return [...porClave.values()].sort((a, b) => a.peorPlazo - b.peorPlazo)
  }, [filas, vista, verResueltos, q, hoy])

  const totales = useMemo(() => {
    let enCartera = 0, fuera = 0, resueltos = 0
    for (const f of filas) {
      if (f.estado === 'resuelto') { resueltos++; continue }
      if (f.proyecto_privado_id != null) enCartera++
      else fuera++
    }
    return { enCartera, fuera, resueltos }
  }, [filas])

  return (
    <>
      <Modal open onClose={onClose} size="xl" title="Oficios del SEIA">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3 -mt-1">
            <p className="text-xs text-gray-500 flex-1">
              Lo que el SEIA lista para los proyectos de esta región, agrupado por proyecto.
              El estado lo manda el SEIA y no se edita acá.
            </p>
            {/* Acá y no afuera: se renueva mirando la lista, no antes de abrirla. */}
            <BotonActualizarOficios
              regionCod={regionCod}
              onActualizado={() => { void cargar(() => true) }}
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <Chip
              on={vista === 'cartera'}
              onClick={() => setVista('cartera')}
              label="En la cartera"
              n={totales.enCartera}
            />
            {/* Los de afuera son los candidatos a sumar a la cartera: si un
                proyecto acumula oficios atrasados, alguien debería mirarlo. */}
            <Chip
              on={vista === 'fuera'}
              onClick={() => setVista('fuera')}
              label="Sin proyecto en la cartera"
              n={totales.fuera}
            />
            <span className="flex-1" />
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={verResueltos}
                onChange={e => setVerResueltos(e.target.checked)}
                className="accent-violet-700"
              />
              Ver resueltos ({totales.resueltos})
            </label>
          </div>

          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar por proyecto, organismo o ministerio…"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300"
          />

          {cargando ? (
            <p className="text-sm text-gray-400 py-8 text-center">Cargando…</p>
          ) : grupos.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">
              {filas.length === 0
                ? 'Todavía no se importó ningún oficio para esta región.'
                : 'Nada que mostrar con estos filtros.'}
            </p>
          ) : (
            <div className="space-y-2 max-h-[55vh] overflow-y-auto overscroll-contain pr-1">
              {grupos.map(g => (
                <GrupoProyecto
                  key={g.clave}
                  g={g}
                  hoy={hoy}
                  onAbrirFicha={() => { if (g.proyectoId != null) setFichaId(g.proyectoId) }}
                />
              ))}
            </div>
          )}
        </div>
      </Modal>

      {fichaId != null && (
        <ProyectoEconomicoFichaModal
          proyectoId={fichaId}
          puedeOperar={true}
          currentUserEmail={currentUserEmail}
          tabInicial="oficios"
          onClose={() => setFichaId(null)}
        />
      )}
    </>
  )
}

function Chip({ on, onClick, label, n }: { on: boolean; onClick: () => void; label: string; n: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${on ? 'bg-violet-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
    >
      {label} <span className={on ? 'text-violet-200' : 'text-gray-400'}>{n}</span>
    </button>
  )
}

function GrupoProyecto({ g, hoy, onAbrirFicha }: { g: Grupo; hoy: string; onAbrirFicha: () => void }) {
  const [abierto, setAbierto] = useState(false)

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-gray-50/70 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* Solo es link si el proyecto está en la cartera. Mandar al SEIA a
              los de afuera sería ofrecer una salida del panel justo donde lo
              que falta es cargarlo adentro. */}
          {g.proyectoId != null ? (
            <button
              type="button"
              onClick={onAbrirFicha}
              className="text-sm text-slate-800 font-medium text-left hover:underline hover:text-violet-800 leading-snug"
            >
              {g.nombre}
            </button>
          ) : (
            <p className="text-sm text-slate-800 font-medium leading-snug">{g.nombre}</p>
          )}
          <p className="text-[11px] text-gray-500 mt-0.5">
            {g.vencidos > 0 && (
              <span className="text-red-700 font-semibold">
                {g.vencidos} vencido{g.vencidos === 1 ? '' : 's'}
              </span>
            )}
            {g.vencidos > 0 && g.porVencer > 0 && <span className="text-gray-300"> · </span>}
            {g.porVencer > 0 && <span className="text-amber-700 font-semibold">{g.porVencer} por vencer</span>}
            {g.resueltos > 0 && (g.vencidos + g.porVencer) > 0 && <span className="text-gray-300"> · </span>}
            {g.resueltos > 0 && (
              <span className="text-gray-500">{g.resueltos} resuelto{g.resueltos === 1 ? '' : 's'}</span>
            )}
            {g.proyectoId == null && <span className="text-gray-400"> · no está en la cartera</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAbierto(v => !v)}
          className="flex-shrink-0 text-[11px] text-violet-700 hover:text-violet-900 font-medium"
        >
          {abierto ? 'Ocultar' : `Ver ${g.filas.length} oficio${g.filas.length === 1 ? '' : 's'}`}
        </button>
      </div>

      {abierto && (
        <div className="divide-y divide-gray-100">
          {g.filas.map(f => <FilaOficio key={f.id} f={f} hoy={hoy} />)}
        </div>
      )}
    </div>
  )
}

function FilaOficio({ f, hoy }: { f: Fila; hoy: string }) {
  const resuelto = f.estado === 'resuelto'
  const dias = f.fecha_limite ? diasHasta(f.fecha_limite, hoy) : null
  const vencido = !resuelto && dias != null && dias < 0
  const plazo = resuelto ? 'respondido'
    : dias == null ? 'sin plazo'
    : vencido ? `${Math.abs(dias)} día${Math.abs(dias) === 1 ? '' : 's'} de atraso`
    : dias === 0 ? 'vence hoy'
    : `vence en ${dias} día${dias === 1 ? '' : 's'}`

  return (
    <div className="px-3 py-2 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-700 leading-snug">{f.oaeca_sea ?? f.oaeca_nombre ?? '—'}</p>
        {f.tipo_oficio && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{f.tipo_oficio}</p>}
      </div>
      <div className="flex-shrink-0 text-right">
        <p className={`text-[11px] font-bold ${resuelto ? 'text-gray-400' : vencido ? 'text-red-700' : 'text-amber-700'}`}>
          {plazo}
        </p>
        {f.url_oficio && (
          <a
            href={f.url_oficio}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] text-violet-700 hover:text-violet-900 hover:underline font-medium mt-0.5 inline-block"
          >
            Ver oficio →
          </a>
        )}
      </div>
    </div>
  )
}
