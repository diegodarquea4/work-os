-- 041_desalojos_viewer_read.sql
--
-- Acceso de VIEWERS (rol solo-lectura) a Desalojos, como continuación de mig 040
-- (que abrió la lectura a 'regional'). Diego: "los solo lectura también pueden ver
-- la sección desalojos".
--
-- Regla (igual que el resto del panel, patrón needsRegionFilter en WorkOSApp):
--   - viewer nacional  (sin region_cods)  → ve TODOS los desalojos.
--   - viewer filtrado  (con region_cods)  → ve solo los de sus regiones.
-- Siempre solo-lectura: no se agregan policies de INSERT/UPDATE/DELETE para viewer.
--
-- Igual que 040, esto es DEFENSA EN PROFUNDIDAD: el control operativo real vive en
-- las rutas /api/desalojos/* (service-role, que bypassa RLS). Se conservan las
-- *_admin_all y las *_regional_read (permissive → OR).
--
-- Cada tabla se enlaza por prioridad_id = prioridades_territoriales.n; la región del
-- desalojo es prioridades_territoriales.cod.

CREATE POLICY "desalojo_capas_viewer_read" ON public.desalojo_capas
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'viewer'
      AND (
        COALESCE(array_length(up.region_cods, 1), 0) = 0
        OR EXISTS (SELECT 1 FROM public.prioridades_territoriales p
                   WHERE p.n = desalojo_capas.prioridad_id AND p.cod = ANY(up.region_cods))
      )
  ));

CREATE POLICY "desalojo_detalle_viewer_read" ON public.desalojo_detalle
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'viewer'
      AND (
        COALESCE(array_length(up.region_cods, 1), 0) = 0
        OR EXISTS (SELECT 1 FROM public.prioridades_territoriales p
                   WHERE p.n = desalojo_detalle.prioridad_id AND p.cod = ANY(up.region_cods))
      )
  ));

CREATE POLICY "desalojo_documentos_viewer_read" ON public.desalojo_documentos
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'viewer'
      AND (
        COALESCE(array_length(up.region_cods, 1), 0) = 0
        OR EXISTS (SELECT 1 FROM public.prioridades_territoriales p
                   WHERE p.n = desalojo_documentos.prioridad_id AND p.cod = ANY(up.region_cods))
      )
  ));

CREATE POLICY "desalojo_fase_estado_viewer_read" ON public.desalojo_fase_estado
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'viewer'
      AND (
        COALESCE(array_length(up.region_cods, 1), 0) = 0
        OR EXISTS (SELECT 1 FROM public.prioridades_territoriales p
                   WHERE p.n = desalojo_fase_estado.prioridad_id AND p.cod = ANY(up.region_cods))
      )
  ));

CREATE POLICY "desalojo_log_viewer_read" ON public.desalojo_log
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'viewer'
      AND (
        COALESCE(array_length(up.region_cods, 1), 0) = 0
        OR EXISTS (SELECT 1 FROM public.prioridades_territoriales p
                   WHERE p.n = desalojo_log.prioridad_id AND p.cod = ANY(up.region_cods))
      )
  ));

CREATE POLICY "desalojo_planificacion_viewer_read" ON public.desalojo_planificacion
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'viewer'
      AND (
        COALESCE(array_length(up.region_cods, 1), 0) = 0
        OR EXISTS (SELECT 1 FROM public.prioridades_territoriales p
                   WHERE p.n = desalojo_planificacion.prioridad_id AND p.cod = ANY(up.region_cods))
      )
  ));

CREATE POLICY "desalojo_poligonos_viewer_read" ON public.desalojo_poligonos
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'viewer'
      AND (
        COALESCE(array_length(up.region_cods, 1), 0) = 0
        OR EXISTS (SELECT 1 FROM public.prioridades_territoriales p
                   WHERE p.n = desalojo_poligonos.prioridad_id AND p.cod = ANY(up.region_cods))
      )
  ));

CREATE POLICY "desalojo_seguimientos_viewer_read" ON public.desalojo_seguimientos
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'viewer'
      AND (
        COALESCE(array_length(up.region_cods, 1), 0) = 0
        OR EXISTS (SELECT 1 FROM public.prioridades_territoriales p
                   WHERE p.n = desalojo_seguimientos.prioridad_id AND p.cod = ANY(up.region_cods))
      )
  ));
