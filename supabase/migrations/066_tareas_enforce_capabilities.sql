-- ============================================================================
-- 066_tareas_enforce_capabilities.sql — Fase 2 (enforcement de EDICIÓN), área 1
--
-- Primera área del enforcement duro por capacidades: `tareas` (módulo
-- Planificación). Es el swap más seguro porque la mig 064 ya la dejó
-- region-aware; acá SOLO cambiamos la FUENTE de la decisión para los no-staff:
-- de `current_user_role() + region_cods` → `current_user_can('planificacion.*',
-- <región de la tarea>)`.
--
-- No-regresión: el backfill de user_capabilities (espejo del rol) ya está
-- corrido, así que el comportamiento por defecto es IDÉNTICO. La diferencia: a
-- partir de ahora, conceder/revocar `planificacion.ver`/`.editar` a un usuario
-- desde el editor TIENE EFECTO REAL sobre la BD.
--
-- Staff (admin/editor) mantiene `tareas_staff_all` (mig 064) intacto — acceso
-- total, incluidas tareas huérfanas sin iniciativa. La región de la tarea se
-- deriva de prioridad_id → prioridades_territoriales.n → .cod.
-- ============================================================================

-- SELECT no-staff → capacidad planificacion.ver en la región de la iniciativa.
DROP POLICY IF EXISTS tareas_region_select ON public.tareas;
CREATE POLICY tareas_can_select ON public.tareas
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.prioridades_territoriales p
    WHERE p.n = tareas.prioridad_id
      AND public.current_user_can('planificacion.ver', p.cod)));

-- INSERT no-staff → planificacion.editar en la región de la iniciativa.
DROP POLICY IF EXISTS tareas_region_insert ON public.tareas;
CREATE POLICY tareas_can_insert ON public.tareas
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.prioridades_territoriales p
    WHERE p.n = tareas.prioridad_id
      AND public.current_user_can('planificacion.editar', p.cod)));

-- UPDATE/DELETE no-staff → autor de la tarea + planificacion.editar en la región.
DROP POLICY IF EXISTS tareas_region_update ON public.tareas;
CREATE POLICY tareas_can_update ON public.tareas
  FOR UPDATE TO authenticated
  USING (
    tareas.autor = auth.jwt() ->> 'email'
    AND EXISTS (
      SELECT 1 FROM public.prioridades_territoriales p
      WHERE p.n = tareas.prioridad_id
        AND public.current_user_can('planificacion.editar', p.cod)))
  WITH CHECK (
    tareas.autor = auth.jwt() ->> 'email'
    AND EXISTS (
      SELECT 1 FROM public.prioridades_territoriales p
      WHERE p.n = tareas.prioridad_id
        AND public.current_user_can('planificacion.editar', p.cod)));

DROP POLICY IF EXISTS tareas_region_delete ON public.tareas;
CREATE POLICY tareas_can_delete ON public.tareas
  FOR DELETE TO authenticated
  USING (
    tareas.autor = auth.jwt() ->> 'email'
    AND EXISTS (
      SELECT 1 FROM public.prioridades_territoriales p
      WHERE p.n = tareas.prioridad_id
        AND public.current_user_can('planificacion.editar', p.cod)));

-- `tareas_staff_all` (mig 064) queda INTACTO: admin/editor con acceso total.
