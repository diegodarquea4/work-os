-- ============================================================================
-- 075_gabinete_v2_rls_rewrite.sql — Gabinete Regional v2 · PR-1 (parte RIESGOSA)
--
-- Reescritura de RLS de DOS tablas EXISTENTES. Es el único cambio de PR-1 con
-- efecto observable → se aplica y se revierte SOLO (aparte de 074, que es
-- aditivo). Aplicar como "Fase B paso 2" del plan, con smoke de login regional
-- en la región piloto. Rollback listo al pie del archivo.
--
--   A) eje_sesiones: las policies regionales pasan de role='regional' a
--      capacidad (can_operar_instancia) — cierra el gap que la mig 070 dejó
--      (070 migró las hijas de sesión, no la sesión misma). Afecta a TODAS las
--      instancias (eje/gabinete/inversion/politico/infraestructura), no solo
--      gabinete → es la pieza de mayor cuidado.
--   B) gabinete_temas: cierra el hoyo world-readable de mig 053
--      (select_any USING(true)) y pasa a operador-por-capacidad, soportando
--      COEXISTENCIA: filas pool (sesion_id NULL, Preparación v1 vigente) y filas
--      v2 (sesion_id NOT NULL, listas para PR-2). Suma el trigger de
--      inmutabilidad (que 053 no tenía).
--
-- No-regresión esperada: el regional tiene las 5 caps operar scoped a su región
-- (backfill mig 065+), así que opera igual que hoy. Verificar en vivo.
-- ============================================================================

-- ── A) eje_sesiones: role='regional' → capacidad ────────────────────────────
DROP POLICY IF EXISTS eje_sesiones_regional_select ON public.eje_sesiones;
DROP POLICY IF EXISTS eje_sesiones_regional_insert ON public.eje_sesiones;
DROP POLICY IF EXISTS eje_sesiones_regional_update ON public.eje_sesiones;

CREATE POLICY eje_sesiones_operar_select ON public.eje_sesiones
  FOR SELECT TO authenticated
  USING (public.can_operar_instancia(instancia, region_cod));
CREATE POLICY eje_sesiones_operar_insert ON public.eje_sesiones
  FOR INSERT TO authenticated
  WITH CHECK (public.can_operar_instancia(instancia, region_cod));
CREATE POLICY eje_sesiones_operar_update ON public.eje_sesiones
  FOR UPDATE TO authenticated
  USING (public.can_operar_instancia(instancia, region_cod))
  WITH CHECK (public.can_operar_instancia(instancia, region_cod));
-- (sin regional_delete: el borrado de sesión es staff-only vía ruta admin)

-- ── B) gabinete_temas: cerrar select_any + operador-por-capacidad + coexist ──
-- Condición combinada: pool (sesion_id NULL → operador de la instancia gabinete
-- en la región) O v2 (sesion_id NOT NULL → operador de esa sesión). El bloqueo
-- de sesión cerrada lo da el trigger de abajo, no la RLS.
DROP POLICY IF EXISTS gabinete_temas_select_any      ON public.gabinete_temas;
DROP POLICY IF EXISTS gabinete_temas_regional_insert ON public.gabinete_temas;
DROP POLICY IF EXISTS gabinete_temas_regional_update ON public.gabinete_temas;
DROP POLICY IF EXISTS gabinete_temas_regional_delete ON public.gabinete_temas;

CREATE POLICY gabinete_temas_operar_select ON public.gabinete_temas
  FOR SELECT TO authenticated
  USING (
    (gabinete_temas.sesion_id IS NULL     AND public.can_operar_instancia('gabinete', gabinete_temas.region_cod))
    OR (gabinete_temas.sesion_id IS NOT NULL AND public.can_operar_sesion(gabinete_temas.sesion_id))
  );
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

-- Inmutabilidad tras cierre (053 no la tenía). Reusa sesion_hijas_bloquea_cerrada
-- (lee NEW/OLD.sesion_id; pool con sesion_id NULL → no bloquea; el cierre corre
-- service-role → bypass). Blinda las filas archivadas de ediciones de cliente.
DROP TRIGGER IF EXISTS gabinete_temas_bloquea_cerrada_trg ON public.gabinete_temas;
CREATE TRIGGER gabinete_temas_bloquea_cerrada_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.gabinete_temas
  FOR EACH ROW EXECUTE FUNCTION public.sesion_hijas_bloquea_cerrada();

-- ============================================================================
-- ROLLBACK (paso 2) — si el smoke regional falla, correr este bloque para
-- restaurar el estado de 044 (eje_sesiones) y 053 (gabinete_temas). 074 (aditivo)
-- NO se toca.
-- ============================================================================
-- DROP TRIGGER IF EXISTS gabinete_temas_bloquea_cerrada_trg ON public.gabinete_temas;
--
-- DROP POLICY IF EXISTS eje_sesiones_operar_select ON public.eje_sesiones;
-- DROP POLICY IF EXISTS eje_sesiones_operar_insert ON public.eje_sesiones;
-- DROP POLICY IF EXISTS eje_sesiones_operar_update ON public.eje_sesiones;
-- CREATE POLICY eje_sesiones_regional_select ON public.eje_sesiones FOR SELECT TO authenticated
--   USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role='regional' AND eje_sesiones.region_cod = ANY(up.region_cods)));
-- CREATE POLICY eje_sesiones_regional_insert ON public.eje_sesiones FOR INSERT TO authenticated
--   WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role='regional' AND eje_sesiones.region_cod = ANY(up.region_cods)));
-- CREATE POLICY eje_sesiones_regional_update ON public.eje_sesiones FOR UPDATE TO authenticated
--   USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role='regional' AND eje_sesiones.region_cod = ANY(up.region_cods)))
--   WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role='regional' AND eje_sesiones.region_cod = ANY(up.region_cods)));
--
-- DROP POLICY IF EXISTS gabinete_temas_operar_select ON public.gabinete_temas;
-- DROP POLICY IF EXISTS gabinete_temas_operar_insert ON public.gabinete_temas;
-- DROP POLICY IF EXISTS gabinete_temas_operar_update ON public.gabinete_temas;
-- DROP POLICY IF EXISTS gabinete_temas_operar_delete ON public.gabinete_temas;
-- CREATE POLICY gabinete_temas_select_any ON public.gabinete_temas FOR SELECT TO authenticated USING (true);
-- CREATE POLICY gabinete_temas_regional_insert ON public.gabinete_temas FOR INSERT TO authenticated
--   WITH CHECK (gabinete_temas.sesion_id IS NULL AND EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role='regional' AND gabinete_temas.region_cod = ANY(up.region_cods)));
-- CREATE POLICY gabinete_temas_regional_update ON public.gabinete_temas FOR UPDATE TO authenticated
--   USING (gabinete_temas.sesion_id IS NULL AND EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role='regional' AND gabinete_temas.region_cod = ANY(up.region_cods)))
--   WITH CHECK (gabinete_temas.sesion_id IS NULL AND EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role='regional' AND gabinete_temas.region_cod = ANY(up.region_cods)));
-- CREATE POLICY gabinete_temas_regional_delete ON public.gabinete_temas FOR DELETE TO authenticated
--   USING (gabinete_temas.sesion_id IS NULL AND EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role='regional' AND gabinete_temas.region_cod = ANY(up.region_cods)));
