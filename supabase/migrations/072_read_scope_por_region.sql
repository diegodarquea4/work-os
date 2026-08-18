-- ============================================================================
-- 072_read_scope_por_region.sql   (Capas de usuarios — Fase 3b: LECTURA)
--
-- Cierra el último hueco de las Capas: hasta acá el enforcement era de ESCRITURA
-- (migs 065–071). Las policies SELECT seguían world-readable (USING(true)) y,
-- sobre todo, app/page.tsx cargaba las ~6.800 iniciativas de TODAS las regiones
-- y las mandaba al navegador de cada usuario; la UI solo las filtraba
-- cosméticamente. Un regional podía leer data de otras regiones inspeccionando
-- el payload o consultando directo. Esta migración scopea la LECTURA por región.
--
-- PRECONDICIÓN (Fase 3a, ya desplegada — commit cad25fa): el SSR ya NO lee con
-- el cliente anónimo sino con la sesión del usuario (getSupabaseServerRead), y
-- los reads de sistema (actividad/all, minuta) pasaron a service-role. Sin esa
-- precondición, endurecer estas policies dejaría el panel en blanco (el load
-- anónimo vería 0 filas). Aplicar SOLO con 3a viva.
--
-- Modelo (espejo de lib/desalojoAccess.ts + needsRegionFilter del cliente):
--   - admin / editor            → ven todo.
--   - usuario sin region_cods    → ve todo (viewer nacional; = needsRegionFilter
--                                  false en el cliente).
--   - regional / viewer filtrado → ven SOLO sus region_cods.
--   - anónimo / sin perfil       → no ve nada (auth.uid() null → fail-closed;
--                                  post-3a nada anónimo lee estas tablas).
--
-- Rollback trivial: volver cada policy a USING (true) restaura al instante.
-- ============================================================================

-- ── Helper único de visibilidad por región ──────────────────────────────────
-- SECURITY DEFINER para leer user_profiles saltándose su propia RLS; STABLE para
-- que PG lo evalúe una vez por (auth.uid(), region_cod) dentro de una query
-- (≤16 regiones → ≤16 evaluaciones aunque haya miles de filas). Service-role
-- BYPASSA RLS, así que ni siquiera entra acá.
CREATE OR REPLACE FUNCTION public.current_user_sees_region(region_cod text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid()
      AND (
        up.role IN ('admin', 'editor')
        OR up.region_cods IS NULL
        OR cardinality(up.region_cods) = 0
        OR region_cod = ANY(up.region_cods)
      )
  );
$$;

-- ── prioridades_territoriales (cod directo) ─────────────────────────────────
DROP POLICY IF EXISTS "Public read" ON public.prioridades_territoriales;
CREATE POLICY "Public read" ON public.prioridades_territoriales
  FOR SELECT
  USING (public.current_user_sees_region(cod));

-- ── region_metrics (region_cod directo) ─────────────────────────────────────
DROP POLICY IF EXISTS "Public read" ON public.region_metrics;
CREATE POLICY "Public read" ON public.region_metrics
  FOR SELECT
  USING (public.current_user_sees_region(region_cod));

-- ── seguimientos (via prioridad_id = prioridades_territoriales.n → .cod) ─────
-- Deuda conocida (CLAUDE.md): `n` no es UNIQUE → el EXISTS es levemente permisivo
-- si dos iniciativas comparten n. De-facto n es único; misma deuda que mig 064.
DROP POLICY IF EXISTS seguimientos_read ON public.seguimientos;
CREATE POLICY seguimientos_read ON public.seguimientos
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.prioridades_territoriales p
    WHERE p.n = seguimientos.prioridad_id
      AND public.current_user_sees_region(p.cod)));

-- ── documentos_prioridad (via prioridad_id = n → .cod) ──────────────────────
DROP POLICY IF EXISTS documentos_read ON public.documentos_prioridad;
CREATE POLICY documentos_read ON public.documentos_prioridad
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.prioridades_territoriales p
    WHERE p.n = documentos_prioridad.prioridad_id
      AND public.current_user_sees_region(p.cod)));
