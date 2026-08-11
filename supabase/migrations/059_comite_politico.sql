-- ============================================================================
-- 059_comite_politico.sql
--
-- Comité Político — cuarta instancia de sesiones (junto a 'eje'/Comité Policial,
-- 'gabinete'/Gabinete Regional, 'inversion'/Comité Económico). Es la más liviana:
-- seguimiento de reuniones con parlamentarios / entes políticos. Captura Fecha,
-- Asistencia (100% ad-hoc, sin nómina), Temas conversados (lista con subpuntos)
-- y Compromisos (misma lógica: enlace a iniciativa / delegación a otra instancia).
--
-- Molde: la consolidación de 'inversion' en mig 050. Reusa eje_sesiones,
-- sesion_asistencia (invitados ad-hoc) y sesion_compromisos sin tablas nuevas;
-- solo hay que (1) ampliar los CHECK de `instancia` a 'politico' (eje_id NULL,
-- como gabinete/inversion), (2) el índice de "un borrador vivo", (3) el índice de
-- compromisos abiertos y (4) una tabla chica de temas conversados por sesión.
-- Disponible en las 16 regiones sin flag de habilitación (como Comité Económico).
-- ============================================================================

-- ── eje_sesiones ─────────────────────────────────────────────────────────────

ALTER TABLE public.eje_sesiones DROP CONSTRAINT IF EXISTS eje_sesiones_instancia_check;
ALTER TABLE public.eje_sesiones ADD CONSTRAINT eje_sesiones_instancia_check
  CHECK (instancia = ANY (ARRAY['eje', 'gabinete', 'inversion', 'politico']::text[]));

ALTER TABLE public.eje_sesiones DROP CONSTRAINT IF EXISTS eje_sesiones_instancia_eje_chk;
ALTER TABLE public.eje_sesiones ADD CONSTRAINT eje_sesiones_instancia_eje_chk
  CHECK (
    ((instancia = 'eje') AND (eje_id IS NOT NULL))
    OR ((instancia = ANY (ARRAY['gabinete', 'inversion', 'politico']::text[])) AND (eje_id IS NULL))
  );

-- Un solo borrador vivo por (región, provincia) para Comité Político — mismo
-- patrón que uq_eje_sesiones_un_borrador_inversion (mig 050).
CREATE UNIQUE INDEX IF NOT EXISTS uq_eje_sesiones_un_borrador_politico
  ON public.eje_sesiones (region_cod, COALESCE(provincia_cod, ''))
  WHERE estado = 'borrador' AND instancia = 'politico';

-- ── sesion_nomina ────────────────────────────────────────────────────────────
-- El Comité Político no siembra nómina (asistencia ad-hoc), pero el CHECK vive
-- en la tabla y debe admitir el valor por consistencia.

ALTER TABLE public.sesion_nomina DROP CONSTRAINT IF EXISTS sesion_nomina_instancia_check;
ALTER TABLE public.sesion_nomina ADD CONSTRAINT sesion_nomina_instancia_check
  CHECK (instancia = ANY (ARRAY['eje', 'gabinete', 'inversion', 'politico']::text[]));

ALTER TABLE public.sesion_nomina DROP CONSTRAINT IF EXISTS sesion_nomina_instancia_eje_chk;
ALTER TABLE public.sesion_nomina ADD CONSTRAINT sesion_nomina_instancia_eje_chk
  CHECK (
    ((instancia = 'eje') AND (eje_id IS NOT NULL))
    OR ((instancia = ANY (ARRAY['gabinete', 'inversion', 'politico']::text[])) AND (eje_id IS NULL))
  );

-- ── sesion_compromisos ───────────────────────────────────────────────────────

ALTER TABLE public.sesion_compromisos DROP CONSTRAINT IF EXISTS sesion_compromisos_instancia_check;
ALTER TABLE public.sesion_compromisos ADD CONSTRAINT sesion_compromisos_instancia_check
  CHECK (instancia = ANY (ARRAY['eje', 'gabinete', 'inversion', 'politico']::text[]));

ALTER TABLE public.sesion_compromisos DROP CONSTRAINT IF EXISTS sesion_compromisos_instancia_eje_chk;
ALTER TABLE public.sesion_compromisos ADD CONSTRAINT sesion_compromisos_instancia_eje_chk
  CHECK (
    ((instancia = 'eje') AND (eje_id IS NOT NULL))
    OR ((instancia = ANY (ARRAY['gabinete', 'inversion', 'politico']::text[])) AND (eje_id IS NULL))
  );

-- Mismo patrón que idx_sesion_compromisos_inversion_abiertos (mig 050).
CREATE INDEX IF NOT EXISTS idx_sesion_compromisos_politico_abiertos
  ON public.sesion_compromisos (region_cod, estado)
  WHERE instancia = 'politico';

-- ── sesion_temas — "Temas conversados" del Comité Político ────────────────────
-- Hija de la sesión (session-scoped, NO el modelo pending/fijo de gabinete_temas:
-- acá los temas se anotan DURANTE la sesión y ya cuelgan de ella desde el alta).
-- Lista con subpuntos (subitems JSONB), mismo molde de datos que gabinete_temas
-- (+ mig 054). Inmutable al cerrar vía el trigger sesion_hijas_bloquea_cerrada.

CREATE TABLE IF NOT EXISTS public.sesion_temas (
  id               BIGSERIAL PRIMARY KEY,
  sesion_id        BIGINT NOT NULL REFERENCES public.eje_sesiones(id) ON DELETE CASCADE,
  texto            TEXT NOT NULL,
  subitems         JSONB NOT NULL DEFAULT '[]'::jsonb,
  orden            INT  NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_email TEXT
);

CREATE INDEX IF NOT EXISTS idx_sesion_temas_sesion
  ON public.sesion_temas (sesion_id, orden);

ALTER TABLE public.sesion_temas ENABLE ROW LEVEL SECURITY;

-- RLS espejo de sesion_asistencia (mig 044): staff todo; regional scopeado por
-- la región de la sesión padre; DELETE regional solo mientras es borrador.
DROP POLICY IF EXISTS sesion_temas_staff_all ON public.sesion_temas;
CREATE POLICY sesion_temas_staff_all ON public.sesion_temas
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

DROP POLICY IF EXISTS sesion_temas_regional_select ON public.sesion_temas;
CREATE POLICY sesion_temas_regional_select ON public.sesion_temas
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_temas.sesion_id
                    AND s.region_cod = ANY(up.region_cods))));

DROP POLICY IF EXISTS sesion_temas_regional_insert ON public.sesion_temas;
CREATE POLICY sesion_temas_regional_insert ON public.sesion_temas
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_temas.sesion_id
                    AND s.region_cod = ANY(up.region_cods))));

DROP POLICY IF EXISTS sesion_temas_regional_update ON public.sesion_temas;
CREATE POLICY sesion_temas_regional_update ON public.sesion_temas
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_temas.sesion_id
                    AND s.region_cod = ANY(up.region_cods))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_temas.sesion_id
                    AND s.region_cod = ANY(up.region_cods))));

DROP POLICY IF EXISTS sesion_temas_regional_delete ON public.sesion_temas;
CREATE POLICY sesion_temas_regional_delete ON public.sesion_temas
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_temas.sesion_id
                    AND s.estado = 'borrador'
                    AND s.region_cod = ANY(up.region_cods))));

-- Inmutabilidad post-cierre: mismo trigger que las demás hijas (guard
-- auth.uid() IS NULL deja pasar al service-role). La función ya existe (mig 044).
DROP TRIGGER IF EXISTS sesion_temas_bloquea_cerrada_trg ON public.sesion_temas;
CREATE TRIGGER sesion_temas_bloquea_cerrada_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.sesion_temas
  FOR EACH ROW EXECUTE FUNCTION public.sesion_hijas_bloquea_cerrada();
