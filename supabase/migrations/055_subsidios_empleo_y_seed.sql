-- ============================================================================
-- 055_subsidios_empleo_y_seed.sql
--
-- Mesa Empleo gana un segundo indicador: Subsidios (cupos por región +
-- postulados/entregados/empresas postulantes, acumulados por sesión). Mismo
-- patrón que Meta Empleo (mig 052): tabla región con el cupo declarado +
-- tabla hija de sesión con el valor digitado, sumado al cerrar.
--
-- Seed: piloto en Tarapacá (region_cod='I') — meta de 1.000 empleos
-- (region_meta_empleo, ya creada en la 052) y cupo de 842 subsidios.
-- ============================================================================

-- ── 1. region_subsidio_empleo — cupo + acumulados por región ────────────────

CREATE TABLE IF NOT EXISTS public.region_subsidio_empleo (
  region_cod TEXT PRIMARY KEY,
  cupos NUMERIC NOT NULL DEFAULT 0,
  postulados NUMERIC NOT NULL DEFAULT 0,
  entregados NUMERIC NOT NULL DEFAULT 0,
  empresas_postulantes NUMERIC NOT NULL DEFAULT 0,
  valor_updated_by_email TEXT,
  valor_updated_at TIMESTAMPTZ
);

ALTER TABLE public.region_subsidio_empleo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS region_subsidio_empleo_select_any ON public.region_subsidio_empleo;
CREATE POLICY region_subsidio_empleo_select_any ON public.region_subsidio_empleo
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS region_subsidio_empleo_staff_all ON public.region_subsidio_empleo;
CREATE POLICY region_subsidio_empleo_staff_all ON public.region_subsidio_empleo
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

DROP POLICY IF EXISTS region_subsidio_empleo_regional_insert ON public.region_subsidio_empleo;
CREATE POLICY region_subsidio_empleo_regional_insert ON public.region_subsidio_empleo
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND region_subsidio_empleo.region_cod = ANY(up.region_cods)));

DROP POLICY IF EXISTS region_subsidio_empleo_regional_update ON public.region_subsidio_empleo;
CREATE POLICY region_subsidio_empleo_regional_update ON public.region_subsidio_empleo
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND region_subsidio_empleo.region_cod = ANY(up.region_cods)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND region_subsidio_empleo.region_cod = ANY(up.region_cods)));
-- DELETE: solo staff (vía region_subsidio_empleo_staff_all).

-- ── 2. sesion_subsidio_empleo_valor — valores digitados en la sesión ────────
-- Hija de eje_sesiones (mismo patrón que sesion_meta_empleo_valor): un único
-- indicador (no catálogo), UNIQUE(sesion_id). Los tres campos son deltas de
-- esta sesión — se suman a region_subsidio_empleo al cerrar.

CREATE TABLE IF NOT EXISTS public.sesion_subsidio_empleo_valor (
  id BIGSERIAL PRIMARY KEY,
  sesion_id BIGINT NOT NULL REFERENCES public.eje_sesiones(id) ON DELETE CASCADE,
  postulados NUMERIC NOT NULL DEFAULT 0,
  entregados NUMERIC NOT NULL DEFAULT 0,
  empresas_postulantes NUMERIC NOT NULL DEFAULT 0,
  UNIQUE (sesion_id)
);

ALTER TABLE public.sesion_subsidio_empleo_valor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sesion_subsidio_empleo_valor_staff_all ON public.sesion_subsidio_empleo_valor;
CREATE POLICY sesion_subsidio_empleo_valor_staff_all ON public.sesion_subsidio_empleo_valor
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

DROP POLICY IF EXISTS sesion_subsidio_empleo_valor_regional_select ON public.sesion_subsidio_empleo_valor;
CREATE POLICY sesion_subsidio_empleo_valor_regional_select ON public.sesion_subsidio_empleo_valor
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_subsidio_empleo_valor.sesion_id
                    AND s.region_cod = ANY(up.region_cods))));

DROP POLICY IF EXISTS sesion_subsidio_empleo_valor_regional_insert ON public.sesion_subsidio_empleo_valor;
CREATE POLICY sesion_subsidio_empleo_valor_regional_insert ON public.sesion_subsidio_empleo_valor
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_subsidio_empleo_valor.sesion_id
                    AND s.region_cod = ANY(up.region_cods))));

DROP POLICY IF EXISTS sesion_subsidio_empleo_valor_regional_update ON public.sesion_subsidio_empleo_valor;
CREATE POLICY sesion_subsidio_empleo_valor_regional_update ON public.sesion_subsidio_empleo_valor
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_subsidio_empleo_valor.sesion_id
                    AND s.region_cod = ANY(up.region_cods))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_subsidio_empleo_valor.sesion_id
                    AND s.region_cod = ANY(up.region_cods))));

DROP POLICY IF EXISTS sesion_subsidio_empleo_valor_regional_delete ON public.sesion_subsidio_empleo_valor;
CREATE POLICY sesion_subsidio_empleo_valor_regional_delete ON public.sesion_subsidio_empleo_valor
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_subsidio_empleo_valor.sesion_id
                    AND s.estado = 'borrador'
                    AND s.region_cod = ANY(up.region_cods))));

DROP TRIGGER IF EXISTS sesion_subsidio_empleo_valor_bloquea_cerrada_trg ON public.sesion_subsidio_empleo_valor;
CREATE TRIGGER sesion_subsidio_empleo_valor_bloquea_cerrada_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.sesion_subsidio_empleo_valor
  FOR EACH ROW EXECUTE FUNCTION public.sesion_hijas_bloquea_cerrada();

-- ── 3. Seed piloto — Tarapacá ─────────────────────────────────────────────────

INSERT INTO public.region_meta_empleo (region_cod, objetivo)
VALUES ('I', 1000)
ON CONFLICT (region_cod) DO UPDATE SET objetivo = EXCLUDED.objetivo;

INSERT INTO public.region_subsidio_empleo (region_cod, cupos)
VALUES ('I', 842)
ON CONFLICT (region_cod) DO UPDATE SET cupos = EXCLUDED.cupos;
