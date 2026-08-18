'use client'

import { ladoDeDelegado } from '@/lib/territorial/politica'
import type { TerritorialData } from '@/lib/territorial/types'
import { Card, CardLabel, PersonName, Party, LadoBadge } from './_shared'

/** Delegados presidenciales de una región para el período (presidente) seleccionado. */
export default function DelegadosCard({
  data, regionCod, periodo,
}: { data: TerritorialData; regionCod: string; periodo: string }) {
  const porPresidente = data.DELEGADOS_POR_REGION[regionCod] || {}
  const lista = porPresidente[periodo] || []

  if (!lista.length) {
    return (
      <Card>
        <p className="text-[12.5px] text-slate-500">Sin datos de delegados para esta región en este período.</p>
      </Card>
    )
  }

  return (
    <Card>
      <CardLabel>Gobierno de {periodo}{lista[0].cargo ? ` · ${lista[0].cargo}` : ''}</CardLabel>
      <div className="flex flex-col gap-1.5">
        {lista.map((d) => {
          const lado = ladoDeDelegado(d.partido)
          return (
            <div key={d.id} className="rounded-lg border border-slate-200 p-2.5">
              <PersonName>{d.nombre}</PersonName>
              <Party>{d.partido || 'Sin dato'}</Party>
              {d.periodo_especifico && <LadoBadge lado={lado} />}
              {d.periodo_especifico && (
                <span className="mt-1.5 ml-1.5 inline-block text-[11.5px] text-slate-400">{d.periodo_especifico}</span>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
