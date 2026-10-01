'use client'

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useCanEditAny } from '@/lib/context/UserContext'
import { esDeHoyEnChile } from '@/lib/fechaChile'

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
 * ── Por qué se apaga cuando ya se actualizó hoy ────────────────────────────
 *
 * Porque consultar el SEIA cuesta ~5 s por expediente y en el mismo día casi
 * nunca cambia nada: publica en horario de oficina. La ruta ya no lo consulta
 * («candado diario», ver app/api/oficios-seia/scrape/route.ts), así que un
 * botón habilitado prometería un trabajo que no va a pasar. Decirlo es mejor
 * que hacer como si.
 *
 * Admin y editor conservan «forzar»: a veces alguien sabe algo que el panel no
 * —«el SEREMI dice que respondió recién»— y ahí sí vale volver a preguntar.
 *
 * ── De dónde sale la fecha ─────────────────────────────────────────────────
 *
 * Del `importado_at` más reciente de los oficios automáticos de la región, y
 * no de `sync_status`, que es nacional: lo que importa acá es cuándo se
 * actualizó ESTA región, y el botón por región no escribe el estado nacional
 * a propósito (pisaría el cursor del cron). Es la misma marca que usa el
 * candado del servidor, así que la pantalla y la ruta no pueden discrepar.
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
  const puedeForzar = useCanEditAny()

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

  const alDiaHoy = esDeHoyEnChile(ultima)

  async function actualizar(forzando = false) {
    setCorriendo(true)
    setResultado(null)
    try {
      const res = await fetch(
        `/api/oficios-seia/scrape?region=${encodeURIComponent(regionCod)}${forzando ? '&forzar=1' : ''}`,
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
      const saltados   = Number(json.saltados ?? 0)
      const procesados = Number(json.procesados ?? 0)

      // Corto y en la misma barra, sin alert: esto se aprieta en medio de una
      // reunión y un diálogo modal corta la conversación.
      const partes: string[] = []
      if (nuevos > 0)     partes.push(`${nuevos} nuevo${nuevos === 1 ? '' : 's'}`)
      if (resueltos > 0)  partes.push(`${resueltos} resuelto${resueltos === 1 ? '' : 's'}`)
      if (vinculados > 0) partes.push(`${vinculados} enganchado${vinculados === 1 ? '' : 's'}`)
      if (fallados > 0)   partes.push(`${fallados} sin respuesta del SEIA`)
      setResultado(
        partes.length > 0 ? partes.join(' · ')
        : procesados > 0 && saltados === procesados ? 'ya estaba al día hoy'
        : 'sin cambios',
      )

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
      {alDiaHoy && !corriendo ? (
        <>
          <span
            className="text-[11px] font-semibold text-slate-400"
            title="Los oficios de esta región ya se consultaron hoy en el SEIA. El SEIA publica en horario de oficina: volver a preguntarle el mismo día tarda lo mismo y trae lo mismo."
          >
            Al día hoy
          </span>
          {puedeForzar && (
            <button
              type="button"
              onClick={() => actualizar(true)}
              title="Volver a consultar el SEIA aunque ya se haya consultado hoy. Tarda unos segundos por proyecto."
              className="text-[11px] font-semibold text-slate-400 hover:text-violet-700 underline decoration-dotted"
            >
              forzar
            </button>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={() => actualizar(false)}
          disabled={corriendo}
          title="Traer del SEIA los oficios pendientes de esta región y pegarlos a la cartera"
          className="text-[11px] font-semibold text-violet-700 hover:text-violet-900 disabled:opacity-50"
        >
          {corriendo ? 'Renovando…' : 'Renovar'}
        </button>
      )}
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
