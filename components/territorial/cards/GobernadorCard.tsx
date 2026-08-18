'use client'

import { useEffect, useState } from 'react'
import { titleCase, regionKey } from '@/lib/territorial/politica'
import { loadFotoGobernador } from '@/lib/territorial/source'
import type { ComunaProps, ClaveLado, AnioMunicipal } from '@/lib/territorial/types'
import {
  Card, CardLabel, PersonName, Party, LadoBadge, PctTag, MetaRow, StatusBox, ContrincantesBox,
  REELECCION, confColor, confLabel,
} from './_shared'

/** Foto del gobernador (base64) bajo demanda, cacheada por (región, año). */
const fotoCache = new Map<string, string | null>()

function useFotoGobernador(regionCod: string, year: string): string | null {
  const cacheKey = `${regionCod}|${year}`
  const [foto, setFoto] = useState<string | null>(() => fotoCache.get(cacheKey) ?? null)
  useEffect(() => {
    // El caso cacheado ya lo resuelve el initializer; setState solo en el callback async.
    if (fotoCache.has(cacheKey)) return
    let vivo = true
    loadFotoGobernador(regionKey(regionCod), year)
      .then((b64) => { fotoCache.set(cacheKey, b64); if (vivo) setFoto(b64) })
      .catch(() => { fotoCache.set(cacheKey, null); if (vivo) setFoto(null) })
    return () => { vivo = false }
  }, [cacheKey, regionCod, year])
  return foto
}

export default function GobernadorCard({
  props, year, lado, mostrarResultadoComunal,
}: { props: ComunaProps; year: AnioMunicipal; lado: ClaveLado; mostrarResultadoComunal: boolean }) {
  const gob = props[`gobernador_${year}`]
  const foto = useFotoGobernador(props.codigo_region, year)

  if (!gob) {
    return (
      <Card>
        <CardLabel>Gobernador/a regional {year}</CardLabel>
        <Party>Sin dato</Party>
      </Card>
    )
  }
  const ladoGob = gob[lado]
  const rc = mostrarResultadoComunal ? gob.resultado_comunal : undefined
  const r = year === '2024' ? props.gobernador_reeleccion_2028 : undefined

  return (
    <Card>
      <div className="flex gap-3">
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`data:image/jpeg;base64,${foto}`} alt={gob.nombre || 'Gobernador/a'} className="h-16 w-16 shrink-0 rounded-lg object-cover" />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-2xl text-slate-400">👤</div>
        )}
        <div className="min-w-0 flex-1">
          <CardLabel>Gobernador/a regional {year}</CardLabel>
          <PersonName>{gob.nombre ? titleCase(gob.nombre) : 'Sin nombre registrado'}</PersonName>
          <Party>{gob.partido || 'Sin dato'}</Party>
          <div>
            <LadoBadge lado={ladoGob} />
            <PctTag pct={gob.pct} votos={gob.votos} />
          </div>
        </div>
      </div>

      {rc && (() => {
        const vueltaTxt = rc.vuelta_usada === '2a' ? '2ª vuelta' : '1ª vuelta (ganó directo, sin 2ª vuelta en la región)'
        const pctTxt = rc.pct_en_comuna != null
          ? ` · ${rc.pct_en_comuna.toFixed(2)}% de los votos ahí${rc.votos_en_comuna != null ? ` (${rc.votos_en_comuna.toLocaleString('es-CL')} votos)` : ''}`
          : ''
        return rc.gano ? (
          <StatusBox
            label="Resultado en esta comuna"
            value={`✓ Ganó en ${titleCase(props.comuna)}`}
            valueColor={REELECCION.siPuede}
            dot={REELECCION.verificado}
            note={`${vueltaTxt}${pctTxt}`}
          />
        ) : (
          <StatusBox
            label="Resultado en esta comuna"
            value={`✕ Perdió en ${titleCase(props.comuna)}`}
            valueColor={REELECCION.noPuede}
            dot="#555555"
            note={`Ganó localmente: ${titleCase(rc.ganador_comuna || '')} · ${vueltaTxt}${pctTxt}`}
          />
        )
      })()}

      {r && (
        <StatusBox
          label="¿Puede ir a reelección 2028?"
          value={r.puede_repostular ? 'Sí puede postular' : 'No puede postular (2do período)'}
          valueColor={r.puede_repostular ? REELECCION.siPuede : REELECCION.noPuede}
          dot={confColor(r.estado_confianza)}
          note={confLabel(r.estado_confianza)}
        />
      )}

      {gob.voto_obligatorio != null && <MetaRow label="Tipo de voto" value={gob.voto_obligatorio ? 'Obligatorio' : 'Voluntario'} />}
      <ContrincantesBox contrincantes={gob.contrincantes} />
    </Card>
  )
}
