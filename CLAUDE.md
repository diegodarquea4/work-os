# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev        # Start dev server (localhost:3000)
npm run build      # Type-check + production build
npm run lint       # ESLint (eslint.config.mjs, Next.js ruleset)
npm test           # vitest run (suite mínima en __tests__/)
npm run test:watch # vitest en watch
```

Validate changes with `npm run build` + `npm test`. La suite cubre los puntos frágiles (mapRow defaults, lib/dbWrite.ts helpers defensivos, schemas zod). NO buscar cobertura — buscar dolor.

## Architecture

Work OS is a **Next.js 16.2.1 App Router** application for the División de Coordinación Interministerial (DCI) of Chile's Ministry of Interior. La tabla `prioridades_territoriales` está pensada para escalar a miles de iniciativas (el seed inicial fue 63).

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

## Escrituras desde el cliente — patrón defensivo

**Invariante crítico (post bug 29-may-2026)**: Supabase devuelve `HTTP 200` con `data: []` cuando RLS bloquea una mutación. Sin chequear `data.length` el cliente cree éxito y diverge del servidor. **Toda mutación desde browser DEBE usar los helpers de `lib/dbWrite.ts`**:

- `safeWrite(builder, ctx)` — UPDATE / INSERT estrictos. Throw si `data.length === 0`.
- `safeDelete(builder, ctx)` — DELETE idempotente. Throw solo con error explícito.
- `safeAuditWrite(builder, ctx)` — audit logs (`semaforo_log`, `desalojo_log`). No throw — solo warning si falla.

Patrón en call-site: optimistic update local → try { await safeWrite(...) } catch { revert optimistic + window.alert(err.message) }. Sin UX nueva — usar `window.alert` donde ya se usa.

## RLS por rol (etapa 2 de consolidación backend)

**Matriz vigente** (migración 023 + 026, función `current_user_role()` + triggers):

- `prioridades_territoriales`: UPDATE admin/editor (cualquier columna), regional solo columnas operativas (semáforo, pct_avance, responsable, en_foco, etapa, hito). INSERT/DELETE: admin/editor.
- `seguimientos`, `documentos_prioridad`: INSERT cualquier autenticado (mig 026 — **incluido viewer**). UPDATE/DELETE: autor O admin/editor.
- `metricas_eje`: definición admin/editor. `valor_actual` admin/editor + regional dentro de sus `region_cods` (trigger).
- `region_ejes`, `prego_monitoreo`: admin/editor.
- `mop_projects`, `seia_projects`, `regional_metrics`: solo service role (los crons).
- viewer = solo lectura **salvo** Seguimientos/Documentos (puede crear, y editar/borrar lo suyo). `canEditOperational` en UserContext sigue excluyendo viewer del trio operativo de prioridades.

Las políticas SELECT NO se tocaron (riesgo de romper lecturas) — todas siguen world-readable a cualquier autenticado. Documentado como deuda menor.

**Storage policies** (mig 026):
- `project-docs` (bucket público, donde van los Documentos de iniciativas): SELECT any, INSERT cualquier autenticado, UPDATE admin/editor, DELETE owner (`storage.objects.owner = auth.uid()`) O admin/editor.
- `desalojos-docs` (bucket privado): admin-only (sin cambios).
- `plan-regional`, `import-proposals`: sin policies hoy → uploads desde browser fallarían. Deuda: abrir si aparece reporte.

## Verificación en dos pasos (2FA / TOTP)

**Obligatoria para todos** (decisión Diego 2026-08-06). Usa la MFA nativa de
`@supabase/auth-js` (`supabase.auth.mfa.*`) con factor **TOTP** (app
autenticadora). **Sin migración**: los factores viven en `auth.mfa_factors`
(GoTrue). Lógica pura testeable en `lib/mfa.ts` (`mfaState`, `decodeAal`).

Estado por sesión = claim `aal` del JWT + si hay factor verificado:
- `aal2` → acceso pleno.
- `aal1` + factor verificado → **needs-challenge** (pide el código de 6 dígitos).
- `aal1` sin factor → **needs-enroll** (overlay bloqueante).

**Enforcement en dos capas:**
- `proxy.ts` (gate duro): decodifica `aal` del token ya validado por `getUser()`
  + lee `user.factors` (sin red extra). Una sesión `needs-challenge` se bloquea:
  páginas → redirect a `/login`; rutas `/api/*` → 401. Ojo: la redirección
  `user && isLoginPage → '/'` está condicionada a `!needsChallenge` (un
  aal1-con-factor debe poder quedarse en `/login` a verificar — si no, loop).
- `WorkOSApp` (cliente): si `getAuthenticatorAssuranceLevel().nextLevel === 'aal1'`
  (sin factor) muestra `<MfaEnrollModal>` bloqueante (patrón `CambiarClaveModal`
  'forzado'). Orden: cambio de clave forzado primero, 2FA después.

Login (`app/login/page.tsx`): máquina `password | mfa`. Tras `signInWithPassword`,
si `currentLevel==='aal1' && nextLevel==='aal2'` → paso del código
(`challengeAndVerify`). Al montar, si el proxy redirigió una sesión aal1-con-factor,
arranca directo en el paso `mfa`.

**Recuperación = reset por admin** (no hay códigos de respaldo). Panel Usuarios
→ botón "Resetear 2FA" → `PATCH /api/admin/users/[id]` con `resetear_2fa:true` →
`auth.admin.mfa.deleteFactor` por factor + cierre de sesiones. El listado
(`GET /api/admin/users`) trae `mfa_activo` por fila (badge Activo/Pendiente).

**Break-glass** (admin sin su autenticador y sin otro admin que lo resetee):
borrar su factor vía service-role — `DELETE FROM auth.mfa_factors WHERE user_id = '<uuid>'`
(por Supabase MCP/SQL). Recupera el acceso en el próximo login (queda needs-enroll).

**Deuda / fase 2 (diferida):** el enforcement v1 es a nivel de app. Endurecer
exigiendo `auth.jwt()->>'aal' = 'aal2'` en las policies RLS de escritura queda
para después (toca todas las policies desde mig 023 y solo puede activarse con
el 100% enrolado, si no lockout masivo).

## Llave estable de mutación (etapa 5)

`prioridades_territoriales.id` (PK, UNIQUE BTREE) es la llave de escritura. `n` se mantiene como número de orden de negocio pero NO es UNIQUE — usarlo como llave de write puede afectar múltiples filas. **Todas las mutaciones nuevas deben usar `.eq('id', prioridad.id)`** (no `.eq('n', ...)`).

FKs lógicas existentes (`seguimientos.prioridad_id`, `documentos_prioridad.prioridad_id`, `semaforo_log.prioridad_id`) siguen apuntando a `n` — migrarlas a id requiere backfill y queda como deuda separada.

## Validación de input con zod (etapa 4)

Las rutas que reciben body JSON usan schemas en `lib/schemas/index.ts`. Patrón:

```ts
const parse = someSchema.safeParse(await request.json())
if (!parse.success) {
  return NextResponse.json({ error: 'Solicitud inválida', detalle: parse.error.issues }, { status: 400 })
}
const body = parse.data
```

Schemas activos hoy: `carteraPdfSchema`, `minutaPostSchema`, `adminUsersPostSchema`, `desalojoDetallePatchSchema`. Las otras rutas con validación custom sólida (resto de desalojos, proposals, plan-regional) están pendientes de refactor a zod — no es urgente.

## Key data model

Two separate region tables:
- `region_metrics` — **wide format**, 16 rows × ~90 static columns (context: demographics, poverty, employment, health, etc.)
- `regional_metrics` — **long format** (region_id, metric_name, value, period), time-series data synced from BCCh API

`regional_metrics` region_id mapping lives in `lib/regions.ts` → `INE_CODE`. Use `region_id = 0` (code `NAC`) for national-level series stored alongside regional data.

**Critical:** check `regionId === undefined`, not `!regionId` — `region_id = 0` is valid and falsy.

## v2 — Estado (junio 2026)

**v2 está congelado como "solo indicadores".** El cutover completo (que la migración 001_v2_schema.sql anunciaba como Fase 5) nunca se hizo y no se va a hacer — mantener ambos modelos a medias era la fuente principal de confusión.

- **Vivo en v2**: `v2_indicadores_*` (catálogo, valores, pipeline, log), `v2_fuentes`, `v2_regiones`, `v2_proyectos_inversion`, `v2_seguridad_semanal`.
- **Eliminadas (mig 025)**: `v2_iniciativas`, `v2_iniciativas_seguimiento`, `v2_iniciativas_documentos`, `v2_iniciativas_semaforo_log`. Eran huérfanas (0 consumidores TS).
- **Canon (v1, NO migrar)**: `prioridades_territoriales`, `region_metrics`, `regional_metrics`, todo lo de iniciativas/minutas/RLS por rol.

**Observabilidad unificada**: `/api/health` lee `sync_status` **Y** `v2_indicadores_pipeline`. Para v1 devuelve `atrasados[]` + `con_errores[]` (mismo formato de siempre). Para v2 devuelve `indicadores_v2: { activos, con_data, error, parcial, never, stale }` + `indicadores_v2_problemas[]` (lista por indicador con `motivo` y `dias_desde`). Stale se calcula **por fila** usando la columna `tolerancia_atraso_dias` del catálogo, NO agrupando por `fuente_endpoint` (que en prod es URL/descriptor, no nombre de sync). El estado `'never'` cuenta pero no dispara `ok=false` (es backlog, no falla). Si la query a v2 falla se propaga vía `indicadores_v2_query_error` y baja `ok` (antes era silencioso). Webhook opcional vía `ALERT_WEBHOOK_URL`. Los syncs que upsertan inline a `v2_indicadores_valores` (ine, pib, external) deben llamar `updateV2Pipeline()` de `lib/syncHelper.ts` para no aparecer como "nunca corrió" en `/admin/pipeline`.

**Crons**: en `.github/workflows/cron-syncs.yml` (no en `vercel.json` — Vercel Hobby solo permite 2 crons). `BASE_URL = work-os-theta.vercel.app`, `Authorization: Bearer $CRON_SECRET`. Si falta el secret, el step termina con `exit 1`.

**Telemetría en serverless**: todas las escrituras a `sync_status`, `v2_indicadores_pipeline*`, `refresh_v2_indicadores_ultimo` van con `await`. Pre-O-04 eran `.then(() => {})` y la función podía congelarse tras `Response` y perderlas (síntoma: SEIA 53 días de silencio en mayo 2026).

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

**Crons:** MOP lunes 09:00 UTC (`.github/workflows/cron-syncs.yml`). **SEIA ya no tiene cron** — pasó a refresco on-demand por botón (ver «SEIA on-demand» abajo).

**Observabilidad:** ambos handlers escriben a `sync_status` al terminar (`lib/syncStatus.ts:recordSyncStatus`). Etapa 3 de la consolidación backend extendió esto a los 11 syncs restantes vía wrapper `withSyncStatus(name, runSync)` en `lib/syncRunner.ts`. Endpoint de monitoreo: `GET /api/health` (con bearer) devuelve atrasados + con_errores. Cron diario 06:00 UTC.

Si `process.env.ALERT_WEBHOOK_URL` está definida y hay algo malo, `/api/health` postea resumen JSON al webhook (formato Slack/Discord compatible). Degradación elegante: sin la variable, solo loguea.

Una query revela el estado de todos los syncs:
```sql
SELECT name, last_run_at, last_status, last_rows, last_error_count
FROM sync_status ORDER BY last_run_at DESC;
```

**Trigger manual:** MOP: `POST /api/mop-sync` con `Authorization: Bearer <CRON_SECRET>`. SEIA: botón «Actualizar proyectos en SEIA» del Comité de Inversión (o `POST /api/seia-sync-v2` con bearer).

**SEIA on-demand (v2 reanudable):** desde 2026-07-31 SEIA ya NO corre por cron. Se actualiza con el botón **«Actualizar proyectos en SEIA»** del Comité Seguimiento de la Inversión → `/api/seia-sync/trigger` (admin/editor, inyecta el bearer server-side) → `/api/seia-sync-v2`. La v2 trocea de forma **reanudable** (cursor en `sync_status.notes`, name `seia-v2`): corta limpio a 240s y devuelve `partial` + `next_cursor.region_idx` si queda a medias; el frontend (`ComiteInversionPanel`) **auto-continúa** hasta completar las 16 regiones (un click) y muestra barra de progreso + fecha de última actualización. Por eso `seia` salió de `EXPECTED_DAYS` en `/api/health` (sin cron que esperar). La v1 `/api/seia-sync` sigue existiendo pero ya no se usa (ni cron ni botón). El API de SEIA es flaky (timeout por página a 20s) → si alguna región queda sin refrescar, re-apretar la completa (upsert idempotente, id `seia_<EXPEDIENTE_ID>` sin duplicar).

## Environment variables

| Variable | Required in |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + server |
| `NEXT_PUBLIC_SUPABASE_ANON` | Client (browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only (API routes) |
| `CRON_SECRET` | Server only (sync POST auth + `/api/health`) |
| `BCCH_USER` / `BCCH_PASS` | Server only (ine-sync BCCh API) |
| `ALERT_WEBHOOK_URL` | Opcional. Si está, `/api/health` postea alertas (Slack/Discord) |

## Tailwind CSS v4

This project uses Tailwind v4, which differs significantly from v3. Config is in `postcss.config.mjs` (no `tailwind.config.js`). CSS variables and the `@theme` directive replace the v3 config object.
