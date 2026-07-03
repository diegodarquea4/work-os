# Onboarding — Sección de Métricas

Guía para trabajar la nueva sección de métricas en la branch **`metricas/nueva-seccion`**.

> **Regla de oro:** trabaja siempre sobre `metricas/nueva-seccion`. **Nunca** commitees ni pushees directo a `main`.

## 1. Contexto del proyecto

**Work OS** es una app **Next.js 16 (App Router)** para la División de Coordinación Interministerial (DCI) del Ministerio del Interior de Chile. Backend en **Supabase**.

Antes de escribir código, lee en la raíz:
- [`AGENTS.md`](../AGENTS.md) — esta versión de Next.js tiene breaking changes; consulta `node_modules/next/dist/docs/` antes de tocar rutas, componentes o config.
- [`CLAUDE.md`](../CLAUDE.md) — arquitectura, convenciones, clientes de Supabase, patrón de escrituras defensivas.

Ojo: es **Tailwind v4** (configurado en `postcss.config.mjs`, sin `tailwind.config.js`).

## 2. Puesta en marcha

```bash
git fetch origin
git checkout metricas/nueva-seccion
git pull origin metricas/nueva-seccion     # usa --rebase si ya tienes commits locales

cp .env.example .env.local                 # completa las claves (ver sección 3)
npm install
npm run dev                                # http://localhost:3000
```

## 3. Variables de entorno

Pídeselas a Diego por un canal seguro (1Password, no por chat). Para trabajar la sección bastan:

| Variable | Necesaria para |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente + servidor |
| `NEXT_PUBLIC_SUPABASE_ANON` | Cliente (browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo si corres las rutas `/api/**` en local |
| `ANTHROPIC_API_KEY` | Solo si tu sección toca minutas con IA |

`.env.local` está en `.gitignore` — nunca lo subas al repo.

## 4. Datos de métricas (ya cargados en producción)

Los datos que exportaste ya están en el Supabase de producción. **No los modifiques ni los recargues.** El schema está en [`supabase/migrations/031_metricas_import.sql`](../supabase/migrations/031_metricas_import.sql). Tablas:

| Tabla | Filas |
|---|---|
| `registros_bce` | 41.495 |
| `registros_leystop_delitos` | 10.752 |
| `registros_bcn` | 7.770 |
| `registros_bce_empleo` | 6.240 |
| `bce_catalogo` | 3.655 |
| `registros_leystop` | 399 |
| `leystop_semanas` | 185 |
| `regiones` | 16 |
| `casen_regiones` | 16 |
| `registros_adis` | 0 |

**Clientes de Supabase** (nunca los mezcles):
- `lib/supabase.ts` → `getSupabase()` — cliente browser, para componentes y hooks.
- `lib/supabaseServer.ts` → `getSupabaseAdmin()` — service role, **solo** en `app/api/**`.

Toda mutación desde el browser debe usar los helpers de `lib/dbWrite.ts` (`safeWrite`/`safeDelete`/`safeAuditWrite`) — ver el detalle en `CLAUDE.md`.

## 5. Flujo de git

```bash
git add -A
git commit -m "feat(metricas): descripción corta"
git push origin metricas/nueva-seccion      # nunca a main, nunca --force
```

- Commits pequeños y descriptivos.
- Cuando la sección esté lista, se abre un **Pull Request `metricas/nueva-seccion` → `main`** para revisión.
- Mantén la branch al día con main de vez en cuando: `git pull --rebase origin main`.

## 6. Antes de dar por terminado un cambio

```bash
npm run build      # type-check + build de producción
npm test           # vitest (suite mínima)
```

Si algo falla, no lo pushees hasta resolverlo.
