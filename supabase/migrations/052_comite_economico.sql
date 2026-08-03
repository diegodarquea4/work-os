-- ============================================================================
-- 052_comite_economico.sql
--
-- El comité de sesiones sin eje (instancia='inversion', mig 049) se renombra
-- en UI a "Comité Económico" y gana dos frentes de trabajo dentro de la misma
-- sesión: Mesa Empleo (indicador Meta Empleo + placeholder de Proyectos de
-- Inversión Pública) y Seguimiento de la Inversión (lo que ya existía:
-- oficios + proyectos tratados). El valor `instancia='inversion'` en BD NO
-- cambia — solo la etiqueta visible.
--
-- Meta Empleo sigue el mismo patrón que metricas_eje/sesion_valores (mig
-- 014/044): objetivo declarado + valor_actual acumulado, digitado por sesión
-- y sumado al cerrar (nunca editado directo — mismo trust model que
-- valor_actual en el resto del sistema).
--
-- Los compromisos de este comité ahora se etiquetan con `seccion` (a cuál de
-- los dos frentes pertenecen, o 'general' si no es de ninguno) y opcionalmente
-- `proyecto_id` para trazabilidad. Ambas columnas quedan NULL para
-- compromisos de Comité Policial/Gabinete — el requerimiento de digitar
-- `seccion` para instancia='inversion' se exige en la app, no en el CHECK
-- (mismo criterio que otros campos condicionales de esta tabla).
-- ============================================================================

-- ── 1. region_meta_empleo — meta + acumulado por región ──────────────────────
-- Mismo patrón que region_config (mig 046): tabla chica de configuración,
-- PK region_cod, sin FK (region_config tampoco la tiene).

CREATE TABLE IF NOT EXISTS public.region_meta_empleo (
  region_cod TEXT PRIMARY KEY,
  objetivo NUMERIC NOT NULL DEFAULT 0,
  valor_actual NUMERIC NOT NULL DEFAULT 0,
  valor_updated_by_email TEXT,
  valor_updated_at TIMESTAMPTZ
);

ALTER TABLE public.region_meta_empleo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS region_meta_empleo_select_any ON public.region_meta_empleo;
CREATE POLICY region_meta_empleo_select_any ON public.region_meta_empleo
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS region_meta_empleo_staff_all ON public.region_meta_empleo;
CREATE POLICY region_meta_empleo_staff_all ON public.region_meta_empleo
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

DROP POLICY IF EXISTS region_meta_empleo_regional_insert ON public.region_meta_empleo;
CREATE POLICY region_meta_empleo_regional_insert ON public.region_meta_empleo
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND region_meta_empleo.region_cod = ANY(up.region_cods)));

DROP POLICY IF EXISTS region_meta_empleo_regional_update ON public.region_meta_empleo;
CREATE POLICY region_meta_empleo_regional_update ON public.region_meta_empleo
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND region_meta_empleo.region_cod = ANY(up.region_cods)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND region_meta_empleo.region_cod = ANY(up.region_cods)));
-- DELETE: solo staff (vía region_meta_empleo_staff_all).

-- ── 2. sesion_meta_empleo_valor — valor digitado en la sesión ────────────────
-- Hija de eje_sesiones (patrón sesion_valores, mig 044): UNIQUE(sesion_id)
-- porque es un único indicador (no un catálogo de métricas por fila).

CREATE TABLE IF NOT EXISTS public.sesion_meta_empleo_valor (
  id BIGSERIAL PRIMARY KEY,
  sesion_id BIGINT NOT NULL REFERENCES public.eje_sesiones(id) ON DELETE CASCADE,
  empleos_generados NUMERIC NOT NULL,
  UNIQUE (sesion_id)
);

ALTER TABLE public.sesion_meta_empleo_valor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sesion_meta_empleo_valor_staff_all ON public.sesion_meta_empleo_valor;
CREATE POLICY sesion_meta_empleo_valor_staff_all ON public.sesion_meta_empleo_valor
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

DROP POLICY IF EXISTS sesion_meta_empleo_valor_regional_select ON public.sesion_meta_empleo_valor;
CREATE POLICY sesion_meta_empleo_valor_regional_select ON public.sesion_meta_empleo_valor
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_meta_empleo_valor.sesion_id
                    AND s.region_cod = ANY(up.region_cods))));

DROP POLICY IF EXISTS sesion_meta_empleo_valor_regional_insert ON public.sesion_meta_empleo_valor;
CREATE POLICY sesion_meta_empleo_valor_regional_insert ON public.sesion_meta_empleo_valor
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_meta_empleo_valor.sesion_id
                    AND s.region_cod = ANY(up.region_cods))));

DROP POLICY IF EXISTS sesion_meta_empleo_valor_regional_update ON public.sesion_meta_empleo_valor;
CREATE POLICY sesion_meta_empleo_valor_regional_update ON public.sesion_meta_empleo_valor
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_meta_empleo_valor.sesion_id
                    AND s.region_cod = ANY(up.region_cods))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_meta_empleo_valor.sesion_id
                    AND s.region_cod = ANY(up.region_cods))));

DROP POLICY IF EXISTS sesion_meta_empleo_valor_regional_delete ON public.sesion_meta_empleo_valor;
CREATE POLICY sesion_meta_empleo_valor_regional_delete ON public.sesion_meta_empleo_valor
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_meta_empleo_valor.sesion_id
                    AND s.estado = 'borrador'
                    AND s.region_cod = ANY(up.region_cods))));

-- Inmutable tras el cierre — mismo guard que sesion_valores (server-side del
-- cierre usa service-role, pasa por auth.uid() IS NULL).
DROP TRIGGER IF EXISTS sesion_meta_empleo_valor_bloquea_cerrada_trg ON public.sesion_meta_empleo_valor;
CREATE TRIGGER sesion_meta_empleo_valor_bloquea_cerrada_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.sesion_meta_empleo_valor
  FOR EACH ROW EXECUTE FUNCTION public.sesion_hijas_bloquea_cerrada();

-- ── 3. sesion_compromisos — sección + proyecto asociado ──────────────────────

ALTER TABLE public.sesion_compromisos
  ADD COLUMN IF NOT EXISTS seccion TEXT
    CHECK (seccion IN ('mesa_empleo', 'seguimiento_inversion', 'general')),
  ADD COLUMN IF NOT EXISTS proyecto_id TEXT REFERENCES public.v2_proyectos_inversion(id);
