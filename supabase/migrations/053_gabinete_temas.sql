-- ============================================================================
-- 053_gabinete_temas.sql
--
-- "Temas a tratar" del Gabinete Regional (tarjeta de Preparación).
--
-- Puntos libres pre-reunión (vocerías, temas generales que no son iniciativas
-- concretas). Ciclo de vida: sesion_id NULL = pendiente (vive en Gabinete →
-- Preparación y encabeza el PDF Cronograma); al CERRAR la sesión de gabinete,
-- el server (service-role) estampa sesion_id y los temas quedan ARCHIVADOS en
-- esa sesión (acta + historial). La lista de Preparación parte vacía para la
-- próxima reunión.
--
-- Molde: comite_metrica (mig 048) — tabla chica con region_cod directo,
-- policies select_any + staff_all + regional por region_cods. La inmutabilidad
-- post-archivo la dan las policies regionales (sesion_id IS NULL), no un
-- trigger: mientras se edita, la fila NO es hija de sesión.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.gabinete_temas (
  id               BIGSERIAL PRIMARY KEY,
  region_cod       TEXT NOT NULL,
  texto            TEXT NOT NULL,
  orden            INT  NOT NULL DEFAULT 0,
  -- NULL = pendiente; NOT NULL = archivado en esa sesión. CASCADE (no SET
  -- NULL): si se borra una sesión cerrada (reparación admin), sus temas
  -- archivados son snapshot de ella y mueren con ella — con SET NULL
  -- volverían como pendientes ("zombies") a la próxima Preparación.
  sesion_id        BIGINT REFERENCES public.eje_sesiones(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_email TEXT
);

CREATE INDEX IF NOT EXISTS idx_gabinete_temas_pendientes
  ON public.gabinete_temas (region_cod, orden) WHERE sesion_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_gabinete_temas_sesion
  ON public.gabinete_temas (sesion_id) WHERE sesion_id IS NOT NULL;

ALTER TABLE public.gabinete_temas ENABLE ROW LEVEL SECURITY;

-- SELECT: cualquier autenticado (viewer lee la tarjeta, el historial y la
-- zona de lectura de la sesión).
DROP POLICY IF EXISTS gabinete_temas_select_any ON public.gabinete_temas;
CREATE POLICY gabinete_temas_select_any ON public.gabinete_temas
  FOR SELECT TO authenticated USING (true);

-- Staff: todo (incluye reparar archivados).
DROP POLICY IF EXISTS gabinete_temas_staff_all ON public.gabinete_temas;
CREATE POLICY gabinete_temas_staff_all ON public.gabinete_temas
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

-- Regional: solo temas PENDIENTES de su(s) región(es). El archivo lo hace el
-- cierre server-side (service-role bypassa RLS); tras archivar, inmutable
-- para regional. El WITH CHECK con sesion_id IS NULL impide además
-- auto-archivar o des-archivar desde el cliente.
DROP POLICY IF EXISTS gabinete_temas_regional_insert ON public.gabinete_temas;
CREATE POLICY gabinete_temas_regional_insert ON public.gabinete_temas
  FOR INSERT TO authenticated
  WITH CHECK (gabinete_temas.sesion_id IS NULL AND EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND gabinete_temas.region_cod = ANY(up.region_cods)));

DROP POLICY IF EXISTS gabinete_temas_regional_update ON public.gabinete_temas;
CREATE POLICY gabinete_temas_regional_update ON public.gabinete_temas
  FOR UPDATE TO authenticated
  USING (gabinete_temas.sesion_id IS NULL AND EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND gabinete_temas.region_cod = ANY(up.region_cods)))
  WITH CHECK (gabinete_temas.sesion_id IS NULL AND EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND gabinete_temas.region_cod = ANY(up.region_cods)));

DROP POLICY IF EXISTS gabinete_temas_regional_delete ON public.gabinete_temas;
CREATE POLICY gabinete_temas_regional_delete ON public.gabinete_temas
  FOR DELETE TO authenticated
  USING (gabinete_temas.sesion_id IS NULL AND EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND gabinete_temas.region_cod = ANY(up.region_cods)));
