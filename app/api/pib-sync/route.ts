/**
 * BCCh regional PIB sectorial sync
 *
 * Fetches PIB by economic sector for all 16 regions and stores in regional_metrics.
 * Uses the same BCCh REST API and upsert pattern as ine-sync.
 *
 * metric_name format: "pib_sector_{sector_slug}"
 * e.g.: pib_sector_mineria, pib_sector_construccion, pib_sector_comercio
 *
 * Setup:
 *   1. Run GET /api/pib-discover to get series IDs
 *   2. Add them to SERIES_CONFIG below
 *   3. Trigger: POST /api/pib-sync (Authorization: Bearer <CRON_SECRET>)
 *              GET  /api/pib-sync (x-vercel-cron: 1)
 */

import { NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { INE_CODE } from '@/lib/regions'

export const dynamic    = 'force-dynamic'
export const runtime    = 'nodejs'
export const maxDuration = 300

const BCCH_API = 'https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx'

// ── Series configuration ─────────────────────────────────────────────────────
// Source: BCCh BDE — F035.PIB.FLU.N.CLP.2018 (nominal, annual, base 2018)
// 13 sectors × 16 regions = 208 series
// Derived from colleague's bce_datos_limpio.csv in manuelcarvallo97-tech/dashboard-regional-chile
const SERIES_CONFIG: { seriesId: string; metric: string; regionCod: string }[] = [
  // ── Agropecuario-silvícola ──
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.01.21.Z.01.0.A', metric: 'pib_sector_agropecuario', regionCod: 'I' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.01.Z.Z.02.0.A',  metric: 'pib_sector_agropecuario', regionCod: 'II' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.01.Z.Z.03.0.A',  metric: 'pib_sector_agropecuario', regionCod: 'III' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.01.Z.Z.04.0.A',  metric: 'pib_sector_agropecuario', regionCod: 'IV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.01.Z.Z.05.0.A',  metric: 'pib_sector_agropecuario', regionCod: 'V' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.01.Z.Z.06.0.A',  metric: 'pib_sector_agropecuario', regionCod: 'VI' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.01.Z.Z.07.0.A',  metric: 'pib_sector_agropecuario', regionCod: 'VII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.01.Z.Z.08.0.A',  metric: 'pib_sector_agropecuario', regionCod: 'VIII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.01.Z.Z.09.0.A',  metric: 'pib_sector_agropecuario', regionCod: 'IX' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.01.Z.Z.10.0.A',  metric: 'pib_sector_agropecuario', regionCod: 'X' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.01.Z.Z.11.0.A',  metric: 'pib_sector_agropecuario', regionCod: 'XI' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.01.Z.Z.12.0.A',  metric: 'pib_sector_agropecuario', regionCod: 'XII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.01.Z.Z.13.0.A',  metric: 'pib_sector_agropecuario', regionCod: 'RM' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.01.Z.Z.14.0.A',  metric: 'pib_sector_agropecuario', regionCod: 'XIV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.01.Z.Z.15.0.A',  metric: 'pib_sector_agropecuario', regionCod: 'XV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.01.Z.Z.16.0.A',  metric: 'pib_sector_agropecuario', regionCod: 'XVI' },
  // ── Pesca ──
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.02.04.Z.01.0.A', metric: 'pib_sector_pesca', regionCod: 'I' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.02.04.Z.02.0.A', metric: 'pib_sector_pesca', regionCod: 'II' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.02.04.Z.03.0.A', metric: 'pib_sector_pesca', regionCod: 'III' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.02.04.Z.04.0.A', metric: 'pib_sector_pesca', regionCod: 'IV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.02.04.Z.05.0.A', metric: 'pib_sector_pesca', regionCod: 'V' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.02.04.Z.06.0.A', metric: 'pib_sector_pesca', regionCod: 'VI' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.02.04.Z.07.0.A', metric: 'pib_sector_pesca', regionCod: 'VII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.02.04.Z.08.0.A', metric: 'pib_sector_pesca', regionCod: 'VIII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.02.04.Z.09.0.A', metric: 'pib_sector_pesca', regionCod: 'IX' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.02.04.Z.10.0.A', metric: 'pib_sector_pesca', regionCod: 'X' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.02.04.Z.11.0.A', metric: 'pib_sector_pesca', regionCod: 'XI' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.02.04.Z.12.0.A', metric: 'pib_sector_pesca', regionCod: 'XII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.02.04.Z.13.0.A', metric: 'pib_sector_pesca', regionCod: 'RM' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.02.04.Z.14.0.A', metric: 'pib_sector_pesca', regionCod: 'XIV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.02.04.Z.15.0.A', metric: 'pib_sector_pesca', regionCod: 'XV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.02.04.Z.16.0.A', metric: 'pib_sector_pesca', regionCod: 'XVI' },
  // ── Minería ──
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.03.21.Z.01.0.A', metric: 'pib_sector_mineria', regionCod: 'I' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.03.Z.Z.02.0.A',  metric: 'pib_sector_mineria', regionCod: 'II' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.03.Z.Z.03.0.A',  metric: 'pib_sector_mineria', regionCod: 'III' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.03.Z.Z.04.0.A',  metric: 'pib_sector_mineria', regionCod: 'IV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.03.Z.Z.05.0.A',  metric: 'pib_sector_mineria', regionCod: 'V' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.03.Z.Z.06.0.A',  metric: 'pib_sector_mineria', regionCod: 'VI' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.03.Z.Z.07.0.A',  metric: 'pib_sector_mineria', regionCod: 'VII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.03.Z.Z.08.0.A',  metric: 'pib_sector_mineria', regionCod: 'VIII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.03.Z.Z.09.0.A',  metric: 'pib_sector_mineria', regionCod: 'IX' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.03.Z.Z.10.0.A',  metric: 'pib_sector_mineria', regionCod: 'X' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.03.Z.Z.11.0.A',  metric: 'pib_sector_mineria', regionCod: 'XI' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.03.Z.Z.12.0.A',  metric: 'pib_sector_mineria', regionCod: 'XII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.03.Z.Z.13.0.A',  metric: 'pib_sector_mineria', regionCod: 'RM' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.03.Z.Z.14.0.A',  metric: 'pib_sector_mineria', regionCod: 'XIV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.03.Z.Z.15.0.A',  metric: 'pib_sector_mineria', regionCod: 'XV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.03.Z.Z.16.0.A',  metric: 'pib_sector_mineria', regionCod: 'XVI' },
  // ── Industria manufacturera ──
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.04.21.Z.01.0.A', metric: 'pib_sector_industria', regionCod: 'I' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.04.Z.Z.02.0.A',  metric: 'pib_sector_industria', regionCod: 'II' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.04.Z.Z.03.0.A',  metric: 'pib_sector_industria', regionCod: 'III' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.04.Z.Z.04.0.A',  metric: 'pib_sector_industria', regionCod: 'IV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.04.Z.Z.05.0.A',  metric: 'pib_sector_industria', regionCod: 'V' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.04.Z.Z.06.0.A',  metric: 'pib_sector_industria', regionCod: 'VI' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.04.Z.Z.07.0.A',  metric: 'pib_sector_industria', regionCod: 'VII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.04.Z.Z.08.0.A',  metric: 'pib_sector_industria', regionCod: 'VIII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.04.Z.Z.09.0.A',  metric: 'pib_sector_industria', regionCod: 'IX' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.04.Z.Z.10.0.A',  metric: 'pib_sector_industria', regionCod: 'X' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.04.Z.Z.11.0.A',  metric: 'pib_sector_industria', regionCod: 'XI' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.04.Z.Z.12.0.A',  metric: 'pib_sector_industria', regionCod: 'XII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.04.Z.Z.13.0.A',  metric: 'pib_sector_industria', regionCod: 'RM' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.04.Z.Z.14.0.A',  metric: 'pib_sector_industria', regionCod: 'XIV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.04.Z.Z.15.0.A',  metric: 'pib_sector_industria', regionCod: 'XV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.04.Z.Z.16.0.A',  metric: 'pib_sector_industria', regionCod: 'XVI' },
  // ── Electricidad, gas y agua ──
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.05.21.Z.01.0.A', metric: 'pib_sector_electricidad', regionCod: 'I' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.05.Z.Z.02.0.A',  metric: 'pib_sector_electricidad', regionCod: 'II' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.05.Z.Z.03.0.A',  metric: 'pib_sector_electricidad', regionCod: 'III' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.05.Z.Z.04.0.A',  metric: 'pib_sector_electricidad', regionCod: 'IV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.05.Z.Z.05.0.A',  metric: 'pib_sector_electricidad', regionCod: 'V' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.05.Z.Z.06.0.A',  metric: 'pib_sector_electricidad', regionCod: 'VI' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.05.Z.Z.07.0.A',  metric: 'pib_sector_electricidad', regionCod: 'VII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.05.Z.Z.08.0.A',  metric: 'pib_sector_electricidad', regionCod: 'VIII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.05.Z.Z.09.0.A',  metric: 'pib_sector_electricidad', regionCod: 'IX' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.05.Z.Z.10.0.A',  metric: 'pib_sector_electricidad', regionCod: 'X' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.05.Z.Z.11.0.A',  metric: 'pib_sector_electricidad', regionCod: 'XI' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.05.Z.Z.12.0.A',  metric: 'pib_sector_electricidad', regionCod: 'XII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.05.Z.Z.13.0.A',  metric: 'pib_sector_electricidad', regionCod: 'RM' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.05.Z.Z.14.0.A',  metric: 'pib_sector_electricidad', regionCod: 'XIV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.05.Z.Z.15.0.A',  metric: 'pib_sector_electricidad', regionCod: 'XV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.05.Z.Z.16.0.A',  metric: 'pib_sector_electricidad', regionCod: 'XVI' },
  // ── Construcción ──
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.06.21.Z.01.0.A', metric: 'pib_sector_construccion', regionCod: 'I' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.06.Z.Z.02.0.A',  metric: 'pib_sector_construccion', regionCod: 'II' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.06.Z.Z.03.0.A',  metric: 'pib_sector_construccion', regionCod: 'III' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.06.Z.Z.04.0.A',  metric: 'pib_sector_construccion', regionCod: 'IV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.06.Z.Z.05.0.A',  metric: 'pib_sector_construccion', regionCod: 'V' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.06.Z.Z.06.0.A',  metric: 'pib_sector_construccion', regionCod: 'VI' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.06.Z.Z.07.0.A',  metric: 'pib_sector_construccion', regionCod: 'VII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.06.Z.Z.08.0.A',  metric: 'pib_sector_construccion', regionCod: 'VIII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.06.Z.Z.09.0.A',  metric: 'pib_sector_construccion', regionCod: 'IX' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.06.Z.Z.10.0.A',  metric: 'pib_sector_construccion', regionCod: 'X' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.06.Z.Z.11.0.A',  metric: 'pib_sector_construccion', regionCod: 'XI' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.06.Z.Z.12.0.A',  metric: 'pib_sector_construccion', regionCod: 'XII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.06.Z.Z.13.0.A',  metric: 'pib_sector_construccion', regionCod: 'RM' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.06.Z.Z.14.0.A',  metric: 'pib_sector_construccion', regionCod: 'XIV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.06.Z.Z.15.0.A',  metric: 'pib_sector_construccion', regionCod: 'XV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.06.Z.Z.16.0.A',  metric: 'pib_sector_construccion', regionCod: 'XVI' },
  // ── Transportes y comunicaciones ──
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.08.Z.Z.01.0.A',  metric: 'pib_sector_transporte', regionCod: 'I' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.08.Z.Z.02.0.A',  metric: 'pib_sector_transporte', regionCod: 'II' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.08.Z.Z.03.0.A',  metric: 'pib_sector_transporte', regionCod: 'III' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.08.Z.Z.04.0.A',  metric: 'pib_sector_transporte', regionCod: 'IV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.08.Z.Z.05.0.A',  metric: 'pib_sector_transporte', regionCod: 'V' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.08.Z.Z.06.0.A',  metric: 'pib_sector_transporte', regionCod: 'VI' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.08.Z.Z.07.0.A',  metric: 'pib_sector_transporte', regionCod: 'VII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.08.Z.Z.08.0.A',  metric: 'pib_sector_transporte', regionCod: 'VIII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.08.Z.Z.09.0.A',  metric: 'pib_sector_transporte', regionCod: 'IX' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.08.Z.Z.10.0.A',  metric: 'pib_sector_transporte', regionCod: 'X' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.08.Z.Z.11.0.A',  metric: 'pib_sector_transporte', regionCod: 'XI' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.08.Z.Z.12.0.A',  metric: 'pib_sector_transporte', regionCod: 'XII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.08.Z.Z.13.0.A',  metric: 'pib_sector_transporte', regionCod: 'RM' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.08.Z.Z.14.0.A',  metric: 'pib_sector_transporte', regionCod: 'XIV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.08.Z.Z.15.0.A',  metric: 'pib_sector_transporte', regionCod: 'XV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.08.Z.Z.16.0.A',  metric: 'pib_sector_transporte', regionCod: 'XVI' },
  // ── Servicios financieros y empresariales ──
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.09.21.Z.01.0.A', metric: 'pib_sector_servicios_financieros', regionCod: 'I' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.09.21.Z.02.0.A', metric: 'pib_sector_servicios_financieros', regionCod: 'II' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.09.21.Z.03.0.A', metric: 'pib_sector_servicios_financieros', regionCod: 'III' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.09.21.Z.04.0.A', metric: 'pib_sector_servicios_financieros', regionCod: 'IV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.09.21.Z.05.0.A', metric: 'pib_sector_servicios_financieros', regionCod: 'V' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.09.21.Z.06.0.A', metric: 'pib_sector_servicios_financieros', regionCod: 'VI' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.09.21.Z.07.0.A', metric: 'pib_sector_servicios_financieros', regionCod: 'VII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.09.21.Z.08.0.A', metric: 'pib_sector_servicios_financieros', regionCod: 'VIII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.09.21.Z.09.0.A', metric: 'pib_sector_servicios_financieros', regionCod: 'IX' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.09.21.Z.10.0.A', metric: 'pib_sector_servicios_financieros', regionCod: 'X' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.09.21.Z.11.0.A', metric: 'pib_sector_servicios_financieros', regionCod: 'XI' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.09.21.Z.12.0.A', metric: 'pib_sector_servicios_financieros', regionCod: 'XII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.09.21.Z.13.0.A', metric: 'pib_sector_servicios_financieros', regionCod: 'RM' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.09.21.Z.14.0.A', metric: 'pib_sector_servicios_financieros', regionCod: 'XIV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.09.21.Z.15.0.A', metric: 'pib_sector_servicios_financieros', regionCod: 'XV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.09.21.Z.16.0.A', metric: 'pib_sector_servicios_financieros', regionCod: 'XVI' },
  // ── Propiedad de vivienda ──
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.10.Z.Z.01.0.A',  metric: 'pib_sector_vivienda', regionCod: 'I' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.10.Z.Z.02.0.A',  metric: 'pib_sector_vivienda', regionCod: 'II' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.10.Z.Z.03.0.A',  metric: 'pib_sector_vivienda', regionCod: 'III' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.10.Z.Z.04.0.A',  metric: 'pib_sector_vivienda', regionCod: 'IV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.10.Z.Z.05.0.A',  metric: 'pib_sector_vivienda', regionCod: 'V' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.10.Z.Z.06.0.A',  metric: 'pib_sector_vivienda', regionCod: 'VI' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.10.Z.Z.07.0.A',  metric: 'pib_sector_vivienda', regionCod: 'VII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.10.Z.Z.08.0.A',  metric: 'pib_sector_vivienda', regionCod: 'VIII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.10.Z.Z.09.0.A',  metric: 'pib_sector_vivienda', regionCod: 'IX' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.10.Z.Z.10.0.A',  metric: 'pib_sector_vivienda', regionCod: 'X' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.10.Z.Z.11.0.A',  metric: 'pib_sector_vivienda', regionCod: 'XI' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.10.Z.Z.12.0.A',  metric: 'pib_sector_vivienda', regionCod: 'XII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.10.Z.Z.13.0.A',  metric: 'pib_sector_vivienda', regionCod: 'RM' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.10.Z.Z.14.0.A',  metric: 'pib_sector_vivienda', regionCod: 'XIV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.10.Z.Z.15.0.A',  metric: 'pib_sector_vivienda', regionCod: 'XV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.10.Z.Z.16.0.A',  metric: 'pib_sector_vivienda', regionCod: 'XVI' },
  // ── Servicios personales ──
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.11.Z.Z.01.0.A',  metric: 'pib_sector_servicios_personales', regionCod: 'I' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.11.Z.Z.02.0.A',  metric: 'pib_sector_servicios_personales', regionCod: 'II' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.11.Z.Z.03.0.A',  metric: 'pib_sector_servicios_personales', regionCod: 'III' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.11.Z.Z.04.0.A',  metric: 'pib_sector_servicios_personales', regionCod: 'IV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.11.Z.Z.05.0.A',  metric: 'pib_sector_servicios_personales', regionCod: 'V' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.11.Z.Z.06.0.A',  metric: 'pib_sector_servicios_personales', regionCod: 'VI' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.11.Z.Z.07.0.A',  metric: 'pib_sector_servicios_personales', regionCod: 'VII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.11.Z.Z.08.0.A',  metric: 'pib_sector_servicios_personales', regionCod: 'VIII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.11.Z.Z.09.0.A',  metric: 'pib_sector_servicios_personales', regionCod: 'IX' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.11.Z.Z.10.0.A',  metric: 'pib_sector_servicios_personales', regionCod: 'X' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.11.Z.Z.11.0.A',  metric: 'pib_sector_servicios_personales', regionCod: 'XI' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.11.Z.Z.12.0.A',  metric: 'pib_sector_servicios_personales', regionCod: 'XII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.11.Z.Z.13.0.A',  metric: 'pib_sector_servicios_personales', regionCod: 'RM' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.11.Z.Z.14.0.A',  metric: 'pib_sector_servicios_personales', regionCod: 'XIV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.11.Z.Z.15.0.A',  metric: 'pib_sector_servicios_personales', regionCod: 'XV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.11.Z.Z.16.0.A',  metric: 'pib_sector_servicios_personales', regionCod: 'XVI' },
  // ── Administración pública ──
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.12.21.Z.01.0.A', metric: 'pib_sector_administracion_publica', regionCod: 'I' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.12.Z.Z.02.0.A',  metric: 'pib_sector_administracion_publica', regionCod: 'II' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.12.Z.Z.03.0.A',  metric: 'pib_sector_administracion_publica', regionCod: 'III' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.12.Z.Z.04.0.A',  metric: 'pib_sector_administracion_publica', regionCod: 'IV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.12.Z.Z.05.0.A',  metric: 'pib_sector_administracion_publica', regionCod: 'V' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.12.Z.Z.06.0.A',  metric: 'pib_sector_administracion_publica', regionCod: 'VI' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.12.Z.Z.07.0.A',  metric: 'pib_sector_administracion_publica', regionCod: 'VII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.12.Z.Z.08.0.A',  metric: 'pib_sector_administracion_publica', regionCod: 'VIII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.12.Z.Z.09.0.A',  metric: 'pib_sector_administracion_publica', regionCod: 'IX' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.12.Z.Z.10.0.A',  metric: 'pib_sector_administracion_publica', regionCod: 'X' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.12.Z.Z.11.0.A',  metric: 'pib_sector_administracion_publica', regionCod: 'XI' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.12.Z.Z.12.0.A',  metric: 'pib_sector_administracion_publica', regionCod: 'XII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.12.Z.Z.13.0.A',  metric: 'pib_sector_administracion_publica', regionCod: 'RM' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.12.Z.Z.14.0.A',  metric: 'pib_sector_administracion_publica', regionCod: 'XIV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.12.Z.Z.15.0.A',  metric: 'pib_sector_administracion_publica', regionCod: 'XV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.12.Z.Z.16.0.A',  metric: 'pib_sector_administracion_publica', regionCod: 'XVI' },
  // ── Comercio ──
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.COM.21.Z.01.0.A', metric: 'pib_sector_comercio', regionCod: 'I' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.COM.Z.Z.02.0.A',  metric: 'pib_sector_comercio', regionCod: 'II' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.COM.Z.Z.03.0.A',  metric: 'pib_sector_comercio', regionCod: 'III' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.COM.Z.Z.04.0.A',  metric: 'pib_sector_comercio', regionCod: 'IV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.COM.Z.Z.05.0.A',  metric: 'pib_sector_comercio', regionCod: 'V' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.COM.Z.Z.06.0.A',  metric: 'pib_sector_comercio', regionCod: 'VI' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.COM.Z.Z.07.0.A',  metric: 'pib_sector_comercio', regionCod: 'VII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.COM.Z.Z.08.0.A',  metric: 'pib_sector_comercio', regionCod: 'VIII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.COM.Z.Z.09.0.A',  metric: 'pib_sector_comercio', regionCod: 'IX' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.COM.Z.Z.10.0.A',  metric: 'pib_sector_comercio', regionCod: 'X' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.COM.Z.Z.11.0.A',  metric: 'pib_sector_comercio', regionCod: 'XI' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.COM.Z.Z.12.0.A',  metric: 'pib_sector_comercio', regionCod: 'XII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.COM.Z.Z.13.0.A',  metric: 'pib_sector_comercio', regionCod: 'RM' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.COM.Z.Z.14.0.A',  metric: 'pib_sector_comercio', regionCod: 'XIV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.COM.Z.Z.15.0.A',  metric: 'pib_sector_comercio', regionCod: 'XV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.COM.Z.Z.16.0.A',  metric: 'pib_sector_comercio', regionCod: 'XVI' },
  // ── Restaurantes y hoteles ──
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.RH.21.Z.01.0.A',  metric: 'pib_sector_restaurantes_hoteles', regionCod: 'I' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.RH.Z.Z.02.0.A',   metric: 'pib_sector_restaurantes_hoteles', regionCod: 'II' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.RH.Z.Z.03.0.A',   metric: 'pib_sector_restaurantes_hoteles', regionCod: 'III' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.RH.Z.Z.04.0.A',   metric: 'pib_sector_restaurantes_hoteles', regionCod: 'IV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.RH.Z.Z.05.0.A',   metric: 'pib_sector_restaurantes_hoteles', regionCod: 'V' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.RH.Z.Z.06.0.A',   metric: 'pib_sector_restaurantes_hoteles', regionCod: 'VI' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.RH.Z.Z.07.0.A',   metric: 'pib_sector_restaurantes_hoteles', regionCod: 'VII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.RH.Z.Z.08.0.A',   metric: 'pib_sector_restaurantes_hoteles', regionCod: 'VIII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.RH.Z.Z.09.0.A',   metric: 'pib_sector_restaurantes_hoteles', regionCod: 'IX' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.RH.Z.Z.10.0.A',   metric: 'pib_sector_restaurantes_hoteles', regionCod: 'X' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.RH.Z.Z.11.0.A',   metric: 'pib_sector_restaurantes_hoteles', regionCod: 'XI' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.RH.Z.Z.12.0.A',   metric: 'pib_sector_restaurantes_hoteles', regionCod: 'XII' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.RH.Z.Z.13.0.A',   metric: 'pib_sector_restaurantes_hoteles', regionCod: 'RM' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.RH.Z.Z.14.0.A',   metric: 'pib_sector_restaurantes_hoteles', regionCod: 'XIV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.RH.Z.Z.15.0.A',   metric: 'pib_sector_restaurantes_hoteles', regionCod: 'XV' },
  { seriesId: 'F035.PIB.FLU.N.CLP.2018.RH.Z.Z.16.0.A',   metric: 'pib_sector_restaurantes_hoteles', regionCod: 'XVI' },
]

// ── Handlers ─────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (request.headers.get('x-vercel-cron') !== '1') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runSync()
}

export async function POST(request: NextRequest) {
  const auth   = request.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runSync()
}

// ── Core sync ────────────────────────────────────────────────────────────────

async function runSync() {
  const user = process.env.BCCH_USER
  const pass = process.env.BCCH_PASS

  if (!user || !pass) {
    return Response.json({
      ok: false,
      error: 'Missing BCCH_USER or BCCH_PASS',
    }, { status: 503 })
  }

  if (SERIES_CONFIG.length === 0) {
    return Response.json({
      ok: false,
      error: 'SERIES_CONFIG is empty. Run GET /api/pib-discover first, then add series IDs to app/api/pib-sync/route.ts',
    }, { status: 503 })
  }

  const supabase  = getSupabaseAdmin()
  const firstdate = '2018-01-01'
  const lastdate  = new Date().toISOString().slice(0, 10)

  const rows: UpsertRow[] = []
  const errors: string[]  = []

  for (const config of SERIES_CONFIG) {
    const regionId = INE_CODE[config.regionCod]
    if (regionId === undefined) {
      errors.push(`Unknown region cod: ${config.regionCod}`)
      continue
    }

    const url = `${BCCH_API}?user=${encodeURIComponent(user)}&pass=${encodeURIComponent(pass)}&timeseries=${config.seriesId}&firstdate=${firstdate}&lastdate=${lastdate}&type=json`

    let data: BcchResponse
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
      if (!res.ok) { errors.push(`${config.seriesId}: HTTP ${res.status}`); continue }
      data = await res.json() as BcchResponse
    } catch (err) {
      errors.push(`${config.seriesId}: ${err instanceof Error ? err.message : String(err)}`)
      continue
    }

    if (data.Codigo !== 0) {
      errors.push(`${config.seriesId}: BCCh error ${data.Codigo} — ${data.Descripcion}`)
      continue
    }

    for (const obs of data.Series?.Obs ?? []) {
      if (obs.statusCode !== 'OK' || !obs.value || obs.value === 'NaN') continue
      const value = parseFloat(obs.value)
      if (isNaN(value)) continue

      const period = parseBcchDate(obs.indexDateString)
      if (!period) continue

      rows.push({
        region_id:   regionId,
        metric_name: config.metric,
        value,
        period,
        source_url:  `${BCCH_API}?timeseries=${config.seriesId}`,
        updated_at:  new Date().toISOString(),
      })
    }
  }

  if (rows.length === 0) {
    return Response.json({ ok: false, errors, note: 'No data — check SERIES_CONFIG IDs' })
  }

  const { error: dbErr } = await supabase
    .from('regional_metrics')
    .upsert(rows, { onConflict: 'region_id,metric_name,period' })

  if (dbErr) {
    return Response.json({ ok: false, error: `Supabase upsert: ${dbErr.message}` }, { status: 500 })
  }

  return Response.json({
    ok: true,
    synced_at:  new Date().toISOString(),
    upserted:   rows.length,
    regions:    [...new Set(rows.map(r => r.region_id))].length,
    sectors:    [...new Set(rows.map(r => r.metric_name))],
    errors:     errors.length > 0 ? errors : undefined,
  })
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** BCCh dates arrive as "DD-MM-YYYY" → convert to ISO "YYYY-MM-DD" */
function parseBcchDate(raw: string): string | null {
  const m = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

// ── Types ────────────────────────────────────────────────────────────────────

type BcchResponse = {
  Codigo: number
  Descripcion: string
  Series?: {
    seriesId: string
    descripEsp: string
    Obs?: { indexDateString: string; value: string; statusCode: string }[]
  }
}

type UpsertRow = {
  region_id:   number
  metric_name: string
  value:       number
  period:      string
  source_url:  string
  updated_at:  string
}
