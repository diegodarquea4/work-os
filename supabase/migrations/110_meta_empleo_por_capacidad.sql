-- ============================================================================
-- 110_meta_empleo_por_capacidad.sql
--
-- `region_meta_empleo` y `region_subsidio_empleo` nacieron en las migs 052/055,
-- antes del modelo de capas (migs 065-072), así que su RLS de escritura sigue
-- preguntando por el ROL de la persona:
--
--     up.role = 'regional' AND region_cod = ANY (up.region_cods)
--
-- Hasta la mig 109 eso no molestaba a nadie: ninguna pantalla escribía estas
-- tablas desde el navegador. La configuración (objetivo, foco productivo,
-- cupos) se cargaba por SQL, y los acumulados los escribe el cierre de sesión
-- con service role, que no pasa por RLS.
--
-- El modal «Meta Empleo» del Comité Económico es la primera escritura desde el
-- browser, y su gate de UI es la capacidad del módulo —
-- `comite.economico.operar`, igual que el resto del panel — que la RLS no
-- conoce. El desfase tiene nombre y apellido hoy en producción: hay un SEREMI
-- de Tarapacá con esa capacidad concedida, y Tarapacá es justamente la región
-- donde el Comité Económico está en marcha blanca. Vería el botón «Guardar» y
-- se llevaría un error crudo de la base.
--
-- Se alinea la RLS con el gate: escribe quien opera el comité EN ESA REGIÓN.
-- Mismo movimiento que la mig 092 hizo con los ejes, y la misma regla que ya
-- rige a `comite_economico_proyecto`. Los admin/editor siguen cubiertos por su
-- política `_staff_all`, que no se toca.
--
-- Efecto colateral buscado: un regional SIN la capacidad deja de poder
-- escribir. No pierde nada que estuviera usando — no hay pantalla que se lo
-- ofreciera — y es exactamente lo que el modelo de capas promete: el permiso
-- se concede, no se hereda del rol.
-- ============================================================================

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

-- Sin política de DELETE, igual que antes: estas filas son una por región y no
-- se borran desde la app.
