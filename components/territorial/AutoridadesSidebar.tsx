'use client'

/**
 * Lateral del modo «Autoridades»: enruta a la ficha correspondiente según el nivel
 * de drill — país (vacío) / región / comuna / territorio de congreso. Porta el
 * contenido de renderSideRegion / renderSideCommune / renderSideTerritorioCongreso
 * del PTS con las fichas de work-os. Sin botón «Editar» (modo solo lectura).
 */

import { INE_CODE } from '@/lib/regions'
import { regionKey, cutKey } from '@/lib/territorial/politica'
import { computeStats, esNivelCongreso } from '@/lib/territorial/derive'
import { useTerritorialCtx } from './TerritorialProvider'
import AlcaldeCard from './cards/AlcaldeCard'
import GobernadorCard from './cards/GobernadorCard'
import { CongresoComunaCard, TerritorioCongresoCard } from './cards/CongresoCard'
import DelegadosCard from './cards/DelegadosCard'
import { CompareArrow } from './cards/_shared'

type Props = {
  width: number | string
  regionCod: string | null       // cod romano de work-os (III, RM…)
  selectedCut: number | null     // CUT numérico de work-os
  onEnterComunas?: () => void
  onClose?: () => void           // cerrar el detalle (vuelve a país)
}

function Header({ title, tag }: { title: string; tag?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
      {tag && <span className="text-[12px] text-slate-400">{tag}</span>}
    </div>
  )
}

function CountsLine({ label, izq, der, ind, sd }: { label: string; izq: number; der: number; ind: number; sd: number }) {
  return (
    <div className="mt-3 text-[12.5px] text-slate-500">
      {label} ({izq} izq · {der} der · {ind} ind{sd ? ` · ${sd} s/d` : ''})
    </div>
  )
}

export default function AutoridadesSidebar({ width, regionCod, selectedCut, onEnterComunas, onClose }: Props) {
  const { data, loading, error, state, selectedTerritorio } = useTerritorialCtx()

  const regKey = regionCod != null ? regionKey(INE_CODE[regionCod]) : null
  const comunaKey = selectedCut != null ? cutKey(selectedCut) : null
  const haySeleccion = !!regKey || !!comunaKey || !!selectedTerritorio

  return (
    <aside className="relative flex-shrink-0 overflow-y-auto border-l border-slate-200 bg-white" style={{ width }} aria-label="Detalle de autoridades">
      {haySeleccion && onClose && (
        <button
          onClick={onClose}
          aria-label="Cerrar detalle"
          className="absolute right-3 top-3 z-10 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4l12 12M16 4L4 16" /></svg>
        </button>
      )}
      <div className="p-4">
        {loading && <div className="text-sm text-slate-500">Cargando datos de autoridades…</div>}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            No se pudieron cargar los datos de autoridades.
            <div className="mt-1 text-xs text-red-500">{error}</div>
          </div>
        )}
        {!loading && !error && data && (
          <Body
            data={data}
            state={state}
            regKey={regKey}
            regionCod={regionCod}
            comunaKey={comunaKey}
            onEnterComunas={onEnterComunas}
          />
        )}
      </div>
    </aside>
  )
}

function Body({
  data, state, regKey, regionCod, comunaKey, onEnterComunas,
}: {
  data: ReturnType<typeof useTerritorialCtx>['data']
  state: ReturnType<typeof useTerritorialCtx>['state']
  regKey: string | null
  regionCod: string | null
  comunaKey: string | null
  onEnterComunas?: () => void
}) {
  const { selectedTerritorio } = useTerritorialCtx()
  if (!data) return null

  // 1) Territorio de congreso seleccionado (solo válido en congreso + por distrito)
  if (selectedTerritorio && esNivelCongreso(state.nivel) && state.coloreoCongreso === 'distrito') {
    const territorioLabel = state.nivel === 'senador' ? 'Circunscripción' : 'Distrito'
    return (
      <>
        <Header title={`${territorioLabel}: ${selectedTerritorio}`} tag={`${state.nivel === 'senador' ? 'Senadores' : 'Diputados'} electos`} />
        <TerritorioCongresoCard data={data} state={state} territorio={selectedTerritorio} />
      </>
    )
  }

  // 2) Comuna seleccionada
  if (comunaKey && data.comunaPropsByCut[comunaKey]) {
    const p = data.comunaPropsByCut[comunaKey]
    if (state.nivel === 'delegado') {
      return (
        <>
          <Header title={p.region} tag="Delegados presidenciales (dato regional, no por comuna)" />
          <DelegadosCard data={data} regionCod={p.codigo_region} periodo={state.periodoDelegado} />
        </>
      )
    }
    if (state.nivel === 'diputado' || state.nivel === 'senador') {
      return (
        <>
          <Header title={p.comuna} tag={`${p.region} · Código ${p.codigo_comuna}`} />
          <CongresoComunaCard data={data} state={state} codigoComuna={p.codigo_comuna} />
        </>
      )
    }
    const bloqueAlcalde = (
      <>
        <AlcaldeCard props={p} year="2024" lado={state.lado} />
        <CompareArrow>▲ comparar con 2021 ▼</CompareArrow>
        <AlcaldeCard props={p} year="2021" lado={state.lado} />
      </>
    )
    const bloqueGobernador = (
      <>
        <GobernadorCard props={p} year="2024" lado={state.lado} mostrarResultadoComunal />
        <CompareArrow>▲ comparar con 2021 ▼</CompareArrow>
        <GobernadorCard props={p} year="2021" lado={state.lado} mostrarResultadoComunal />
      </>
    )
    return (
      <>
        <Header title={p.comuna} tag={`${p.region} · Código ${p.codigo_comuna}`} />
        {state.nivel === 'gobernador'
          ? <>{bloqueGobernador}<div className="h-2" />{bloqueAlcalde}</>
          : <>{bloqueAlcalde}<div className="h-2" />{bloqueGobernador}</>}
      </>
    )
  }

  // 3) Región seleccionada
  if (regKey && data.comunasByRegion[regKey]?.length) {
    const comunas = data.comunasByRegion[regKey]
    const regionName = data.regionesById[regKey]?.region ?? comunas[0].region
    const stats = computeStats(data, state, 'comunas', regKey)

    if (state.nivel === 'delegado') {
      return (
        <>
          <Header title={regionName} tag="Delegados presidenciales, últimos 3 gobiernos" />
          <DelegadosCard data={data} regionCod={regKey} periodo={state.periodoDelegado} />
        </>
      )
    }
    // Gobernador: es autoridad REGIONAL → mostramos su(s) ficha(s) acá.
    if (state.nivel === 'gobernador') {
      return (
        <>
          <Header title={regionName} tag={`${comunas.length} comunas`} />
          <GobernadorCard props={comunas[0]} year="2024" lado={state.lado} mostrarResultadoComunal={false} />
          <CompareArrow>▲ comparar con 2021 ▼</CompareArrow>
          <GobernadorCard props={comunas[0]} year="2021" lado={state.lado} mostrarResultadoComunal={false} />
          {onEnterComunas && <EnterButton region={regionName} onClick={onEnterComunas} label="Ver resultado por comuna" />}
        </>
      )
    }
    // Alcalde / diputado / senador: son datos por COMUNA/territorio → a nivel región
    // solo un resumen de bloques + botón para entrar a las comunas (sin gobernadores).
    const etiqueta = state.nivel === 'alcalde'
      ? `Alcaldes ${state.year} en esta región`
      : `${state.nivel === 'senador' ? 'Senadores' : 'Diputados'} ${state.congresoAnio} en esta región`
    return (
      <>
        <Header title={regionName} tag={`${comunas.length} comunas`} />
        <CountsLine label={etiqueta} izq={stats.IZQ} der={stats.DER} ind={stats.IND} sd={stats.NULL} />
        {onEnterComunas && <EnterButton region={regionName} onClick={onEnterComunas} />}
      </>
    )
  }

  // 4) País (vacío)
  void regionCod
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
      <div className="mb-1 font-semibold text-slate-700">Selecciona una región</div>
      Haz clic en el mapa para ver el resumen de la región, o doble clic para entrar y ver el detalle por comuna.
      <div className="mt-2 text-[12px] text-slate-400">
        Isla de Pascua y el territorio Antártico no se muestran en el mapa por su ubicación geográfica.
      </div>
    </div>
  )
}

function EnterButton({ region, onClick, label }: { region: string; onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-800"
    >
      {label ?? `→ Ver comunas de ${region}`}
    </button>
  )
}
