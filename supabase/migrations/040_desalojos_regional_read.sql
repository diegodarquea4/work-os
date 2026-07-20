-- 040_desalojos_regional_read.sql
--
-- Acceso de regionales a Desalojos: SOLO-LECTURA y scopeado a sus regiones.
-- Antes las 8 tablas desalojo_* eran admin-only (una policy *_admin_all FOR ALL).
-- Cada tabla se enlaza por prioridad_id = prioridades_territoriales.n; la región
-- del desalojo es prioridades_territoriales.cod. Se agrega una policy SELECT para
-- role='regional' que exige que la iniciativa esté en sus region_cods.
--
-- Se CONSERVAN las *_admin_all (permissive → OR): admin ve/edita todo; regional
-- solo SELECT de su región; regional no tiene INSERT/UPDATE/DELETE = read-only.
-- Verificado: regional de VIII ve solo sus capas; UPDATE afecta 0 filas.

CREATE POLICY "desalojo_capas_regional_read" ON public.desalojo_capas
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.prioridades_territoriales p
                  WHERE p.n = desalojo_capas.prioridad_id AND p.cod = ANY(up.region_cods))
  ));

CREATE POLICY "desalojo_detalle_regional_read" ON public.desalojo_detalle
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.prioridades_territoriales p
                  WHERE p.n = desalojo_detalle.prioridad_id AND p.cod = ANY(up.region_cods))
  ));

CREATE POLICY "desalojo_documentos_regional_read" ON public.desalojo_documentos
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.prioridades_territoriales p
                  WHERE p.n = desalojo_documentos.prioridad_id AND p.cod = ANY(up.region_cods))
  ));

CREATE POLICY "desalojo_fase_estado_regional_read" ON public.desalojo_fase_estado
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.prioridades_territoriales p
                  WHERE p.n = desalojo_fase_estado.prioridad_id AND p.cod = ANY(up.region_cods))
  ));

CREATE POLICY "desalojo_log_regional_read" ON public.desalojo_log
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.prioridades_territoriales p
                  WHERE p.n = desalojo_log.prioridad_id AND p.cod = ANY(up.region_cods))
  ));

CREATE POLICY "desalojo_planificacion_regional_read" ON public.desalojo_planificacion
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.prioridades_territoriales p
                  WHERE p.n = desalojo_planificacion.prioridad_id AND p.cod = ANY(up.region_cods))
  ));

CREATE POLICY "desalojo_poligonos_regional_read" ON public.desalojo_poligonos
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.prioridades_territoriales p
                  WHERE p.n = desalojo_poligonos.prioridad_id AND p.cod = ANY(up.region_cods))
  ));

CREATE POLICY "desalojo_seguimientos_regional_read" ON public.desalojo_seguimientos
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.prioridades_territoriales p
                  WHERE p.n = desalojo_seguimientos.prioridad_id AND p.cod = ANY(up.region_cods))
  ));
