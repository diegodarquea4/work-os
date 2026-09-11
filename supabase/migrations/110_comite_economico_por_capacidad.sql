-- ============================================================================
-- 110_comite_economico_por_capacidad.sql
--
-- Quien tiene `comite.economico.operar` en una región debe poder hacer todo lo
-- que hace falta para liderar ese comité, sea cual sea su rol. Hoy no puede: la
-- mig 070 pasó a capacidades las tablas HIJAS de una sesión (`sesion_temas`,
-- `sesion_asistencia`, `sesion_proyectos`, los valores de Mesa Empleo…), pero
-- dejó en el modelo viejo —el que pregunta por el ROL— cuatro tablas que el
-- comité necesita igual:
--
--   `eje_sesiones`            la sesión misma (¡crear el borrador!)
--   `sesion_oficios_tratados` los oficios de la sesión (mig 051)
--   `region_meta_empleo`      objetivo y foco productivo de la región
--   `region_subsidio_empleo`  cupos de subsidios
--
-- Las cuatro exigen `up.role = 'regional'`. Nadie lo notó porque hasta ahora
-- todos los que operan comités son de rol `regional`, y porque las dos de Meta
-- Empleo ni siquiera tenían pantalla de escritura: la configuración se cargaba
-- por SQL y los acumulados los escribe el cierre de sesión con service role,
-- que no pasa por RLS. El modal «Meta Empleo» de la mig 109 fue la primera
-- escritura desde el navegador y destapó el desfase.
--
-- Tiene nombre y apellido en producción: hay un SEREMI de Tarapacá con
-- `comite.economico.operar`, y Tarapacá es justo la región donde el Comité
-- Económico está en marcha blanca. No puede ni abrir un borrador de sesión.
--
-- Se alinea la RLS con el gate de UI, que ya pregunta por la capacidad. Mismo
-- movimiento de la mig 092 con los ejes y de la 070 con las hijas. Para
-- `eje_sesiones` se usa `can_operar_instancia(instancia, region_cod)` (mig 070),
-- que traduce cada instancia a su capacidad: esta tabla es de los CINCO
-- comités, no solo del económico, así que la corrección los alcanza a todos.
--
-- Los admin/editor siguen cubiertos por sus políticas `_staff_all`, intactas.
--
-- Efecto colateral buscado: un `regional` SIN la capacidad deja de poder
-- escribir. No pierde nada que estuviera usando —la UI ya se lo negaba— y es
-- exactamente lo que promete el modelo de capas: el permiso se concede, no se
-- hereda del rol.
--
-- El DELETE no se toca en ninguna: donde existe pasa por rutas con service
-- role, que no ven RLS.
-- ============================================================================

-- ── eje_sesiones — la sesión misma, de los cinco comités ────────────────────
DROP POLICY IF EXISTS eje_sesiones_regional_insert ON public.eje_sesiones;
DROP POLICY IF EXISTS eje_sesiones_regional_update ON public.eje_sesiones;

CREATE POLICY eje_sesiones_operador_insert ON public.eje_sesiones
  FOR INSERT TO authenticated
  WITH CHECK (public.can_operar_instancia(instancia, region_cod));

CREATE POLICY eje_sesiones_operador_update ON public.eje_sesiones
  FOR UPDATE TO authenticated
  USING      (public.can_operar_instancia(instancia, region_cod))
  WITH CHECK (public.can_operar_instancia(instancia, region_cod));

-- ── sesion_oficios_tratados — oficios del Comité Económico (mig 051) ────────
DROP POLICY IF EXISTS sesion_oficios_regional_insert ON public.sesion_oficios_tratados;
DROP POLICY IF EXISTS sesion_oficios_regional_update ON public.sesion_oficios_tratados;

CREATE POLICY sesion_oficios_operador_insert ON public.sesion_oficios_tratados
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can('comite.economico.operar', region_cod));

CREATE POLICY sesion_oficios_operador_update ON public.sesion_oficios_tratados
  FOR UPDATE TO authenticated
  USING      (public.current_user_can('comite.economico.operar', region_cod))
  WITH CHECK (public.current_user_can('comite.economico.operar', region_cod));

-- ── region_meta_empleo ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS region_meta_empleo_regional_insert ON public.region_meta_empleo;
DROP POLICY IF EXISTS region_meta_empleo_regional_update ON public.region_meta_empleo;

CREATE POLICY region_meta_empleo_operador_insert ON public.region_meta_empleo
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can('comite.economico.operar', region_cod));

CREATE POLICY region_meta_empleo_operador_update ON public.region_meta_empleo
  FOR UPDATE TO authenticated
  USING      (public.current_user_can('comite.economico.operar', region_cod))
  WITH CHECK (public.current_user_can('comite.economico.operar', region_cod));

-- ── region_subsidio_empleo ──────────────────────────────────────────────────
DROP POLICY IF EXISTS region_subsidio_empleo_regional_insert ON public.region_subsidio_empleo;
DROP POLICY IF EXISTS region_subsidio_empleo_regional_update ON public.region_subsidio_empleo;

CREATE POLICY region_subsidio_empleo_operador_insert ON public.region_subsidio_empleo
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can('comite.economico.operar', region_cod));

CREATE POLICY region_subsidio_empleo_operador_update ON public.region_subsidio_empleo
  FOR UPDATE TO authenticated
  USING      (public.current_user_can('comite.economico.operar', region_cod))
  WITH CHECK (public.current_user_can('comite.economico.operar', region_cod));
