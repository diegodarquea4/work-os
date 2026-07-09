-- ============================================================================
-- 035_perf_rls_consolidate.sql
--
-- PERF (Tier 1): consolida las políticas SELECT redundantes en las tablas
-- calientes de lectura. Ataca dos advisors de Supabase que golpean el SELECT
-- masivo de prioridades_territoriales (6.833 filas en cada carga del panel):
--
--   - auth_rls_initplan: la política `read_authenticated` usa
--     `auth.uid() IS NOT NULL`, que Postgres re-evalúa POR FILA → costo O(n) de
--     RLS en cada lectura a escala.
--   - multiple_permissive_policies: cada tabla tiene 2–3 políticas permissive de
--     SELECT que se evalúan todas por fila y se OR-ean.
--
-- Cada tabla ya tiene una política `"Public read"` / `read_public` con
-- `USING (true)` (sin llamada a auth → costo cero). Como `true` cubre a todos los
-- roles, `read_authenticated` y `anon_read` son REDUNDANTES. Dropearlas deja UNA
-- sola política de SELECT (`true`): elimina el costo por-fila de RLS y ambos
-- lints, SIN cambiar quién puede leer.
--
-- NOTA (acceso anon): estas tablas siguen world-readable (incluye rol anon).
-- Es necesario HOY porque el SSR en app/page.tsx lee con el cliente browser sin
-- sesión (rol anon). Quitar el acceso anon (dropear "Public read" y dejar solo
-- lectura autenticada) se hará junto con el cambio del fetch server-side a un
-- cliente autenticado (Tier 2), para no romper la carga inicial del panel.
--
-- Idempotente (DROP POLICY IF EXISTS). No toca políticas de escritura.
-- ============================================================================

-- prioridades_territoriales: quedan "Public read" (true) + las de write por rol.
DROP POLICY IF EXISTS read_authenticated ON public.prioridades_territoriales;
DROP POLICY IF EXISTS anon_read          ON public.prioridades_territoriales;

-- seia_projects / mop_projects: solo lectura desde el panel; escritura = service role (syncs).
DROP POLICY IF EXISTS read_authenticated ON public.seia_projects;
DROP POLICY IF EXISTS read_authenticated ON public.mop_projects;

-- regional_metrics / region_metrics: idem.
DROP POLICY IF EXISTS read_authenticated ON public.regional_metrics;
DROP POLICY IF EXISTS read_authenticated ON public.region_metrics;

-- prego_monitoreo: quedan read_public (true) + prego_monitoreo_write_by_role.
DROP POLICY IF EXISTS read_authenticated ON public.prego_monitoreo;
