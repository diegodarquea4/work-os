-- ============================================================================
-- 070_sesiones_enforce_capabilities.sql — Fase 2 RLS, área sesiones/comités
--
-- Enforcement por CAPACIDAD del contenido de sesión (comite.<instancia>.operar).
-- Dos helpers SQL encapsulan el mapeo histórico instancia→cap (mismo que
-- lib/permissions: 'eje'=policial, 'inversion'=económico) para no repetir el CASE:
--   - can_operar_sesion(sesion_id)      → tablas enlazadas por sesion_id (join eje_sesiones)
--   - can_operar_instancia(inst, region) → tablas con instancia + region_cod directos
--
-- Las policies regionales pasan de `role='regional' AND <region>` a la cap
-- (role-agnóstico): habilita al regional en sus comités Y al futuro "Secretario
-- Ejecutivo" (viewer + una instancia). staff_all (admin/editor) queda intacto.
-- El DELETE preserva la restricción de sesión en 'borrador'.
--
-- No-regresión: staff full; regional tiene las 5 caps operar scoped a su región
-- (backfill), así que hoy opera igual. La diferencia: revocar una instancia desde
-- el editor ahora impide operar ESE comité aunque escriba directo a la BD.
-- ============================================================================

-- ── Helpers ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_operar_sesion(p_sesion_id bigint)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.eje_sesiones s
    WHERE s.id = p_sesion_id
      AND public.current_user_can(
        CASE s.instancia
          WHEN 'eje'             THEN 'comite.policial.operar'
          WHEN 'politico'        THEN 'comite.politico.operar'
          WHEN 'inversion'       THEN 'comite.economico.operar'
          WHEN 'gabinete'        THEN 'comite.gabinete.operar'
          WHEN 'infraestructura' THEN 'comite.infraestructura.operar'
          ELSE '__none__'
        END,
        s.region_cod))
$function$;

CREATE OR REPLACE FUNCTION public.can_operar_instancia(p_instancia text, p_region text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.current_user_can(
    CASE p_instancia
      WHEN 'eje'             THEN 'comite.policial.operar'
      WHEN 'politico'        THEN 'comite.politico.operar'
      WHEN 'inversion'       THEN 'comite.economico.operar'
      WHEN 'gabinete'        THEN 'comite.gabinete.operar'
      WHEN 'infraestructura' THEN 'comite.infraestructura.operar'
      ELSE '__none__'
    END,
    p_region)
$function$;

REVOKE ALL ON FUNCTION public.can_operar_sesion(bigint)         FROM public, anon;
REVOKE ALL ON FUNCTION public.can_operar_instancia(text, text)  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_operar_sesion(bigint)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_operar_instancia(text, text) TO authenticated, service_role;

-- ── Tablas enlazadas por sesion_id (select/insert/update/delete) ────────────
-- Se reescriben las policies regionales; staff_all queda intacto. DELETE exige
-- que la sesión esté en 'borrador' (igual que antes).
DO $mig$
DECLARE
  t text;
  tablas_sesion_id text[] := ARRAY[
    'sesion_temas','sesion_asistencia','sesion_iniciativas','sesion_apuntes',
    'sesion_comite_valor','sesion_proyectos','sesion_valores',
    'sesion_meta_empleo_valor','sesion_subsidio_empleo_valor'
  ];
BEGIN
  FOREACH t IN ARRAY tablas_sesion_id LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_regional_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_regional_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_regional_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_regional_delete', t);

    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
      USING (public.can_operar_sesion(sesion_id))$p$, t||'_operar_select', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
      WITH CHECK (public.can_operar_sesion(sesion_id))$p$, t||'_operar_insert', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
      USING (public.can_operar_sesion(sesion_id))
      WITH CHECK (public.can_operar_sesion(sesion_id))$p$, t||'_operar_update', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
      USING (public.can_operar_sesion(sesion_id)
             AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                         WHERE s.id = %I.sesion_id AND s.estado = 'borrador'))$p$,
      t||'_operar_delete', t, t);
  END LOOP;
END
$mig$;

-- ── Tablas con instancia + region_cod directos (compromisos, nomina) ────────
-- select/insert/update (sin delete regional en el modelo actual).
DROP POLICY IF EXISTS sesion_compromisos_regional_select ON public.sesion_compromisos;
DROP POLICY IF EXISTS sesion_compromisos_regional_insert ON public.sesion_compromisos;
DROP POLICY IF EXISTS sesion_compromisos_regional_update ON public.sesion_compromisos;
CREATE POLICY sesion_compromisos_operar_select ON public.sesion_compromisos
  FOR SELECT TO authenticated USING (public.can_operar_instancia(instancia, region_cod));
CREATE POLICY sesion_compromisos_operar_insert ON public.sesion_compromisos
  FOR INSERT TO authenticated WITH CHECK (public.can_operar_instancia(instancia, region_cod));
CREATE POLICY sesion_compromisos_operar_update ON public.sesion_compromisos
  FOR UPDATE TO authenticated
  USING (public.can_operar_instancia(instancia, region_cod))
  WITH CHECK (public.can_operar_instancia(instancia, region_cod));

DROP POLICY IF EXISTS sesion_nomina_regional_select ON public.sesion_nomina;
DROP POLICY IF EXISTS sesion_nomina_regional_insert ON public.sesion_nomina;
DROP POLICY IF EXISTS sesion_nomina_regional_update ON public.sesion_nomina;
CREATE POLICY sesion_nomina_operar_select ON public.sesion_nomina
  FOR SELECT TO authenticated USING (public.can_operar_instancia(instancia, region_cod));
CREATE POLICY sesion_nomina_operar_insert ON public.sesion_nomina
  FOR INSERT TO authenticated WITH CHECK (public.can_operar_instancia(instancia, region_cod));
CREATE POLICY sesion_nomina_operar_update ON public.sesion_nomina
  FOR UPDATE TO authenticated
  USING (public.can_operar_instancia(instancia, region_cod))
  WITH CHECK (public.can_operar_instancia(instancia, region_cod));
