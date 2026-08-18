'use client'

import { titleCase } from '@/lib/territorial/politica'
import { periodoTextoAlcalde } from '@/lib/territorial/derive'
import type { ComunaProps, ClaveLado, AnioMunicipal } from '@/lib/territorial/types'
import {
  Card, CardLabel, PersonName, Party, LadoBadge, PctTag, MetaRow, StatusBox, ContrincantesBox,
  REELECCION, confColor, confLabel,
} from './_shared'

export default function AlcaldeCard({ props, year, lado }: { props: ComunaProps; year: AnioMunicipal; lado: ClaveLado }) {
  const al = props[`alcalde_${year}`]
  if (!al) {
    return (
      <Card>
        <CardLabel>Alcalde/sa {year}</CardLabel>
        <Party>Sin dato en la base</Party>
      </Card>
    )
  }
  const ladoAl = al[lado]

  const r = year === '2024' ? props.reeleccion_2028 : undefined

  return (
    <Card>
      <CardLabel>Alcalde/sa {year}{al.reelecto ? ' · Reelecto' : ''}</CardLabel>
      <PersonName>{titleCase(al.nombre || 'Sin dato')}</PersonName>
      <Party>{al.partido || 'Sin dato'}</Party>
      <div>
        <LadoBadge lado={ladoAl} />
        <PctTag pct={al.pct} votos={al.votos} />
      </div>

      {r && r.estado_confianza === 'tbd' && (
        <StatusBox
          label="¿Puede ir a reelección 2028?"
          value={<span className="text-slate-400">No determinado</span>}
          valueColor="#999999"
          dot={confColor(r.estado_confianza)}
          note={confLabel(r.estado_confianza)}
        />
      )}
      {r && r.estado_confianza !== 'tbd' && (() => {
        const periodoTxt = periodoTextoAlcalde(props)
        const valueText = r.puede_repostular
          ? `Sí puede postular${periodoTxt ? ` (${periodoTxt})` : ''}`
          : 'No puede postular (3er período)'
        return (
          <StatusBox
            label="¿Puede ir a reelección 2028?"
            value={valueText}
            valueColor={r.puede_repostular ? REELECCION.siPuede : REELECCION.noPuede}
            dot={confColor(r.estado_confianza)}
            note={confLabel(r.estado_confianza)}
          />
        )
      })()}

      {al.tope_reeleccion && (
        <StatusBox
          label="⚠️ Límite de reelección alcanzado"
          value="No pudo repostular en 2024"
          valueColor={REELECCION.noPuede}
          dot={REELECCION.verificado}
          note={al.tope_reeleccion.nota}
        />
      )}

      {al.poblacion ? <MetaRow label="Población (2017)" value={al.poblacion.toLocaleString('es-CL')} /> : null}
      {al.voto_obligatorio != null && <MetaRow label="Tipo de voto" value={al.voto_obligatorio ? 'Obligatorio' : 'Voluntario'} />}
      {al.tamano ? <MetaRow label="Tamaño comuna" value={al.tamano} /> : null}
      <ContrincantesBox contrincantes={al.contrincantes} />
    </Card>
  )
}
