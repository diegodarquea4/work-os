-- ============================================================================
-- 111_comite_economico_lectura_por_capacidad.sql
--
-- Segunda mitad de la 110. Corregir la ESCRITURA no alcanzaba: `eje_sesiones` y
-- `sesion_oficios_tratados` también gatean la LECTURA por rol, así que para el
-- SEREMI de Tarapacá con `comite.economico.operar` el módulo entero estaba
-- oscuro. Verificado bajo RLS real antes de esta migración:
--
--   select count(*) from eje_sesiones where region_cod = 'I'   →  0
--
-- Y aunque la 110 ya lo dejaba insertar, el INSERT igual fallaba desde la app:
-- PostgREST devuelve la fila escrita (`RETURNING`), y `safeWrite` además hace
-- `.select('*')`, así que sin política de SELECT el escribir termina en
-- «new row violates row-level security policy».
--
-- Se AGREGA una política permisiva en vez de reemplazar la que hay. Las
-- políticas permisivas se combinan con OR: esto solo ENSANCHA la lectura para
-- quien tiene la capacidad, y ningún lector de hoy cambia de comportamiento.
-- Es la precaución que CLAUDE.md pide con las políticas SELECT.
-- ============================================================================

CREATE POLICY eje_sesiones_operador_select ON public.eje_sesiones
  FOR SELECT TO authenticated
  USING (public.can_operar_instancia(instancia, region_cod));

CREATE POLICY sesion_oficios_operador_select ON public.sesion_oficios_tratados
  FOR SELECT TO authenticated
  USING (public.current_user_can('comite.economico.operar', region_cod));
