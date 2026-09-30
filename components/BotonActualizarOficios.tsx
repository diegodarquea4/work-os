'use client'

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

/**
 * «Actualizado hace N · Renovar» — trae del SEIA los oficios pendientes de
 * esta región y los pega a la cartera.
 *
 * ── Por qué la fecha va al lado del botón ──────────────────────────────────
 *
 * Un botón de refresco solo, sin decir de cuándo es el dato, obliga a
 * apretarlo por las dudas cada vez que alguien abre la pantalla. Con la fecha
 * al lado se aprieta cuando hace falta: el cron corre lunes, miércoles y
 * viernes, así que casi siempre la respuesta es «ya está al día».
 *
 * ── De dónde sale ──────────────────────────────────────────────────────────
 *
 * Del `importado_at` más reciente de los oficios automáticos de la región, y
 * no de `sync_status`, que es nacional: lo que importa acá es cuándo se
 * actualizó ESTA región, y el botón por región no escribe el estado nacional
 * a propósito (pisaría el cursor del cron).
 */

type Props = {
  regionCod: string
  /** Para que el llamador recargue lo que está mostrando. */
  onActualizado?: () => void
  /** `true` = solo el botón, sin la fecha (para barras muy apretadas). */
  compacto?: boolean
}

export default function BotonActualizarOficios({ regionCod, onActualizado, compacto = false }: Props) {
  const [ultima, setUltima]   = useState<string | null>(null)
  const [corriendo, setCorriendo] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)

  const leerUltima = useCallback(async () => {
    const { data } = await getSupabase()
      .from('sesion_oficios_tratados')
      .select('importado_at')
      .eq('automatico', true)
      .eq('region_cod', regionCod)
      .not('importado_at', 'is', null)
      .order('importado_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setUltima((data?.importado_at as string | undefined) ?? null)
  }, [regionCod])

  useEffect(() => { void leerUltima() }, [leerUltima])

  async function actualizar() {
    setCorriendo(true)
    setResultado(null)
    try {
      const res = await fetch(
        `/api/oficios-seia/scrape?region=${encodeURIComponent(regionCod)}`,
        { method: 'POST' },
      )
      const texto = await res.text()
      let json: Record<string, unknown>
      try {
        json = JSON.parse(texto) as Record<string, unknown>
      } catch {
        // Sesión vencida: el proxy devuelve la página de login y un .json()
        // acá explota con «Unexpected token '<'», que no le dice nada a nadie.
        throw new Error('Tu sesión venció. Recargá la página y volvé a entrar.')
      }
      if (!res.ok) throw new Error(String(json.error ?? 'No se pudieron actualizar los oficios'))

      const nuevos     = Number(json.pendientes_escritos ?? 0)
      const resueltos  = Number(json.resueltos ?? 0)
      const vinculados = Number(json.vinculados ?? 0)
      const fallados   = Number(json.fallados ?? 0)

      // Corto y en la misma barra, sin alert: esto se aprieta en medio de una
      // reunión y un diálogo modal corta la conversación.
      const partes: string[] = []
      if (nuevos > 0)     partes.push(`${nuevos} nuevo${nuevos === 1 ? '' : 's'}`)
      if (resueltos > 0)  partes.push(`${resueltos} resuelto${resueltos === 1 ? '' : 's'}`)
      if (vinculados > 0) partes.push(`${vinculados} enganchado${vinculados === 1 ? '' : 's'}`)
      if (fallados > 0)   partes.push(`${fallados} sin respuesta del SEIA`)
      setResultado(partes.length > 0 ? partes.join(' · ') : 'sin cambios')

      await leerUltima()
      onActualizado?.()
    } catch (err) {
      setResultado((err as Error).message)
    } finally {
      setCorriendo(false)
    }
  }

  return (
    <span className="inline-flex items-baseline gap-1.5 flex-wrap justify-end">
      {!compacto && (
        <span className="text-[11px] text-slate-400">
          {resultado ?? (ultima ? `Actualizado ${haceCuanto(ultima)}` : 'Nunca actualizado')}
        </span>
      )}
      <button
        type="button"
        onClick={actualizar}
        disabled={corriendo}
        title="Traer del SEIA los oficios pendientes de esta región y pegarlos a la cartera"
        className="text-[11px] font-semibold text-violet-700 hover:text-violet-900 disabled:opacity-50"
      >
        {corriendo ? 'Renovando…' : 'Renovar'}
      </button>
    </span>
  )
}

/**
 * «hace 2 horas», «ayer», «hace 3 días». Sin librería: es la única fecha
 * relativa del módulo y redondear a la unidad que se lee en voz alta alcanza.
 */
function haceCuanto(iso: string): string {
  const min = Math.floor((Date.now() - Date.parse(iso)) / 60_000)
  if (!Number.isFinite(min) || min < 0) return 'recién'
  if (min < 2) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} hora${h === 1 ? '' : 's'}`
  const d = Math.floor(h / 24)
  if (d === 1) return 'ayer'
  return `hace ${d} días`
}
