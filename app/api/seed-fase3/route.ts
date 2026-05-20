/**
 * One-time seed route for Fase 3 indicators.
 * Creates catalog entries, fuentes, and pipeline config
 * so that sinca-sync and mercadopublico-sync can write data.
 *
 * POST /api/seed-fase3 with Authorization: Bearer <CRON_SECRET>
 * Safe to call multiple times (uses upsert / ON CONFLICT patterns).
 */

import { NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { isAuthorizedSync } from '@/lib/syncHelper'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  if (!isAuthorizedSync(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = getSupabaseAdmin()
  const log: string[] = []

  // 1. Insert fuentes
  const fuentes = [
    { codigo: 'SINCA_MMA', nombre: 'Sistema de Información Nacional de Calidad del Aire', institucion: 'Ministerio del Medio Ambiente', url_base: 'https://sinca.mma.gob.cl' },
    { codigo: 'CHILECOMPRA', nombre: 'Mercado Público / ChileCompra', institucion: 'Dirección ChileCompra', url_base: 'https://www.mercadopublico.cl' },
  ]

  for (const f of fuentes) {
    const { data: existing } = await sb.from('v2_fuentes').select('id').eq('codigo', f.codigo).single()
    if (existing) {
      log.push(`fuente ${f.codigo}: ya existe (id=${existing.id})`)
    } else {
      const { error } = await sb.from('v2_fuentes').insert(f)
      if (error) log.push(`fuente ${f.codigo}: ERROR ${error.message}`)
      else log.push(`fuente ${f.codigo}: creada`)
    }
  }

  // 2. Get ALL fuente IDs (including pre-existing ones like BCCH_CCNN)
  const { data: allFuenteRows } = await sb.from('v2_fuentes').select('id, codigo')
  const fuenteMap = new Map<string, number>()
  for (const f of allFuenteRows ?? []) fuenteMap.set(f.codigo, f.id)

  // 3. Insert catalog entries
  const indicadores = [
    { codigo: 'AMB_MP25', nombre: 'Material particulado PM2.5 (promedio regional)', categoria: 'Ambiente', unidad: 'µg/m³', fuente_id: fuenteMap.get('SINCA_MMA'), frecuencia_esperada: 'diario', lower_is_better: true, nivel_criticidad: 'esencial' },
    { codigo: 'AMB_MP10', nombre: 'Material particulado PM10 (promedio regional)', categoria: 'Ambiente', unidad: 'µg/m³', fuente_id: fuenteMap.get('SINCA_MMA'), frecuencia_esperada: 'diario', lower_is_better: true, nivel_criticidad: 'complementario' },
    { codigo: 'ECO_COMPRAS_PUB', nombre: 'Compras públicas adjudicadas', categoria: 'Economía', unidad: 'MM CLP', fuente_id: fuenteMap.get('CHILECOMPRA'), frecuencia_esperada: 'anual', lower_is_better: false, nivel_criticidad: 'complementario' },
    { codigo: 'ECO_PIB_ANUAL', nombre: 'PIB regional (anual)', categoria: 'Economía', unidad: 'MM CLP enc. 2018', fuente_id: fuenteMap.get('BCCH_CCNN'), frecuencia_esperada: 'anual', lower_is_better: false, nivel_criticidad: 'esencial' },
  ]

  for (const ind of indicadores) {
    const { data: existing } = await sb.from('v2_indicadores_catalogo').select('codigo').eq('codigo', ind.codigo).single()
    if (existing) {
      log.push(`catalogo ${ind.codigo}: ya existe`)
    } else {
      const { error } = await sb.from('v2_indicadores_catalogo').insert(ind)
      if (error) log.push(`catalogo ${ind.codigo}: ERROR ${error.message}`)
      else log.push(`catalogo ${ind.codigo}: creado`)
    }
  }

  // 4. Insert pipeline config
  const pipelines = [
    { codigo_indicador: 'AMB_MP25', metodo: 'api_rest', cron_schedule: '0 6 * * *' },
    { codigo_indicador: 'AMB_MP10', metodo: 'api_rest', cron_schedule: '0 6 * * *' },
    { codigo_indicador: 'ECO_COMPRAS_PUB', metodo: 'descarga', cron_schedule: '0 15 5 1,7 *' },
    { codigo_indicador: 'ECO_PIB_ANUAL', metodo: 'api_rest', cron_schedule: '0 7 * * 1' },
  ]

  for (const p of pipelines) {
    const { data: existing } = await sb.from('v2_indicadores_pipeline').select('id').eq('codigo_indicador', p.codigo_indicador).single()
    if (existing) {
      log.push(`pipeline ${p.codigo_indicador}: ya existe`)
    } else {
      const { error } = await sb.from('v2_indicadores_pipeline').insert(p)
      if (error) log.push(`pipeline ${p.codigo_indicador}: ERROR ${error.message}`)
      else log.push(`pipeline ${p.codigo_indicador}: creado`)
    }
  }

  return Response.json({ ok: true, log })
}
