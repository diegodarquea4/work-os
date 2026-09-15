'use client'

import FilterPopover, { type FilterOption } from './FilterPopover'

/**
 * Control flotante de los pines del Mapa (mig 104). Va debajo del breadcrumb,
 * mismo chrome. Tiene dos alcances:
 *
 * La CAPA ya no se elige acá: desde el 2026-09-15 la fija el selector de la
 * vista Mapa (`CapaSelector` en WorkOSApp, persistido), que rige también el
 * lateral. Este control solo ve iniciativas de la capa elegida.
 *
 * `alcance='pais'` — sin drill, sobre Chile entero. Una sola fila con el
 *   selector de etiquetas, y recién cuando hay una elegida aparece el
 *   contador. Es deliberado que el mapa país arranque con un botón y nada
 *   más: dibujar las miles de iniciativas georreferenciadas del país de una
 *   sola vez no se lee ni se navega. Con una etiqueta elegida el mapa responde
 *   la pregunta que la motiva —dónde está esto— sin recortarla a una región
 *   (Diego, 2026-09-14).
 *
 * `alcance='region'` — dentro del drill comunal. El mapa dibuja los pines de
 *   TODO el país (no solo los de la región abierta), para poder desplazarse a
 *   una región vecina sin salir del zoom y volver a entrar. Por eso el alcance
 *   de cada filtro es distinto, y así lo pidió Diego el 2026-09-14: la
 *   etiqueta es GENERAL —cruza regiones— y comuna es el único ESPECÍFICO. El
 *   contador sigue hablando de la región abierta: es su señal de avance de la
 *   georreferenciación, y el texto lo dice. Dos filas:
 *
 *   fila 1 — el contador de avance de la georreferenciación de la región (solo
 *     cuentan las que tienen ubicación exacta cargada: sin aproximación por
 *     centroide, Diego 2026-09-11) y el chip "+N de alcance regional" (esas
 *     no tienen pin) → abre la lista en el lateral.
 *
 *   fila 2 — selectores de comuna y de etiqueta (Diego, 2026-09-11): dejan ver
 *     solo los pines que calzan. Vacío = todos. Reusan `FilterPopover` (mismo
 *     multi-select con búsqueda del Dashboard) en vez de filas de chips: una
 *     región puede tener 50+ comunas y decenas de etiquetas, y la UI del mapa
 *     se mantiene limpia (detalle bajo demanda). Se combinan con Y entre sí y
 *     con O dentro de cada uno.
 */

type ComunaOpcion = { cut: number; nombre: string; pines: number }
type EtiquetaOpcion = { tag: string; pines: number }

type Props = {
  /** 'region' = dentro del drill comunal; 'pais' = mapa de Chile entero. */
  alcance?: 'region' | 'pais'
  conUbicacion: number
  sinUbicacion: number
  regionales: number
  onVerRegionales?: () => void
  /** Comunas que hoy tienen al menos un pin (en la capa elegida). Solo en 'region'. */
  comunasOpciones?: ComunaOpcion[]
  /** CUT seleccionados. Vacío = todas las comunas. Solo en 'region'. */
  comunasSel?: ReadonlySet<number>
  onChangeComunas?: (next: Set<number>) => void
  /** Etiquetas que hoy tienen al menos un pin (en la capa elegida). */
  etiquetasOpciones: EtiquetaOpcion[]
  /** Etiquetas seleccionadas. Vacío = todas. */
  etiquetasSel: ReadonlySet<string>
  onChangeEtiquetas: (next: Set<string>) => void
}

export default function MapaPinesControl({
  alcance = 'region',
  conUbicacion, sinUbicacion, regionales, onVerRegionales,
  comunasOpciones = [], comunasSel, onChangeComunas,
  etiquetasOpciones, etiquetasSel, onChangeEtiquetas,
}: Props) {
  const total = conUbicacion + sinUbicacion

  // FilterPopover habla en strings; el CUT es la llave real (número).
  const opciones: FilterOption[] = comunasOpciones.map(c => ({
    value: String(c.cut),
    label: c.nombre,
    count: c.pines,
  }))
  const seleccionadas = new Set(Array.from(comunasSel ?? [], cut => String(cut)))

  const opcionesTag: FilterOption[] = etiquetasOpciones.map(e => ({
    value: e.tag,
    label: e.tag,
    count: e.pines,
  }))

  // En el drill el contador habla de la REGIÓN abierta (es su señal de avance
  // de la georreferenciación), aunque el mapa dibuje además los pines de las
  // vecinas. Decirlo evita leer el número como si contara todo lo que se ve.
  const contador = (
    <p
      className="text-[11px] text-gray-500 tabular-nums"
      title={alcance === 'region'
        ? 'Iniciativas de esta región con ubicación exacta cargada. El mapa muestra además los pines de las regiones vecinas, que no entran en esta cuenta. Sin ubicación no hay pin — se fija desde la ficha o subiendo Latitud/Longitud por Excel.'
        : 'Iniciativas con ubicación exacta cargada que calzan con los filtros. Las que no tienen ubicación no aparecen como pin — se fija desde la ficha o subiendo Latitud/Longitud por Excel.'}
    >
      <span className="font-semibold text-slate-700">{conUbicacion}</span> de {total} georreferenciadas
      {alcance === 'region' && ' en esta región'}
      {sinUbicacion > 0 && <span className="text-gray-400"> · {sinUbicacion} sin ubicación</span>}
    </p>
  )

  const filtroEtiquetas = (
    <div title="Filtro general: se aplica a todas las regiones, también dentro del zoom comunal. Muestra solo los pines de las iniciativas que tengan alguna de las etiquetas elegidas.">
      <FilterPopover
        label="Etiquetas"
        options={opcionesTag}
        selected={new Set(etiquetasSel)}
        onChange={onChangeEtiquetas}
        disabled={opcionesTag.length === 0}
        searchPlaceholder="Buscar etiqueta..."
      />
    </div>
  )

  // ── Mapa país: el selector solo, y el resto cuando ya hay algo que contar ──
  if (alcance === 'pais') {
    const hayEtiqueta = (etiquetasSel?.size ?? 0) > 0
    return (
      <div className="pointer-events-auto flex items-center gap-2 flex-wrap bg-white/95 backdrop-blur-sm border border-gray-200 rounded-lg shadow-sm px-2.5 py-1.5 max-w-full">
        {filtroEtiquetas}
        {hayEtiqueta ? contador : (
          <span className="text-[11px] text-gray-400">
            Elige una etiqueta para verla en todo el país
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="pointer-events-auto flex flex-col gap-1.5 bg-white/95 backdrop-blur-sm border border-gray-200 rounded-lg shadow-sm px-2.5 py-1.5 max-w-full">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Pines</span>
        {contador}
        {regionales > 0 && (
          <button
            type="button"
            onClick={onVerRegionales}
            className="text-[11px] text-violet-700 hover:text-violet-900 font-medium hover:underline"
            title="Iniciativas de alcance regional: no tienen comuna, no van como pin"
          >
            +{regionales} de alcance regional
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div title="Único filtro específico: son las comunas de esta región, y al elegir alguna el mapa deja de mostrar las vecinas. Las de alcance regional también quedan fuera: no pertenecen a ninguna comuna.">
          <FilterPopover
            label="Comunas"
            options={opciones}
            selected={seleccionadas}
            onChange={next => onChangeComunas?.(new Set(Array.from(next, v => Number(v))))}
            disabled={opciones.length === 0}
            searchPlaceholder="Buscar comuna..."
          />
        </div>
        {filtroEtiquetas}
      </div>
    </div>
  )
}
