-- ════════════════════════════════════════════════════════════════════════════
-- 084 — Fix RLS de gabinete_temas: permitir armar la pauta v2 (temas con sesion_id)
--
-- Bug reportado 2026-08-26: un usuario regional con la capacidad
-- `comite.gabinete.operar` puede editar la fecha (eje_sesiones) y la asistencia
-- (sesion_asistencia) pero NO armar la pauta ni editar temas del gabinete:
--   "new row violates row-level security policy for table gabinete_temas".
--
-- Causa: la mig 075 (gabinete v2 RLS rewrite) NUNCA se aplicó a prod. Las
-- policies de escritura de gabinete_temas siguen siendo las de la mig 053, que
-- exigen `sesion_id IS NULL` (solo el pool de temas pendientes) + rol='regional'.
-- La pauta v2 inserta temas CON sesion_id (usePautaGabinete.addPunto) → RLS lo
-- rechaza. El resto de las tablas hijas de sesión (sesion_asistencia,
-- sesion_intervenciones, gabinete_tema_carteras) ya usan can_operar_sesion
-- (mig 070) → por eso la asistencia sí funciona y los temas no.
--
-- Fix (hotfix quirúrgico = parte B de la mig 075, SIN tocar eje_sesiones ni el
-- SELECT world-readable, que quedan para el lanzamiento coordinado del Gabinete
-- v2 con smoke regional):
--   - Reemplaza las 3 policies de ESCRITURA regional por el modelo de capacidad
--     can_operar_* (soporta el pool con sesion_id NULL Y los temas de sesión).
--     El predicado de sesión es IDÉNTICO al de sesion_asistencia (que ya
--     funciona para este usuario).
--   - Agrega el trigger de inmutabilidad: las operar policies no chequean estado
--     y can_operar_sesion no distingue borrador/cerrada, así que sin el trigger
--     un operador podría editar una sesión ya cerrada. El trigger sólo bloquea
--     'cerrada' para no-admin (verificado); borrador y pool (sesion_id NULL)
--     pasan → NO re-rompe el INSERT de la pauta. El cierre/acta corren
--     service-role (auth.uid() NULL) → bypass.
--   - NO toca gabinete_temas_select_any (sigue world-readable, estado previo, sin
--     regresión de lectura) ni las policies de eje_sesiones (siguen role=
--     'regional', que hoy funciona para editar la fecha).
--
-- Verificado en prod (2026-08-26): can_operar_instancia / can_operar_sesion /
-- sesion_hijas_bloquea_cerrada existen; gabinete_temas no tenía trigger;
-- sesion_hijas_bloquea_cerrada sólo bloquea 'cerrada' (no borrador ni pool).
--
-- NOTA sobre 075: su parte B (gabinete_temas) queda superseded por esta 084. La
-- 075 se dejó idempotente (DROP POLICY IF EXISTS antes de cada CREATE de las
-- operar) para que, cuando se aplique el lanzamiento completo del Gabinete v2
-- (parte A eje_sesiones + tightening de SELECT), no choque con lo de acá.
-- ════════════════════════════════════════════════════════════════════════════

-- Viejas policies de escritura (mig 053): pool-only + role='regional'.
DROP POLICY IF EXISTS gabinete_temas_regional_insert ON public.gabinete_temas;
DROP POLICY IF EXISTS gabinete_temas_regional_update ON public.gabinete_temas;
DROP POLICY IF EXISTS gabinete_temas_regional_delete ON public.gabinete_temas;

-- Idempotencia (por si esta 084 se re-corre o 075 corrió a medias antes).
DROP POLICY IF EXISTS gabinete_temas_operar_insert ON public.gabinete_temas;
DROP POLICY IF EXISTS gabinete_temas_operar_update ON public.gabinete_temas;
DROP POLICY IF EXISTS gabinete_temas_operar_delete ON public.gabinete_temas;

CREATE POLICY gabinete_temas_operar_insert ON public.gabinete_temas
  FOR INSERT TO authenticated
  WITH CHECK (
    (gabinete_temas.sesion_id IS NULL     AND public.can_operar_instancia('gabinete', gabinete_temas.region_cod))
    OR (gabinete_temas.sesion_id IS NOT NULL AND public.can_operar_sesion(gabinete_temas.sesion_id))
  );

CREATE POLICY gabinete_temas_operar_update ON public.gabinete_temas
  FOR UPDATE TO authenticated
  USING (
    (gabinete_temas.sesion_id IS NULL     AND public.can_operar_instancia('gabinete', gabinete_temas.region_cod))
    OR (gabinete_temas.sesion_id IS NOT NULL AND public.can_operar_sesion(gabinete_temas.sesion_id))
  )
  WITH CHECK (
    (gabinete_temas.sesion_id IS NULL     AND public.can_operar_instancia('gabinete', gabinete_temas.region_cod))
    OR (gabinete_temas.sesion_id IS NOT NULL AND public.can_operar_sesion(gabinete_temas.sesion_id))
  );

CREATE POLICY gabinete_temas_operar_delete ON public.gabinete_temas
  FOR DELETE TO authenticated
  USING (
    (gabinete_temas.sesion_id IS NULL     AND public.can_operar_instancia('gabinete', gabinete_temas.region_cod))
    OR (gabinete_temas.sesion_id IS NOT NULL AND public.can_operar_sesion(gabinete_temas.sesion_id))
  );

-- Inmutabilidad tras cierre (las operar policies no chequean estado).
DROP TRIGGER IF EXISTS gabinete_temas_bloquea_cerrada_trg ON public.gabinete_temas;
CREATE TRIGGER gabinete_temas_bloquea_cerrada_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.gabinete_temas
  FOR EACH ROW EXECUTE FUNCTION public.sesion_hijas_bloquea_cerrada();

-- ── Rollback ────────────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS gabinete_temas_bloquea_cerrada_trg ON public.gabinete_temas;
-- DROP POLICY IF EXISTS gabinete_temas_operar_insert ON public.gabinete_temas;
-- DROP POLICY IF EXISTS gabinete_temas_operar_update ON public.gabinete_temas;
-- DROP POLICY IF EXISTS gabinete_temas_operar_delete ON public.gabinete_temas;
-- CREATE POLICY gabinete_temas_regional_insert ON public.gabinete_temas FOR INSERT TO authenticated
--   WITH CHECK (gabinete_temas.sesion_id IS NULL AND EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role='regional' AND gabinete_temas.region_cod = ANY(up.region_cods)));
-- CREATE POLICY gabinete_temas_regional_update ON public.gabinete_temas FOR UPDATE TO authenticated
--   USING (gabinete_temas.sesion_id IS NULL AND EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role='regional' AND gabinete_temas.region_cod = ANY(up.region_cods)))
--   WITH CHECK (gabinete_temas.sesion_id IS NULL AND EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role='regional' AND gabinete_temas.region_cod = ANY(up.region_cods)));
-- CREATE POLICY gabinete_temas_regional_delete ON public.gabinete_temas FOR DELETE TO authenticated
--   USING (gabinete_temas.sesion_id IS NULL AND EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role='regional' AND gabinete_temas.region_cod = ANY(up.region_cods)));
