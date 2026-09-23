'use client'

import { useMemo, useState } from 'react'
import ConsolaSesionShell from './sesiones/ConsolaSesionShell'
import FilterPopover, { type FilterOption } from './FilterPopover'
import ActiveFiltersBar, { setChip } from './ActiveFiltersBar'
import AgregarACarteraModal from './AgregarACarteraModal'
import FilaCarteraInfra from './FilaCarteraInfra'
import { EmptyState } from '@/components/ui'
import { moverEnCartera } from '@/lib/comiteInfraestructuraClient'
import {
  exportCarteraInfraXlsx,
  filtrarCartera,
  filtrosVacios,
  hayFiltros,
  megaproyectosDe,
  opcionesCartera,
  ordenarCartera,
  requierenAtencion,
  type FiltrosCartera,
  type OrdenCartera,
} from '@/lib/comiteInfraestructuraCartera'
import type { Region } from '@/lib/regions'
import type { Iniciativa } from '@/lib/projects'

/**
 * La cartera del Comité de Infraestructura a pantalla completa — hermana del
 * preview que vive en el tab, igual que en el Comité Económico (que también
 * tiene sus dos modos). Existe por la misma razón que allá: la cartera entera
 * no cabe dentro del panel sin tapar lo que ese panel es, la sesión.
 *
 * Qué se copió del Económico y qué no: el ESQUELETO (`ConsolaSesionShell`), el
 * chrome y la gramática —filtros arriba, chips de lo activo, Excel, alta— pero
 * NO sus filtros. Los del Económico (plazo, priorizado, riesgo, SEREMI líder,
 * permiso PAS) son columnas de su tabla propia; una iniciativa no las tiene y
 * portarlas dejaría media pantalla de controles que no filtran nada. Los de
 * acá salen de lo que una iniciativa sí tiene (ver comiteInfraestructuraCartera).
 *
 * A diferencia del preview, la lista va PLANA y ordenable: acá se viene a
 * buscar y exportar, no a recorrer la estructura curada. El megaproyecto de
 * cada iniciativa se muestra en su fila para no perder ese dato.
 */

type Props = {
  region: Region
  /** Cartera del comité: las iniciativas que ya tienen la etiqueta. */
  cartera: Iniciativa[]
  /** Región COMPLETA, para el buscador de "+ Sumar" (sin corte por capa). */
  iniciativasRegion: Iniciativa[]
  tag: string
  megaproyectosCurados: string[]
  onAbrirIniciativa: (p: Iniciativa) => void
  onUpdatePrioridad: (n: number, patch: Partial<Iniciativa>) => void
  onClose: () => void
}

export default function CarteraInfraestructuraPanel({
  region, cartera, iniciativasRegion, tag, megaproyectosCurados,
  onAbrirIniciativa, onUpdatePrioridad, onClose,
}: Props) {
  const [filtros, setFiltros]   = useState<FiltrosCartera>(filtrosVacios)
  const [orden, setOrden]       = useState<OrdenCartera>('semaforo')
  const [agregarOpen, setAgregarOpen] = useState(false)
  const [quitandoId, setQuitandoId]   = useState<number | null>(null)
  const [exportando, setExportando]   = useState(false)

  // Opciones sobre la cartera COMPLETA: no dependen de lo ya filtrado, si no
  // al elegir una las demás desaparecerían.
  const opciones = useMemo(
    () => opcionesCartera(cartera, megaproyectosCurados),
    [cartera, megaproyectosCurados],
  )

  const visibles = useMemo(() => {
    const filtrada = filtrarCartera(cartera, filtros, megaproyectosCurados)
    return ordenarCartera(filtrada, orden)
  }, [cartera, filtros, megaproyectosCurados, orden])

  const rojas = useMemo(() => requierenAtencion(visibles), [visibles])

  function set(campo: keyof FiltrosCartera, next: Set<string>) {
    setFiltros(prev => ({ ...prev, [campo]: next }))
  }
  function limpiar(campo: keyof FiltrosCartera) {
    set(campo, new Set())
  }

  const chips = [
    setChip('Megaproyecto', filtros.megaproyecto, () => limpiar('megaproyecto'),
      v => opciones.megaproyecto.find(o => o.value === v)?.label ?? v),
    setChip('Semáforo', filtros.semaforo, () => limpiar('semaforo'),
      v => opciones.semaforo.find(o => o.value === v)?.label ?? v),
    setChip('Ministerio', filtros.ministerio, () => limpiar('ministerio')),
    setChip('Comuna', filtros.comuna, () => limpiar('comuna'),
      v => opciones.comuna.find(o => o.value === v)?.label ?? v),
    setChip('Capa', filtros.capa, () => limpiar('capa'),
      v => opciones.capa.find(o => o.value === v)?.label ?? v),
    setChip('Etapa', filtros.etapa, () => limpiar('etapa'),
      v => opciones.etapa.find(o => o.value === v)?.label ?? v),
  ].filter(Boolean) as NonNullable<ReturnType<typeof setChip>>[]

  async function handleQuitar(p: Iniciativa) {
    const ok = window.confirm(
      `¿Sacar "${p.nombre}" de la cartera del comité?\n\n` +
      `Se le quita la etiqueta "${tag}". La iniciativa y su ficha no se tocan, y se puede volver a sumar cuando quieras.`,
    )
    if (!ok) return
    setQuitandoId(p.id)
    try {
      const tags = await moverEnCartera({ prioridadId: p.id, accion: 'quitar', tag })
      onUpdatePrioridad(p.n, { tags })
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    } finally {
      setQuitandoId(null)
    }
  }

  async function handleExportar() {
    setExportando(true)
    try {
      // Se exporta lo que se ve, ya filtrado y ordenado.
      await exportCarteraInfraXlsx(visibles, region.nombre, megaproyectosCurados)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    } finally {
      setExportando(false)
    }
  }

  const asOptions = (os: { value: string; label: string; count: number }[]): FilterOption[] =>
    os.map(o => ({ value: o.value, label: o.label, count: o.count }))

  return (
    <ConsolaSesionShell
      ariaLabel={`Cartera del Comité de Nudos Críticos — ${region.nombre}`}
      mainMaxWidth="max-w-6xl"
      onEscape={onClose}
      header={
        <>
          <span className="text-[14.5px] font-bold text-slate-900">
            Cartera del comité <span className="font-medium text-slate-400">· {region.nombre}</span>
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onClose}
              title="Volver"
              className="text-slate-400 hover:text-slate-700"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18"/>
              </svg>
            </button>
          </div>
        </>
      }
    >
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Acciones */}
        <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-baseline gap-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700">Iniciativas contempladas</p>
            <span className="text-[10px] text-gray-400">— etiqueta &quot;{tag}&quot;</span>
            <span className="text-[11px] text-gray-400 tabular-nums">
              {visibles.length === cartera.length
                ? `${cartera.length}`
                : `${visibles.length} de ${cartera.length}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <select
              id="cartera-infra-orden"
              value={orden}
              onChange={e => setOrden(e.target.value as OrdenCartera)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 font-medium bg-white hover:border-violet-200 focus:outline-none focus:ring-2 focus:ring-violet-400"
              title="Orden de la lista"
            >
              <option value="semaforo">Semáforo (rojo primero)</option>
              <option value="nombre">Nombre (A-Z)</option>
              <option value="avance_desc">Más avance primero</option>
              <option value="avance_asc">Menos avance primero</option>
            </select>
            <button
              onClick={handleExportar}
              disabled={exportando || visibles.length === 0}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 hover:text-violet-700 hover:border-violet-200 transition-colors disabled:opacity-50"
              title="Descarga la lista tal como se ve, con los filtros y el orden aplicados"
            >
              {exportando ? 'Generando…' : '↓ Descargar Excel'}
            </button>
            <button
              onClick={() => setAgregarOpen(true)}
              className="text-xs px-3 py-1.5 rounded-lg bg-violet-700 text-white font-semibold hover:bg-violet-800"
              title="Buscar una iniciativa de la región y sumarla a la cartera del comité"
            >
              + Sumar
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="px-4 pb-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <FilterPopover label="Megaproyecto" options={asOptions(opciones.megaproyecto)}
              selected={filtros.megaproyecto} onChange={n => set('megaproyecto', n)} />
            <FilterPopover label="Semáforo" options={asOptions(opciones.semaforo)}
              selected={filtros.semaforo} onChange={n => set('semaforo', n)} />
            <FilterPopover label="Ministerio" options={asOptions(opciones.ministerio)}
              selected={filtros.ministerio} onChange={n => set('ministerio', n)} />
            <FilterPopover label="Comuna" options={asOptions(opciones.comuna)}
              selected={filtros.comuna} onChange={n => set('comuna', n)} />
            <FilterPopover label="Capa" options={asOptions(opciones.capa)}
              selected={filtros.capa} onChange={n => set('capa', n)} />
            <FilterPopover label="Etapa" options={asOptions(opciones.etapa)}
              selected={filtros.etapa} onChange={n => set('etapa', n)} />
          </div>
          {chips.length > 0 && (
            <div className="mt-2">
              <ActiveFiltersBar chips={chips} clearFilters={() => setFiltros(filtrosVacios())} />
            </div>
          )}
        </div>

        {/* Requieren atención — lo que el comité mira primero */}
        {rojas.length > 0 && (
          <div className="px-4 pb-3">
            <div className="rounded-lg border border-red-100 bg-red-50/40 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-red-700">
                Requieren atención · {rojas.length}
              </p>
              <p className="text-[11px] text-red-600/80 mt-0.5">
                {rojas.length === 1 ? 'Una iniciativa está' : `${rojas.length} iniciativas están`} en semáforo rojo.
                {orden !== 'semaforo' && ' Ordená por semáforo para verlas arriba.'}
              </p>
            </div>
          </div>
        )}

        {/* Lista */}
        <div className="px-4 pb-4">
          {cartera.length === 0 ? (
            <EmptyState
              title="La cartera está vacía"
              description={`Ninguna iniciativa de ${region.nombre} tiene la etiqueta "${tag}" todavía. Usá «+ Sumar» para armarla.`}
            />
          ) : visibles.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-8 border border-dashed border-gray-200 rounded-lg">
              Ninguna iniciativa de la cartera calza con los filtros.
            </p>
          ) : (
            <div className="space-y-1 overflow-y-auto max-h-[60vh] -mx-1 px-1">
              {visibles.map(p => (
                <FilaCarteraInfra
                  key={p.id}
                  p={p}
                  megaproyectos={megaproyectosDe(p, megaproyectosCurados)}
                  onAbrir={() => onAbrirIniciativa(p)}
                  onQuitar={() => handleQuitar(p)}
                  quitando={quitandoId === p.id}
                />
              ))}
            </div>
          )}
          {hayFiltros(filtros) && visibles.length > 0 && (
            <p className="text-[11px] text-gray-400 text-center pt-2">
              El Excel baja estas {visibles.length}, no la cartera completa.
            </p>
          )}
        </div>
      </div>

      {agregarOpen && (
        <AgregarACarteraModal
          region={region}
          iniciativas={iniciativasRegion}
          tag={tag}
          onClose={() => setAgregarOpen(false)}
          onAgregada={(p, tags) => onUpdatePrioridad(p.n, { tags })}
        />
      )}
    </ConsolaSesionShell>
  )
}
