-- ============================================================================
-- 068_metricas_eje_enforce_capabilities.sql — Fase 2 RLS, área métricas de eje
--
-- Reescribe policies de escritura + el trigger de columna de metricas_eje para
-- gatear por CAPACIDAD en vez de rol:
--   - metrica.definir       (INSERT/DELETE/editar definición) — hoy admin/editor
--   - metrica.reportar_valor (UPDATE de valor_actual)         — hoy admin/editor + regional (scoped)
--
-- No-regresión: admin/editor tienen ambas caps 'all'; regional tiene solo
-- reportar_valor scoped a sus regiones; viewer ninguna. Reproduce exactamente el
-- acceso de hoy (el region-check del regional pasa del trigger a la propia cap
-- scoped — mismo resultado). La diferencia: conceder/revocar estas caps desde el
-- editor ahora tiene efecto real.
-- ============================================================================

-- ── INSERT / DELETE de definición → metrica.definir en la región de la fila ──
DROP POLICY IF EXISTS metricas_insert ON public.metricas_eje;
CREATE POLICY metricas_insert ON public.metricas_eje
  FOR INSERT TO public
  WITH CHECK (public.current_user_can('metrica.definir', region_cod));

DROP POLICY IF EXISTS metricas_delete ON public.metricas_eje;
CREATE POLICY metricas_delete ON public.metricas_eje
  FOR DELETE TO public
  USING (public.current_user_can('metrica.definir', region_cod));

-- ── INSERT regional de métrica que se reporta en sesión → reportar_valor ──
--    (misma condición de negocio de antes: se_reporta_en_sesion + eje con
--    sesiones habilitadas; el rol regional pasa a ser la cap scoped).
DROP POLICY IF EXISTS metricas_eje_regional_insert_sesion ON public.metricas_eje;
CREATE POLICY metricas_eje_regional_insert_sesion ON public.metricas_eje
  FOR INSERT TO authenticated
  WITH CHECK (
    se_reporta_en_sesion = true
    AND public.current_user_can('metrica.reportar_valor', region_cod)
    AND EXISTS (
      SELECT 1 FROM public.region_ejes re
      WHERE re.id = metricas_eje.eje_id AND re.sesiones_habilitadas
    ));

-- ── UPDATE (gate grueso) → tener definir O reportar_valor en la región ──
--    El trigger de abajo hace el control fino por columna.
DROP POLICY IF EXISTS metricas_update_by_role ON public.metricas_eje;
CREATE POLICY metricas_update_by_cap ON public.metricas_eje
  FOR UPDATE TO public
  USING (
    public.current_user_can('metrica.reportar_valor', region_cod)
    OR public.current_user_can('metrica.definir', region_cod))
  WITH CHECK (
    public.current_user_can('metrica.reportar_valor', region_cod)
    OR public.current_user_can('metrica.definir', region_cod));

-- ── Trigger de columna cap-aware ──
CREATE OR REPLACE FUNCTION public.metricas_eje_check_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Quien puede DEFINIR la métrica en su región edita cualquier columna.
  IF public.current_user_can('metrica.definir', OLD.region_cod) THEN
    RETURN NEW;
  END IF;

  -- Quien solo puede REPORTAR valor: únicamente valor_actual, y no si el valor
  -- se alimenta desde las sesiones.
  IF public.current_user_can('metrica.reportar_valor', OLD.region_cod) THEN
    IF NEW.titulo               IS DISTINCT FROM OLD.titulo               OR
       NEW.descripcion          IS DISTINCT FROM OLD.descripcion          OR
       NEW.objetivo             IS DISTINCT FROM OLD.objetivo             OR
       NEW.unidad               IS DISTINCT FROM OLD.unidad               OR
       NEW.region_cod           IS DISTINCT FROM OLD.region_cod           OR
       NEW.eje                  IS DISTINCT FROM OLD.eje                  OR
       NEW.eje_id               IS DISTINCT FROM OLD.eje_id               OR
       NEW.tipo                 IS DISTINCT FROM OLD.tipo                 OR
       NEW.se_reporta_en_sesion IS DISTINCT FROM OLD.se_reporta_en_sesion OR
       NEW.created_at           IS DISTINCT FROM OLD.created_at           OR
       NEW.created_by_email     IS DISTINCT FROM OLD.created_by_email     OR
       NEW.id                   IS DISTINCT FROM OLD.id                   THEN
      RAISE EXCEPTION 'solo puede modificar valor_actual en metricas_eje (la definición la cambia quien tiene metrica.definir)'
        USING ERRCODE = '42501';
    END IF;

    IF OLD.se_reporta_en_sesion AND NEW.valor_actual IS DISTINCT FROM OLD.valor_actual THEN
      RAISE EXCEPTION 'este valor se alimenta desde las sesiones (cierra una sesión para actualizarlo)'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'sin capacidad para modificar metricas_eje en %', OLD.region_cod
    USING ERRCODE = '42501';
END;
$function$;
