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

Work OS is a **Next.js 16.2.1 App Router** application for the División de Coordinación Interregional of Chile's Ministry of Interior. It tracks 63 territorial priorities across 16 regions.

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

## Comparison chart (`components/RegionComparisonModal.tsx`)

Opens from ProjectsPanel. Uses `useAllRegionsMetric` hook which queries `regional_metrics` for all 16 regions at once. Chart data is **wide format** (one row per period, region cods as columns) to align multi-region X axes. Excludes national (region_id > 0 filter).

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
