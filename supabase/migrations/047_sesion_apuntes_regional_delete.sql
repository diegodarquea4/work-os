-- 047 — DELETE de apuntes para regional (eliminar una institución/pill desde el modal).
-- La 044 dio a regional SELECT/INSERT/UPDATE sobre sesion_apuntes pero NO DELETE.
-- Sin esta policy, borrar una institución quedaba bloqueado por RLS y, al ser DELETE
-- idempotente (safeDelete no lanza sin error explícito), divergía en silencio: la fila
-- seguía en la BD y el pill reaparecía al recargar.
-- La inmutabilidad de sesión cerrada ya la cubre el trigger sesion_hijas_bloquea_cerrada
-- (BEFORE INSERT OR UPDATE OR DELETE en 044) — no se repite acá.

DROP POLICY IF EXISTS sesion_apuntes_regional_delete ON public.sesion_apuntes;
CREATE POLICY sesion_apuntes_regional_delete ON public.sesion_apuntes
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_apuntes.sesion_id
                    AND s.region_cod = ANY(up.region_cods))));
