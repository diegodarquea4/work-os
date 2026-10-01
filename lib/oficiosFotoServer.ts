/**
 * Sacar la foto: el I/O que rodea a `armarFoto` (lib/oficiosFotos.ts).
 *
 * Lo llaman dos lugares, y esa es toda la política de cuándo se saca:
 *
 *   · El cierre de una sesión del Comité Seguimiento de la Inversión
 *     (app/api/sesiones/[id]/cerrar). Es la foto buena: queda fechada el día
 *     de la reunión y dice «así estábamos cuando nos juntamos».
 *   · El cron del scraper, cuando pasaron 20 días sin ninguna. Es el respaldo,
 *     para que una reunión postergada no deje un hueco en la serie.
 *
 * Service role siempre: `oficios_foto_oaeca` no tiene policy de escritura (mig
 * 122), justamente para que una serie histórica no dependa de quién estaba
 * mirando la pantalla.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { armarFoto, necesitaRespaldo, type OficioParaFoto } from '@/lib/oficiosFotos'
import { diaChile } from '@/lib/fechaChile'

/* eslint-disable @typescript-eslint/no-explicit-any -- el cliente admin viene sin tipos generados */
type Db = SupabaseClient<any, any, any>

export type ResultadoFoto = {
  ok: boolean
  /** Organismos retratados. 0 con `ok: true` = la región no debe nada. */
  organismos: number
  dia: string
  error?: string
}

/**
 * Retrata los oficios pendientes de una región y guarda una fila por organismo.
 *
 * Idempotente por (región, día): borra lo de ese día y reescribe. No es un
 * upsert porque el índice único de la mig 122 va sobre `lower(btrim(oaeca))` y
 * PostgREST no puede apuntar su ON CONFLICT a un índice por expresión — el
 * mismo motivo por el que el scraper escribe explícito.
 *
 * NO tira: la foto es un registro paralelo. Que falle no puede impedir que una
 * sesión se cierre ni que el scraper termine — se pierde un punto de la serie,
 * que se nota y se repara; abortar un cierre por esto sería mucho peor.
 */
export async function tomarFotoOficios(
  db: Db,
  regionCod: string,
  opts: { origen: 'sesion' | 'respaldo'; sesionId?: number | null; dia?: string },
): Promise<ResultadoFoto> {
  const dia = opts.dia ?? diaChile()
  try {
    const { data, error } = await db
      .from('sesion_oficios_tratados')
      .select('region_cod, oaeca_sea, oaeca_nombre, ministerio, fecha_limite, proyecto_privado_id')
      .eq('automatico', true)
      .eq('estado', 'pendiente')
      .eq('region_cod', regionCod)
      .limit(5000)
    if (error) return { ok: false, organismos: 0, dia, error: error.message }

    const filas = armarFoto((data ?? []) as OficioParaFoto[], regionCod, dia)

    // Se borra incluso cuando no quedan filas: si la región resolvió todo entre
    // dos cierres del mismo día, la foto correcta es «nada», no la anterior.
    const { error: borrarErr } = await db
      .from('oficios_foto_oaeca')
      .delete()
      .eq('region_cod', regionCod)
      .eq('tomada_el', dia)
    if (borrarErr) return { ok: false, organismos: 0, dia, error: borrarErr.message }

    if (filas.length === 0) return { ok: true, organismos: 0, dia }

    const { error: insErr } = await db
      .from('oficios_foto_oaeca')
      .insert(filas.map(f => ({ ...f, origen: opts.origen, sesion_id: opts.sesionId ?? null })))
    if (insErr) return { ok: false, organismos: 0, dia, error: insErr.message }

    return { ok: true, organismos: filas.length, dia }
  } catch (err) {
    return { ok: false, organismos: 0, dia, error: (err as Error).message }
  }
}

/**
 * Las regiones a las que les toca foto de respaldo: hace 20 días o más que no
 * tienen ninguna, y tienen algo pendiente que retratar.
 *
 * La segunda condición importa. Sin ella, las 16 regiones «necesitarían»
 * respaldo para siempre —una región sin oficios nunca genera filas, así que
 * nunca registra una foto— y el cron intentaría retratarlas en cada corrida.
 */
export async function regionesQueNecesitanRespaldo(db: Db, hoy = diaChile()): Promise<string[]> {
  const { data: pendientes, error } = await db
    .from('sesion_oficios_tratados')
    .select('region_cod')
    .eq('automatico', true)
    .eq('estado', 'pendiente')
    .not('region_cod', 'is', null)
    .limit(20_000)
  if (error) return []

  const conPendientes = new Set((pendientes ?? []).map(r => r.region_cod as string))
  if (conPendientes.size === 0) return []

  const { data: fotos } = await db
    .from('oficios_foto_oaeca')
    .select('region_cod, tomada_el')
    .in('region_cod', [...conPendientes])
    .order('tomada_el', { ascending: false })
    .limit(5000)

  const ultima = new Map<string, string>()
  for (const f of fotos ?? []) {
    const cod = f.region_cod as string
    // Vienen ordenadas descendente: la primera de cada región es la última.
    if (!ultima.has(cod)) ultima.set(cod, f.tomada_el as string)
  }

  return [...conPendientes].filter(cod => necesitaRespaldo(ultima.get(cod) ?? null, hoy))
}
