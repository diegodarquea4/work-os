# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # Start dev server (localhost:3000)
npm run build    # Type-check + production build
npm run lint     # ESLint (eslint.config.mjs, Next.js ruleset)
```

No test suite exists. Validate changes with `npm run build`.

## Architecture

Work OS is a **Next.js 16.2.1 App Router** application for the División de Coordinación Interministerial (DCI) of Chile's Ministry of Interior. It tracks 63 territorial priorities across 16 regions.

**Entry point:** `app/page.tsx` is a Server Component that loads all priorities from Supabase at startup and passes them to `WorkOSApp` (client), which holds global state and renders 4 views: Mapa, Dashboard, Bandeja de Atención, Kanban.

**State propagation:** Priority mutations (semáforo, avance, responsable) call `onUpdatePrioridad(n, patch)` in `WorkOSApp`, which updates `localProjects` and propagates to all 4 views without a page reload.

**API routes** in `app/api/`:
- `metrics/[cod]/route.ts` — region context metrics (static `region_metrics` table)
- `minuta/route.ts` — generates PDF via @react-pdf/renderer
- `actividad/[cod]/route.ts` and `actividad/all/route.ts` — last activity timestamps
- `ine-sync/route.ts` — BCCh time-series sync (cron: Mondays 7am UTC)

## Supabase clients

Two clients — never mix them:
- `lib/supabase.ts` → `getSupabase()` — browser client, use in components and hooks
- `lib/supabaseServer.ts` → `getSupabaseAdmin()` — service role, use **only** in `app/api/**`

## Key data model

Two separate region tables:
- `region_metrics` — **wide format**, 16 rows × ~90 static columns (context: demographics, poverty, employment, health, etc.)
- `regional_metrics` — **long format** (region_id, metric_name, value, period), time-series data synced from BCCh API

`regional_metrics` region_id mapping lives in `lib/regions.ts` → `INE_CODE`. Use `region_id = 0` (code `NAC`) for national-level series stored alongside regional data.

**Critical:** check `regionId === undefined`, not `!regionId` — `region_id = 0` is valid and falsy.

## BCCh sync (`app/api/ine-sync/route.ts`)

Syncs regional unemployment and PIB series from BCCh REST API. One series per API call. Series IDs:
- Unemployment: `F049.DES.TAS.INE9.{CODE}.M` (monthly)
- PIB regional: `F035.PIB.FLU.R.CLP.2018.Z.Z.Z.{01-16}.0.T` (quarterly)
- National: IMACEC `F032.IMC.IND.Z.Z.EP18.Z.Z.0.M`, PIB `F032.PIB.FLU.R.CLP.EP18.Z.Z.0.T`

BCCh dates arrive as `DD-MM-YYYY` — `parseBcchDate()` converts to ISO.

Trigger manually: `POST /api/ine-sync` with `Authorization: Bearer <CRON_SECRET>`.

## SEIA / MOP sync (`app/api/seia-sync`, `app/api/mop-sync`)

Sincronizan proyectos externos del Sistema de Evaluación de Impacto Ambiental (SEIA) y del Ministerio de Obras Públicas (MOP). Pipelines totalmente distintos pero comparten patrón: 16 regiones, dual-write a `{seia,mop}_projects` (v1) + `v2_proyectos_inversion` (v2 unificada), `synced_at` por fila.

**SEIA** — POST a `https://seia.sea.gob.cl/busqueda/buscarProyectoResumenAction.php` (API interna no documentada). Response JSON en ISO-8859-1. Paginación 100/página, tarda ~340s en correr completo. **Requiere `export const maxDuration = 300`** — sin esto Vercel mata el handler a los ~60s y synced_at queda congelado sin avisar. Síntoma observado 2026-05-29: 53 días de silencio.

**MOP** — HTML scraping de `https://proyectos.mop.gob.cl` (sin API). Encoding ISO-8859-1 + entity decoding. Por región: lista + detalle de cada `cod_p` en batches de 5 paralelos. Tarda ~150s. También tiene `maxDuration = 300`.

**Crons:** lunes 08:00 UTC (SEIA) y 09:00 UTC (MOP) — `vercel.json`.

**Observabilidad:** ambos handlers escriben a `sync_status` al terminar (`lib/syncStatus.ts:recordSyncStatus`). Una query revela el estado de todos los syncs:
```sql
SELECT name, last_run_at, last_status, last_rows, last_error_count
FROM sync_status ORDER BY last_run_at DESC;
```

**Trigger manual:** `POST /api/{seia,mop}-sync` con `Authorization: Bearer <CRON_SECRET>`.

## Environment variables

| Variable | Required in |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + server |
| `NEXT_PUBLIC_SUPABASE_ANON` | Client (browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only (API routes) |
| `CRON_SECRET` | Server only (ine-sync POST auth) |
| `BCCH_USER` / `BCCH_PASS` | Server only (ine-sync BCCh API) |

## Tailwind CSS v4

This project uses Tailwind v4, which differs significantly from v3. Config is in `postcss.config.mjs` (no `tailwind.config.js`). CSS variables and the `@theme` directive replace the v3 config object.
