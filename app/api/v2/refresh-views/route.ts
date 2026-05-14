/**
 * POST /api/v2/refresh-views
 *
 * Refreshes the v2_indicadores_ultimo materialized view.
 * Called after data ingestion (pipeline) or manually.
 *
 * Auth: Bearer token (CRON_SECRET) or Vercel Cron header.
 */

import { NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseServer'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // Auth: same pattern as ine-sync
  const isCron = request.headers.get('x-vercel-cron') === '1'
  const auth = request.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET

  if (!isCron && (!secret || auth !== `Bearer ${secret}`)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const start = Date.now()
  const sb = getSupabaseAdmin()

  // Refresh the materialized view
  const { error } = await sb.rpc('refresh_v2_indicadores_ultimo')

  if (error) {
    // Fallback: try raw SQL if the RPC doesn't exist yet
    const { error: sqlError } = await sb.from('v2_indicadores_ultimo').select('codigo_indicador').limit(0)
    if (sqlError) {
      return Response.json(
        { error: 'Materialized view does not exist yet. Run migrations first.' },
        { status: 500 },
      )
    }

    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({
    ok: true,
    duration_ms: Date.now() - start,
    refreshed_at: new Date().toISOString(),
  })
}
