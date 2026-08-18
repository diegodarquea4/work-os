'use client'

import { useState } from 'react'
import { COLOR_HEX, titleCase, ladoDePartido, normComunaKey } from '@/lib/territorial/politica'
import type { TerritorialData, TerrState, CongresoCandidato, CongresoReeleccionRow } from '@/lib/territorial/types'
import { Card, CardLabel, PersonName, Party, LadoBadge, StatusBox, REELECCION } from './_shared'

function reeleccionDe(data: TerritorialData, nivel: 'diputado' | 'senador', territorio: string, nombre: string): CongresoReeleccionRow | null {
  const tabla = data.CONGRESO_REELECCION[nivel]
  return tabla ? (tabla[`${territorio}|${normComunaKey(nombre)}`] ?? null) : null
}

/** Fila de un electo (nombre, partido, bloque, % del territorio, reelección). */
function ElectoRow({
  data, nivel, territorio, e, totalVotos,
}: { data: TerritorialData; nivel: 'diputado' | 'senador'; territorio: string; e: CongresoCandidato; totalVotos: number }) {
  const lado = ladoDePartido(e.partido)
  const pct = totalVotos ? (e.votos / totalVotos * 100).toFixed(2) : null
  const r = reeleccionDe(data, nivel, territorio, e.nombre)
  return (
    <div className="mb-2 rounded-lg border border-slate-200 p-2.5">
      <PersonName>{titleCase(e.nombre)}</PersonName>
      <Party>{e.partido || 'Sin dato'}</Party>
      <div>
        <LadoBadge lado={lado} />
        <span className="mt-1.5 ml-0.5 inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 tabular-nums">
          {pct !== null ? `${pct}% · ` : ''}{e.votos.toLocaleString('es-CL')} votos
        </span>
      </div>
      {r && (
        <StatusBox
          label="¿Puede repostular?"
          value={`${r.puede_repostular ? 'Sí puede postular' : 'No puede postular'} (${r.periodos_consecutivos}º período)`}
          valueColor={r.puede_repostular ? REELECCION.siPuede : REELECCION.noPuede}
          dot={r.confianza_dato && r.confianza_dato.includes('verificado') ? REELECCION.verificado : REELECCION.otro}
        />
      )}
    </div>
  )
}

function nivelCongreso(state: TerrState): 'diputado' | 'senador' {
  return state.nivel === 'senador' ? 'senador' : 'diputado'
}

/** Ficha de congreso desde una comuna: electos del territorio + ranking de la comuna. */
export function CongresoComunaCard({ data, state, codigoComuna }: { data: TerritorialData; state: TerrState; codigoComuna: string }) {
  const [rankingOpen, setRankingOpen] = useState(false)
  const nivel = nivelCongreso(state)
  const idx = nivel === 'diputado' ? data.DIPUTADOS : data.SENADORES
  const cargoLabel = nivel === 'diputado' ? 'Diputado/a' : 'Senador/a'
  const territorioLabel = nivel === 'diputado' ? 'Distrito' : 'Circunscripción'
  const lista = (idx.porComunaAnio[codigoComuna] || {})[state.congresoAnio]

  if (!lista || !lista.length) {
    return (
      <Card>
        <CardLabel>{cargoLabel} · {state.congresoAnio}</CardLabel>
        <Party>Sin dato en esta comuna para este año</Party>
      </Card>
    )
  }

  const territorio = (lista[0][nivel === 'diputado' ? 'distrito' : 'circunscripcion'] as string) || ''
  const todos = (idx.porTerritorioAnio[territorio] || {})[state.congresoAnio] || []
  const electos = todos.filter((c) => c.electo)
  const totalVotos = todos.reduce((s, c) => s + c.votos, 0)

  return (
    <Card>
      <CardLabel>{cargoLabel} · {state.congresoAnio} · {territorioLabel}: {territorio}</CardLabel>
      {electos.length
        ? electos.map((e, i) => <ElectoRow key={i} data={data} nivel={nivel} territorio={territorio} e={e} totalVotos={totalVotos} />)
        : <p className="text-[12.5px] text-slate-500">Sin electos registrados para este territorio y año.</p>}

      <button
        onClick={() => setRankingOpen((v) => !v)}
        className="mt-1 w-full text-center text-[11px] font-medium text-slate-400 hover:text-slate-600"
      >
        {rankingOpen ? '▲ ocultar ranking completo ▼' : '▲ ver ranking completo de esta comuna ▼'}
      </button>
      {rankingOpen && (
        <div className="mt-1 flex flex-col gap-0.5">
          {lista.map((c, i) => {
            const lado = ladoDePartido(c.partido)
            return (
              <div key={i} className="flex items-center gap-2 py-1 text-[12.5px]">
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: lado ? COLOR_HEX[lado] : COLOR_HEX.NULL }} />
                <span className="flex-1 font-medium text-slate-700">{i + 1}. {titleCase(c.nombre)}</span>
                <span className="shrink-0 text-slate-500 tabular-nums">{c.votos.toLocaleString('es-CL')} votos{c.electo ? ' · Electo' : ''}</span>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

/** Ficha de un territorio de congreso (distrito/circunscripción): electos. */
export function TerritorioCongresoCard({ data, state, territorio }: { data: TerritorialData; state: TerrState; territorio: string }) {
  const nivel = nivelCongreso(state)
  const cargoLabel = nivel === 'diputado' ? 'Diputados' : 'Senadores'
  const idx = nivel === 'diputado' ? data.DIPUTADOS : data.SENADORES
  const todos = (idx.porTerritorioAnio[territorio] || {})[state.congresoAnio] || []
  const electos = todos.filter((c) => c.electo)
  const totalVotos = todos.reduce((s, c) => s + c.votos, 0)

  return (
    <Card>
      <CardLabel>{cargoLabel} electos · {state.congresoAnio}</CardLabel>
      {electos.length
        ? electos.map((e, i) => <ElectoRow key={i} data={data} nivel={nivel} territorio={territorio} e={e} totalVotos={totalVotos} />)
        : <p className="text-[12.5px] text-slate-500">Sin electos registrados.</p>}
    </Card>
  )
}
