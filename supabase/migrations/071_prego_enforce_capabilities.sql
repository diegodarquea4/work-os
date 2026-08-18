-- ============================================================================
-- 071_prego_enforce_capabilities.sql — Fase 2 RLS, área PREGO
--
-- prego_monitoreo y prevencion_respuesta: la policy de escritura pasa de rol
-- (admin/editor) → current_user_can('prego.editar', region_cod). Neutro
-- (admin/editor tienen la cap 'all'); ahora conceder prego.editar a un regional
-- desde el editor lo habilita en su región. SELECT sigue world-readable (Fase 3).
-- ============================================================================

DROP POLICY IF EXISTS prego_monitoreo_write_by_role ON public.prego_monitoreo;
CREATE POLICY prego_monitoreo_write_by_cap ON public.prego_monitoreo
  FOR ALL TO public
  USING (public.current_user_can('prego.editar', region_cod))
  WITH CHECK (public.current_user_can('prego.editar', region_cod));

DROP POLICY IF EXISTS prevencion_respuesta_write_by_role ON public.prevencion_respuesta;
CREATE POLICY prevencion_respuesta_write_by_cap ON public.prevencion_respuesta
  FOR ALL TO public
  USING (public.current_user_can('prego.editar', region_cod))
  WITH CHECK (public.current_user_can('prego.editar', region_cod));
