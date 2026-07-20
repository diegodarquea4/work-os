'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

// Tablas que alimentan el panel de Métricas — todas se llenan vía upsert desde
// el cron de Manuel (sync_a_workos en actualizar_datos.py). `created_at` solo
// se setea al INSERT (nunca se reenvía en el upsert), así que MAX(created_at)
// entre estas tablas es el momento exacto en que llegó información NUEVA por
// última vez (no solo "el cron corrió", sino "trajo algo que no estaba antes").
const TABLAS = ['registros_bce', 'registros_bce_empleo', 'registros_leystop', 'registros_leystop_delitos'] as const

export function fmtUltimaActualizacion(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-CL', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

/** Última vez que alguna de las tablas de Métricas recibió una fila nueva. */
export function useUltimaActualizacionMetricas() {
  const [fecha, setFecha]     = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const sb = getSupabase()
        const resultados = await Promise.all(
          TABLAS.map(tabla =>
            sb.from(tabla)
              .select('created_at')
              .order('id', { ascending: false })
              .limit(1)
              .then(({ data }) => (data?.[0] as { created_at: string } | undefined)?.created_at ?? null)
          )
        )
        if (cancelled) return
        const masReciente = resultados
          .filter((v): v is string => v != null)
          .sort()
          .at(-1) ?? null
        setFecha(masReciente)
      } catch { /* silent */ } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return { fecha, loading }
}
