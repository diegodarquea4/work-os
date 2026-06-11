'use client'

import { useEffect, useState } from 'react'
import type { CatastroEntry } from '@/lib/types'
import DesalojoVincularMinvuModal from './DesalojoVincularMinvuModal'

/**
 * Bloque inline para el header de una capa: muestra la info heredada del
 * catastro MINVU si `folio` está set, o un CTA para vincular si no.
 *
 * Hace el lookup server-side via /api/catastro-minvu?folio=… para no bundlear
 * el catastro entero en el cliente.
 *
 * Se reusa tanto en Avance como en Contexto.
 */

type Props = {
  folio:         string | null
  regionPreset?: string
  onVincular:    (folio: string, lat: number, lng: number) => Promise<void>
  onQuitar:      () => Promise<void>
}

export default function DesalojoVinculoMinvu({
  folio, regionPreset, onVincular, onQuitar,
}: Props) {
  // Cache del último fetch: { folio, data } — la data es null si el fetch
  // resolvió sin matches o falló. El display se DERIVA del folio actual vs el
  // cacheado para evitar setState síncrono en el effect.
  const [cached, setCached] = useState<{ folio: string; data: CatastroEntry | null } | null>(null)
  const [openModal, setOpenModal] = useState(false)

  const entry   = cached && cached.folio === folio ? cached.data : null
  const loading = folio !== null && (cached?.folio ?? null) !== folio

  useEffect(() => {
    if (!folio) return
    let cancelled = false
    fetch(`/api/catastro-minvu?folio=${encodeURIComponent(folio)}`)
      .then(r => r.json())
      .then(json => {
        if (cancelled) return
        setCached({ folio, data: json.results?.[0] ?? null })
      })
      .catch(() => {
        if (cancelled) return
        setCached({ folio, data: null })
      })
    return () => { cancelled = true }
  }, [folio])

  async function handleConfirm(picked: CatastroEntry) {
    await onVincular(picked.folio, picked.lat, picked.lng)
  }

  async function handleQuitar() {
    if (!window.confirm('¿Quitar el vínculo con el catastro MINVU? Las coordenadas heredadas dejarán de usarse.')) return
    await onQuitar()
  }

  return (
    <>
      {folio ? (
        <div className="mt-2 pt-2 border-t border-gray-100 flex items-start gap-3 text-[11px]">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-700 flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Vinculada al catastro MINVU
              {loading && <span className="text-gray-400 font-normal">(cargando…)</span>}
            </p>
            {entry ? (
              <p className="text-gray-600 leading-snug mt-0.5">
                <span className="text-gray-700">Folio {entry.folio}</span>
                {' · '}{entry.nombre}
                {' · '}{entry.comuna}
                {entry.hogares_catastro !== null && <> · {entry.hogares_catastro} hogares</>}
                {entry.tipo_propiedad && <> · {entry.tipo_propiedad}</>}
                {entry.propietario && entry.propietario !== 'S/I' && <> · {entry.propietario}</>}
                {' · '}<span className="text-gray-400">{entry.catastro_ingreso.replace(/^CATASTRO[ _]/, 'CNC ')}</span>
              </p>
            ) : !loading ? (
              <p className="text-amber-700 leading-snug mt-0.5">
                Folio {folio} no se encontró en el bundled. ¿Catastro desactualizado?
              </p>
            ) : null}
          </div>
          <div className="flex gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setOpenModal(true)}
              className="text-[10px] px-2 py-1 rounded text-gray-600 hover:bg-gray-100 font-medium uppercase tracking-wide"
            >
              Cambiar
            </button>
            <button
              type="button"
              onClick={handleQuitar}
              className="text-[10px] px-2 py-1 rounded text-red-600 hover:bg-red-50 font-medium uppercase tracking-wide"
            >
              Quitar
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between gap-3 text-[11px]">
          <p className="text-gray-500 leading-snug">
            Sin vínculo al catastro MINVU. Vinculá para heredar coords y datos oficiales.
          </p>
          <button
            type="button"
            onClick={() => setOpenModal(true)}
            className="text-[11px] px-2.5 py-1 rounded bg-slate-900 text-white hover:bg-slate-700 font-semibold shrink-0"
          >
            Vincular folio MINVU
          </button>
        </div>
      )}

      <DesalojoVincularMinvuModal
        open={openModal}
        onClose={() => setOpenModal(false)}
        onConfirm={handleConfirm}
        regionPreset={regionPreset}
        currentFolio={folio}
      />
    </>
  )
}
